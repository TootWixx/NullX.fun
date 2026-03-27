// ================================================
//   NovaPROTECTED Bot — Full Platform Bot
//   Combines: Key Management (Supabase) +
//             Server Setup + Tickets + Moderation
//   Start: node src/index.js
// ================================================

import {
  Client, GatewayIntentBits, MessageFlags,
  REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionsBitField,
  Events,
} from 'discord.js';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ── Environment ───────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot   = join(__dirname, '..', '..');
const botEnv     = join(__dirname, '..', '.env');
const rootEnv    = join(repoRoot, '.env');
loadEnv({ path: rootEnv });
loadEnv({ path: botEnv, override: true });

const DISCORD_TOKEN           = process.env.DISCORD_BOT_TOKEN;
const APP_ID                  = process.env.DISCORD_APPLICATION_ID;
const GUILD_ID                = process.env.DISCORD_GUILD_ID;
const SUPABASE_URL            = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DISCORD_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Missing required env vars: DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ── Supabase ──────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Constants ─────────────────────────────────────────────────────────────────
const NOVA_RED   = 0xe74c3c;
const NOVA_DARK  = 0x1a1a2e;
const NOVA_GOLD  = 0xf39c12;
const NOVA_BLUE  = 0x3498db;
const NOVA_GREEN = 0x2ecc71;
const NOVA_GREY  = 0x95a5a6;

const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BATCH = 20;

/** @type {Map<string, { userId: string; panelKey: string; loggedInAt: number }>} */
const loginSessions = new Map();

/** In-memory warning store — swap for DB if persistence is needed */
const warnStore = new Map(); // userId → [{ reason, staffId, timestamp }]

// ── Server Structure Config ───────────────────────────────────────────────────
const ROLES = [
  {
    name: 'Owner',
    color: NOVA_RED,
    hoist: true,
    mentionable: false,
    permissions: ['Administrator'],
  },
  {
    name: 'Staff / Support',
    color: NOVA_BLUE,
    hoist: true,
    mentionable: true,
    permissions: [
      'ManageMessages', 'KickMembers', 'BanMembers',
      'ManageChannels', 'ViewChannel', 'SendMessages',
      'ReadMessageHistory', 'EmbedLinks',
    ],
  },
  {
    name: 'Customer',
    color: NOVA_GREEN,
    hoist: true,
    mentionable: false,
    permissions: [
      'ViewChannel', 'SendMessages', 'ReadMessageHistory',
      'EmbedLinks', 'AttachFiles',
    ],
  },
];

const CATEGORIES = [
  {
    name: '📌 NOVAPROTECTED',
    channels: [
      {
        name: '📢・announcements',
        topic: 'Official NovaPROTECTED updates, releases, and news.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
      },
      {
        name: '👋・welcome',
        topic: 'Welcome to NovaPROTECTED — the #1 security & distribution platform for Roblox script developers.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks'] },
        ],
        isWelcomeChannel: true,
      },
    ],
  },
  {
    name: '📋 INFORMATION',
    channels: [
      {
        name: '📋・documentation',
        topic: 'NovaPROTECTED API docs, integration guides, and obfuscation references.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
        isDocsChannel: true,
      },
      {
        name: '🛒・pricing',
        topic: 'Plans, pricing, and how to purchase NovaPROTECTED access.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks'] },
        ],
        isPricingChannel: true,
      },
    ],
  },
  {
    name: '💬 COMMUNITY',
    channels: [
      {
        name: '💬・general',
        topic: 'General chat for NovaPROTECTED developers.',
        permissions: [
          { role: '@everyone', allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] },
        ],
      },
      {
        name: '🛍️・showcase',
        topic: 'Show off your protected scripts and projects powered by NovaPROTECTED.',
        permissions: [
          { role: '@everyone', allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
      },
    ],
  },
  {
    name: '🎫 SUPPORT',
    channels: [
      {
        name: '📩・open-a-ticket',
        topic: 'Need help? Click below to open a support ticket with our team.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks'] },
        ],
        isTicketChannel: true,
      },
    ],
  },
  {
    name: '👑 CUSTOMER LOUNGE',
    channels: [
      {
        name: '🔑・customer-chat',
        topic: 'Exclusive chat for verified NovaPROTECTED customers.',
        permissions: [
          { role: '@everyone',      deny: ['ViewChannel'] },
          { role: 'Customer',        allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] },
          { role: 'Staff / Support', allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] },
          { role: 'Owner',           allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] },
        ],
      },
      {
        name: '📦・your-purchases',
        topic: 'License keys and purchase confirmations for verified customers.',
        permissions: [
          { role: '@everyone',      deny: ['ViewChannel'] },
          { role: 'Customer',        allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] },
          { role: 'Owner',           allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] },
        ],
      },
    ],
  },
  {
    name: '⚙️ STAFF ONLY',
    channels: [
      {
        name: '🛠️・staff-general',
        topic: 'Internal staff discussion.',
        permissions: [
          { role: '@everyone',      deny: ['ViewChannel'] },
          { role: 'Staff / Support', allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] },
          { role: 'Owner',           allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] },
        ],
      },
      {
        name: '📋・ticket-logs',
        topic: 'Closed ticket transcripts and logs.',
        permissions: [
          { role: '@everyone',      deny: ['ViewChannel'] },
          { role: 'Staff / Support', allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Owner',           allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] },
        ],
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
//   EMBED BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

function buildWelcomeEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_RED)
    .setTitle('🛡️ Welcome to NovaPROTECTED')
    .setDescription(
      '**The all-in-one security & distribution platform for Roblox script developers.**\n\n' +
      'Whether you\'re here to protect your scripts, sell access, or get support — you\'ve come to the right place.\n\u200b'
    )
    .addFields(
      {
        name: '🔒 Advanced Lua Obfuscation',
        value:
          'XOR string encryption, control flow flattening, and variable renaming — running on our Edge Functions. ' +
          'Auto-injects a polished login UI into your script before obfuscating. Zero coding required.',
        inline: false,
      },
      {
        name: '🔑 Key Validation & HWID Locking',
        value:
          'Generate and manage license keys scoped to your projects. Keys lock to the buyer\'s hardware on first use. ' +
          'Set usage limits and expiry dates for trials or time-limited access.',
        inline: false,
      },
      {
        name: '📊 Real-Time Analytics & Webhooks',
        value:
          'Full telemetry on every execution — IP, ISP, location, OS, and HWID — delivered to your Discord ' +
          'via formatted webhook logs the moment a user authenticates.',
        inline: false,
      },
      {
        name: '💸 Built-in Monetization',
        value:
          'Force users through LootLabs & Linkvertise checkpoints to generate their keys. ' +
          'Gatekeeper monetization built directly into the key-generation flow.',
        inline: false,
      },
      {
        name: '🚫 Blacklisting & Remote Kill',
        value:
          'Ban by IP, HWID, or key. Disable a project and instantly cut off every active user worldwide — ' +
          'no re-deployment needed. Automatic permanent blacklist triggers on detected key sharing.',
        inline: false,
      },
      {
        name: '\u200b',
        value:
          '📋 Browse **#📋・documentation** to get started\n' +
          '🛒 Check **#🛒・pricing** for plans\n' +
          '🎫 Need help? Open a ticket in **#📩・open-a-ticket**',
        inline: false,
      }
    )
    .setFooter({ text: 'NovaPROTECTED • Secure. Distribute. Dominate.' })
    .setTimestamp();
}

function buildTicketEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_RED)
    .setTitle('🎫 NovaPROTECTED Support')
    .setDescription(
      'Need help with your integration, keys, or billing?\n\n' +
      'Click the button below to open a **private support ticket**. ' +
      'A member of our Staff / Support team will assist you as soon as possible.\n\u200b'
    )
    .addFields({
      name: '📌 Before opening a ticket, please have ready:',
      value:
        '• Your **Project ID** or script name\n' +
        '• A clear description of your issue\n' +
        '• Any relevant error messages or screenshots',
      inline: false,
    })
    .setFooter({ text: 'NovaPROTECTED Support System' })
    .setTimestamp();
}

function buildTicketButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_ticket')
      .setLabel('📩 Open a Ticket')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildSetupSuccessEmbed(channelCount, roleCount) {
  return new EmbedBuilder()
    .setColor(NOVA_GREEN)
    .setTitle('✅ Server Setup Complete')
    .setDescription('NovaPROTECTED server structure has been successfully built.')
    .addFields(
      { name: '📁 Categories & Channels', value: `${channelCount} channels created`, inline: true },
      { name: '🏷️ Roles',                 value: `${roleCount} roles created`,       inline: true },
    )
    .setFooter({ text: 'NovaPROTECTED Setup' })
    .setTimestamp();
}

function buildPricingEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_RED)
    .setTitle('💎 NovaPROTECTED — Plans & Pricing')
    .setDescription(
      'All plans include core key generation, HWID locking, and Discord webhook logs. ' +
      'Higher tiers unlock the serious firepower.\n\u200b'
    )
    .addFields(
      {
        name: '🆓 Starter — Free',
        value:
          'Perfect for testing the waters or solo projects.\n' +
          '• **1 project** slot\n' +
          '• Key generation & HWID locking\n' +
          '• Usage limits & expiry dates per key\n' +
          '• Discord webhook logs\n' +
          '• Community support\n\u200b',
        inline: false,
      },
      {
        name: '⚡ Pro — $15/month',
        value:
          'The go-to for developers actively selling scripts.\n' +
          '• **5 project** slots\n' +
          '• Everything in Starter, plus:\n' +
          '• **Auto-Obfuscation** — XOR encryption, control flow flattening, variable renaming\n' +
          '• **Auto-Embedded Auth UI** — injected login screen, zero coding needed\n' +
          '• **Active Player Tracker** — live view of who\'s running your scripts\n' +
          '• Full player telemetry (IP, ISP, location, OS, HWID)\n' +
          '• Priority community support\n\u200b',
        inline: false,
      },
      {
        name: '👑 Developer — $35/month',
        value:
          'Built for serious devs running a real operation.\n' +
          '• **Unlimited** project slots\n' +
          '• Everything in Pro, plus:\n' +
          '• **Remote Kill-Switch** — cut any user\'s session instantly, worldwide\n' +
          '• **Checkpoint API** — LootLabs & Linkvertise monetization built-in\n' +
          '• **Project-scoped key binding** — keys cannot cross between your scripts\n' +
          '• **Direct bot support** from our team\n\u200b',
        inline: false,
      },
      {
        name: '📌 Good to know',
        value:
          'Upgrading is seamless — you only pay the difference between tiers. ' +
          'All plans bill monthly with no long-term commitment. Your data is never deleted if you cancel.',
        inline: false,
      }
    )
    .setFooter({ text: 'NovaPROTECTED • Open a ticket to purchase' })
    .setTimestamp();
}

function buildPricingButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('purchase_starter')
      .setLabel('🆓 Starter (Free)')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('purchase_pro')
      .setLabel('⚡ Pro — $15/mo')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('purchase_developer')
      .setLabel('👑 Developer — $35/mo')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildDocsGettingStartedEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_BLUE)
    .setTitle('🚀 Getting Started with NovaPROTECTED')
    .setDescription('From zero to a fully protected, monetized script in a few steps.\n\u200b')
    .addFields(
      {
        name: 'Step 1 — Create your account',
        value:
          'Head to the dashboard and register. Pick your plan from the **Store** tab. ' +
          'After purchase, your **UPanel Master Key** is issued automatically — keep it safe, it\'s your root credential.\n\u200b',
        inline: false,
      },
      {
        name: 'Step 2 — Protect your first script',
        value:
          'Go to the **Obfuscate** tab and upload your raw `.lua` file. Before obfuscating, the system auto-injects:\n\n' +
          '• **Auth UI** — a clean login screen your users see on launch\n' +
          '• **Shadow Tracker** — heartbeat pings keeping the session alive and monitored\n\n' +
          'Hit **Obfuscate** and you\'ll get a `loadstring` to drop into your loader. That\'s it.\n\u200b',
        inline: false,
      },
      {
        name: 'Step 3 — Generate & distribute keys',
        value:
          'Head to the **Keys** tab under your project. Generate keys in bulk or one at a time. ' +
          'Each key is **project-scoped** (it can\'t unlock a different script) and auto-locks to the buyer\'s hardware (HWID) on first use. ' +
          'Set usage limits or expiration dates for trial keys — no extra setup needed.\n\u200b',
        inline: false,
      }
    )
    .setFooter({ text: 'NovaPROTECTED Docs • Use /docs for more sections' })
    .setTimestamp();
}

function buildDocsAdvancedEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_RED)
    .setTitle('🔧 Advanced Features — The Hard Stuff Made Easy')
    .setDescription('Once you\'re set up, here\'s how to get the most out of the platform.\n\u200b')
    .addFields(
      {
        name: '🛡️ Remote Session Management (Pro & Developer)',
        value:
          'The **Active Player Tracker** shows a live feed of everyone running your script — ' +
          'IP, ISP, location, OS, and HWID. If someone\'s violating your terms:\n\n' +
          '• **Kill Session** — terminates their script and kicks from the game immediately\n' +
          '• **Live Messaging** — push a notification directly to their screen\n\u200b',
        inline: false,
      },
      {
        name: '💀 HWID & Key Locking',
        value:
          'Keys bind to hardware on first use. Buyers can reset their HWID link **once every 30 days** from dashboard settings.\n\n' +
          '⚠️ Detected key sharing triggers an **automatic permanent blacklist** — no appeals.\n\u200b',
        inline: false,
      },
      {
        name: '🚫 Granular Blacklisting',
        value:
          'Ban malicious actors by **IP address**, **HWID**, or **license key**. ' +
          'Because all validation pings the NovaPROTECTED API, disabling a key or an entire project ' +
          'instantly shuts down access for every active user worldwide — no re-deployment required.\n\u200b',
        inline: false,
      },
      {
        name: '💻 Executor Compatibility',
        value:
          'Tested and optimized for all major executors (Synapse, Fluxus, etc.).\n\n' +
          '**Common issue:** Seeing `Failed to reach API`? Your antivirus or firewall is blocking the connection. ' +
          'Add an exclusion for your executor and retry.\n\u200b',
        inline: false,
      },
      {
        name: '💸 Checkpoint API (Developer only)',
        value:
          'Force users through a LootLabs or Linkvertise paywall before generating their key. ' +
          'Configure in your project settings — the API handles verification automatically.\n\u200b',
        inline: false,
      }
    )
    .setFooter({ text: 'NovaPROTECTED Docs • Advanced Section' })
    .setTimestamp();
}

function buildDocsRoadmapEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_GOLD)
    .setTitle('🗺️ What\'s Coming to NovaPROTECTED')
    .setDescription('Here\'s what\'s in development — no vague promises, just actual features being built.\n\u200b')
    .addFields(
      {
        name: '🌐 Global Ban Network',
        value: 'A shared blacklist across all NovaPROTECTED projects. Ban a bad actor once — blocked everywhere.\n\u200b',
        inline: false,
      },
      {
        name: '🎨 UI Theme Engine',
        value: 'Custom skins for your Auth UI. Dark mode, light mode, glassmorphism — your login screen, your brand.\n\u200b',
        inline: false,
      },
      {
        name: '🏪 Reseller API',
        value: 'Automated key reselling through Shoppy and Sellix. Sell while you sleep.\n\u200b',
        inline: false,
      },
      {
        name: '📱 Mobile Dashboard',
        value: 'Manage sessions, kill switches, and key inventory from your phone. Full control, anywhere.\n\u200b',
        inline: false,
      }
    )
    .setFooter({ text: 'NovaPROTECTED • Roadmap subject to change' })
    .setTimestamp();
}

function buildDocsFAQEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_BLUE)
    .setTitle('❓ Frequently Asked Questions')
    .setDescription('The questions we get asked the most — answered straight.\n\u200b')
    .addFields(
      {
        name: 'Can I upgrade my tier later?',
        value: 'Yes. You only pay the difference between your current plan and the new one.\n\u200b',
        inline: false,
      },
      {
        name: 'Are keys limited per project?',
        value:
          'No hard cap on keys — generate as many as your project needs. ' +
          'Usage limits and expiry dates are configurable per key from your dashboard. ' +
          'Keys are project-scoped and cannot be used to unlock a different script.\n\u200b',
        inline: false,
      },
      {
        name: 'Can someone bypass the obfuscation?',
        value:
          'No system is unbreakable, but ours makes it genuinely not worth the effort. ' +
          'XOR encryption, control flow flattening, and variable renaming stack together to make your script effectively unreadable.\n\u200b',
        inline: false,
      },
      {
        name: 'What happens if I cancel my plan?',
        value: 'Your projects stay active until the end of your billing cycle. After that, you drop to Starter limits. Your data is never deleted.\n\u200b',
        inline: false,
      },
      {
        name: 'Do end users need to install anything?',
        value: 'No. The Auth UI is injected directly into your script — users just run the loadstring as normal.\n\u200b',
        inline: false,
      },
      {
        name: 'What telemetry is collected on my users?',
        value: 'IP address, ISP, city/country, operating system, and HWID — all delivered to your Discord webhook on each authentication.\n\u200b',
        inline: false,
      }
    )
    .setFooter({ text: 'NovaPROTECTED • Still have questions? Open a ticket.' })
    .setTimestamp();
}

function buildPurchaseTicketEmbed(user, plan) {
  const plans = {
    starter:   { label: '🆓 Starter',   price: 'Free',      color: NOVA_GREY },
    pro:       { label: '⚡ Pro',        price: '$15/month', color: NOVA_BLUE },
    developer: { label: '👑 Developer',  price: '$35/month', color: NOVA_GOLD },
  };
  const p = plans[plan] || plans.pro;

  return new EmbedBuilder()
    .setColor(p.color)
    .setTitle(`${p.label} — Purchase Request`)
    .setDescription(
      `Hey ${user}, thanks for your interest in the **${p.label}** plan!\n\n` +
      'A member of our team will be with you shortly to process your purchase.\n\u200b'
    )
    .addFields(
      { name: '📦 Plan',  value: p.label,  inline: true },
      { name: '💰 Price', value: p.price,  inline: true },
      { name: '\u200b',   value: '\u200b', inline: true },
      {
        name: '📌 While you wait, have ready:',
        value:
          '• Your preferred payment method\n' +
          '• Your Discord account (for role assignment)\n' +
          '• Any questions about the plan',
        inline: false,
      }
    )
    .setFooter({ text: 'NovaPROTECTED • Purchase Support' })
    .setTimestamp();
}

// ═══════════════════════════════════════════════════════════════════════════════
//   SUPABASE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function isOperator(discordUserId) {
  const { data, error } = await supabase
    .from('discord_bot_operators')
    .select('discord_user_id')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();
  return !error && !!data;
}

async function verifyPanelKey(panelKey) {
  const { data, error } = await supabase
    .from('user_panel_keys')
    .select('user_id, panel_key')
    .eq('panel_key', panelKey)
    .maybeSingle();
  if (error || !data?.user_id) return null;
  return data;
}

async function linkDiscordConnection(userId, discordUser) {
  await supabase.from('discord_connections').upsert({
    user_id: userId,
    discord_user_id: discordUser.id,
    discord_username: discordUser.username || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

async function getProjectsForUser(userId) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .eq('user_id', userId)
    .order('name');
  if (error) return [];
  return data || [];
}

// ── Key helpers ───────────────────────────────────────────────────────────────
function randomKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part  = () => Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part()}-${part()}-${part()}-${part()}-${part()}`;
}

function displayNameForProject(project, allWithSameName) {
  const name = project.name || 'Untitled';
  if (allWithSameName.length > 1) return `${name} (${project.id.slice(0, 8)}…)`.slice(0, 100);
  return name.slice(0, 100);
}

// ── Warning helpers ───────────────────────────────────────────────────────────
function addWarning(userId, reason, staffId) {
  if (!warnStore.has(userId)) warnStore.set(userId, []);
  warnStore.get(userId).push({ reason, staffId, timestamp: Date.now() });
  return warnStore.get(userId).length;
}
function getWarnings(userId)  { return warnStore.get(userId) || []; }
function clearWarnings(userId) { warnStore.delete(userId); }

// ═══════════════════════════════════════════════════════════════════════════════
//   SLASH COMMAND DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const commands = [

  // ── Auth ──────────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('login')
    .setDescription('Sign in to the bot using your UPanel key')
    .addStringOption(o =>
      o.setName('upanel_key').setDescription('Your UPanel key').setRequired(true)),

  // ── Key Management ────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('nova')
    .setDescription('NovaPROTECTED key management (requires /login)')
    .addSubcommand(s =>
      s.setName('generate')
        .setDescription('Generate randomized keys for a project (1–20)')
        .addStringOption(o =>
          o.setName('project').setDescription('Your project — type to search').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o =>
          o.setName('quantity').setDescription('How many keys to generate (1–20)').setRequired(true).setMinValue(1).setMaxValue(MAX_BATCH)))
    .addSubcommand(s =>
      s.setName('freeze')
        .setDescription('Freeze a license key')
        .addStringOption(o => o.setName('key').setDescription('License key').setRequired(true)))
    .addSubcommand(s =>
      s.setName('unfreeze')
        .setDescription('Unfreeze a license key')
        .addStringOption(o => o.setName('key').setDescription('License key').setRequired(true)))
    .addSubcommand(s =>
      s.setName('remove')
        .setDescription('Permanently remove a license key')
        .addStringOption(o => o.setName('key').setDescription('License key').setRequired(true))),

  // ── Info ──────────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('pricing')
    .setDescription('💎 View NovaPROTECTED plans and pricing'),

  new SlashCommandBuilder()
    .setName('docs')
    .setDescription('📋 Browse NovaPROTECTED documentation')
    .addStringOption(o =>
      o.setName('section').setDescription('Which section to view').setRequired(false)
        .addChoices(
          { name: 'Getting Started',   value: 'getting_started' },
          { name: 'Advanced Features', value: 'advanced' },
          { name: 'Roadmap',           value: 'roadmap' },
          { name: 'FAQ',               value: 'faq' },
        )),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('📡 Check NovaPROTECTED API and bot status'),

  // ── Customer Management ───────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('addcustomer')
    .setDescription('✅ Grant Customer role to a user (Staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('user').setDescription('The user to verify').setRequired(true))
    .addStringOption(o =>
      o.setName('plan').setDescription('Which plan they purchased').setRequired(true)
        .addChoices(
          { name: 'Starter (Free)',     value: 'starter' },
          { name: 'Pro ($15/mo)',       value: 'pro' },
          { name: 'Developer ($35/mo)', value: 'developer' },
        )),

  new SlashCommandBuilder()
    .setName('removecustomer')
    .setDescription('❌ Revoke Customer role from a user (Staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('user').setDescription('The user to remove').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for removal').setRequired(false)),

  // ── Announcements ─────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('📢 Post a formatted announcement (Staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('message').setDescription('The announcement text').setRequired(true))
    .addStringOption(o => o.setName('title').setDescription('Embed title (optional)').setRequired(false)),

  // ── Moderation ────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('⚠️ Warn a user (Staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('📋 View a user\'s warnings (Staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true)),

  new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('🧹 Clear all warnings for a user (Staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to clear').setRequired(true)),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('👢 Kick a user from the server (Staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for kick').setRequired(false)),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('🔨 Ban a user from the server (Staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for ban').setRequired(false)),

  // ── Tickets ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('closeticket')
    .setDescription('🔒 Close the current support or purchase ticket'),

  // ── Server Setup (Owner only) ─────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('🛡️ Build the full NovaPROTECTED server structure (Owner only)'),

  // ── Server Reset (Owner only) ─────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('resetserver')
    .setDescription('💥 WIPE and rebuild the entire server structure from scratch (Owner only)'),

].map(c => c.toJSON());

// ═══════════════════════════════════════════════════════════════════════════════
//   COMMAND REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

async function registerCommands() {
  if (!APP_ID) {
    console.warn('⚠️  DISCORD_APPLICATION_ID not set — skipping slash registration');
    return;
  }
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(APP_ID, GUILD_ID), { body: commands });
    console.log(`✅ Slash commands registered on guild ${GUILD_ID}`);
  } else {
    await rest.put(Routes.applicationCommands(APP_ID), { body: commands });
    console.log('✅ Slash commands registered globally (may take up to 1 hour to propagate)');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//   SERVER SETUP HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const roleMap = {};

function resolvePerms(arr) {
  if (!arr?.length) return [];
  return arr.map(p => PermissionFlagsBits[p]).filter(Boolean);
}

function buildOverwrites(guild, channelPerms) {
  if (!channelPerms) return [];
  return channelPerms.map(entry => {
    const allow = resolvePerms(entry.allow);
    const deny  = resolvePerms(entry.deny);
    if (entry.role === '@everyone') return { id: guild.roles.everyone, allow, deny };
    const role = roleMap[entry.role];
    if (!role) { console.warn(`  ⚠ Role not found: ${entry.role}`); return null; }
    return { id: role.id, allow, deny };
  }).filter(Boolean);
}

async function createRoles(guild) {
  for (const def of ROLES) {
    const existing = guild.roles.cache.find(r => r.name === def.name);
    if (existing) { roleMap[def.name] = existing; continue; }
    const role = await guild.roles.create({
      name: def.name, color: def.color, hoist: def.hoist,
      mentionable: def.mentionable, permissions: resolvePerms(def.permissions),
      reason: 'NovaPROTECTED setup',
    });
    roleMap[def.name] = role;
    console.log(`  ✅ Role created: ${role.name}`);
  }
}

async function createChannels(guild) {
  let channelCount = 0;
  let welcomeChannel = null, ticketChannel = null, docsChannel = null, pricingChannel = null;

  for (const catDef of CATEGORIES) {
    let category = guild.channels.cache.find(
      c => c.name === catDef.name && c.type === ChannelType.GuildCategory
    );
    if (!category) {
      category = await guild.channels.create({
        name: catDef.name, type: ChannelType.GuildCategory,
        reason: 'NovaPROTECTED setup',
      });
    }

    for (const chDef of catDef.channels) {
      const existing = guild.channels.cache.find(
        c => c.name === chDef.name && c.parentId === category.id
      );
      if (existing) {
        if (chDef.isWelcomeChannel)  welcomeChannel  = existing;
        if (chDef.isTicketChannel)   ticketChannel   = existing;
        if (chDef.isDocsChannel)     docsChannel     = existing;
        if (chDef.isPricingChannel)  pricingChannel  = existing;
        continue;
      }

      const channel = await guild.channels.create({
        name: chDef.name, type: ChannelType.GuildText,
        parent: category.id, topic: chDef.topic || '',
        permissionOverwrites: buildOverwrites(guild, chDef.permissions),
        reason: 'NovaPROTECTED setup',
      });
      channelCount++;
      console.log(`    ✅ Channel created: ${channel.name}`);

      if (chDef.isWelcomeChannel)  welcomeChannel  = channel;
      if (chDef.isTicketChannel)   ticketChannel   = channel;
      if (chDef.isDocsChannel)     docsChannel     = channel;
      if (chDef.isPricingChannel)  pricingChannel  = channel;
    }
  }
  return { channelCount, welcomeChannel, ticketChannel, docsChannel, pricingChannel };
}

async function postSetupEmbeds(welcomeChannel, ticketChannel, docsChannel, pricingChannel) {
  if (welcomeChannel) {
    await welcomeChannel.send({ embeds: [buildWelcomeEmbed()] });
  }
  if (ticketChannel) {
    await ticketChannel.send({ embeds: [buildTicketEmbed()], components: [buildTicketButton()] });
  }
  if (docsChannel) {
    await docsChannel.send({ embeds: [buildDocsGettingStartedEmbed()] });
    await docsChannel.send({ embeds: [buildDocsAdvancedEmbed()] });
    await docsChannel.send({ embeds: [buildDocsFAQEmbed()] });
    await docsChannel.send({ embeds: [buildDocsRoadmapEmbed()] });
  }
  if (pricingChannel) {
    await pricingChannel.send({ embeds: [buildPricingEmbed()], components: [buildPricingButtons()] });
  }
}

async function runSetup(interaction) {
  const guild = interaction.guild;
  if (interaction.user.id !== guild.ownerId) {
    return interaction.reply({ content: '❌ Only the **server owner** can run `/setup`.', ephemeral: true });
  }

  await interaction.reply({ content: '⚙️ Setting up your NovaPROTECTED server… This may take a moment.', ephemeral: true });
  console.log(`\n🛡️  Running setup on guild: ${guild.name}`);

  try {
    await createRoles(guild);
    const { channelCount, welcomeChannel, ticketChannel, docsChannel, pricingChannel } = await createChannels(guild);
    await postSetupEmbeds(welcomeChannel, ticketChannel, docsChannel, pricingChannel);
    const roleCount = Object.keys(roleMap).length;
    await interaction.editReply({ embeds: [buildSetupSuccessEmbed(channelCount, roleCount)], content: '' });
    console.log(`✅ Setup complete. ${channelCount} channels, ${roleCount} roles.\n`);
  } catch (err) {
    console.error('❌ Setup error:', err);
    await interaction.editReply({
      content: `❌ Setup failed: \`${err.message}\`\n\nMake sure the bot has **Administrator** permissions.`,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//   SERVER RESET
// ═══════════════════════════════════════════════════════════════════════════════

async function runServerReset(interaction) {
  const guild = interaction.guild;

  // Hard guard — server owner only
  if (interaction.user.id !== guild.ownerId) {
    return interaction.reply({
      content: '❌ Only the **server owner** can run `/resetserver`.',
      ephemeral: true,
    });
  }

  await interaction.reply({
    content:
      '⚠️ **FULL SERVER RESET INITIATED**\n' +
      'Deleting all channels and roles, then rebuilding from scratch.\n' +
      '> This may take up to a minute…',
    ephemeral: true,
  });

  console.log(`\n💥  Full server reset started on guild: ${guild.name}`);

  try {
    // ── 1. Delete all channels (except the one we're currently in so we can reply) ──
    const channels = [...guild.channels.cache.values()];
    for (const ch of channels) {
      if (ch.id === interaction.channelId) continue; // keep ephemeral reply alive
      await ch.delete('NovaPROTECTED server reset').catch(() => {});
    }

    // ── 2. Delete all non-default roles (skip @everyone and the bot's own top role) ──
    await guild.roles.fetch();
    const botMember = await guild.members.fetchMe();
    const botTopPos = botMember.roles.highest.position;
    const roles = [...guild.roles.cache.values()].filter(
      r => r.id !== guild.roles.everyone.id && r.position < botTopPos
    );
    for (const r of roles) {
      await r.delete('NovaPROTECTED server reset').catch(() => {});
    }

    // Clear the cached roleMap so setup starts fresh
    for (const key of Object.keys(roleMap)) delete roleMap[key];

    // ── 3. Re-run full setup ───────────────────────────────────────────────────
    await createRoles(guild);
    const { channelCount, welcomeChannel, ticketChannel, docsChannel, pricingChannel } = await createChannels(guild);
    await postSetupEmbeds(welcomeChannel, ticketChannel, docsChannel, pricingChannel);
    const roleCount = Object.keys(roleMap).length;

    // ── 4. Try to DM the owner with the result ────────────────────────────────
    const successEmbed = new EmbedBuilder()
      .setColor(NOVA_GREEN)
      .setTitle('💥 Server Reset Complete')
      .setDescription('All channels and roles were wiped and rebuilt from scratch.')
      .addFields(
        { name: '📁 Channels Created', value: `${channelCount}`, inline: true },
        { name: '🏷️ Roles Created',    value: `${roleCount}`,    inline: true },
      )
      .setFooter({ text: 'NovaPROTECTED Reset' })
      .setTimestamp();

    await interaction.user.send({ embeds: [successEmbed] }).catch(() => {});
    console.log(`✅ Server reset complete. ${channelCount} channels, ${roleCount} roles.\n`);
  } catch (err) {
    console.error('❌ Server reset error:', err);
    await interaction.user.send({
      content: `❌ Server reset encountered an error: \`${err.message}\`\nPartial reset may have occurred — run \`/setup\` to fill in any missing channels.`,
    }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//   TICKET HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleSupportTicketOpen(interaction) {
  const guild = interaction.guild;
  const user  = interaction.user;

  const existing = guild.channels.cache.find(
    c => c.name === `ticket-${user.username.toLowerCase()}`
  );
  if (existing) {
    return interaction.reply({ content: `❌ You already have an open ticket: ${existing}`, ephemeral: true });
  }

  let ticketCategory = guild.channels.cache.find(
    c => c.name === '🎟️ TICKETS' && c.type === ChannelType.GuildCategory
  );
  if (!ticketCategory) {
    ticketCategory = await guild.channels.create({
      name: '🎟️ TICKETS', type: ChannelType.GuildCategory,
      permissionOverwrites: [{ id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] }],
      reason: 'NovaPROTECTED ticket system',
    });
  }

  const staffRole = guild.roles.cache.find(r => r.name === 'Staff / Support');
  const ownerRole = guild.roles.cache.find(r => r.name === 'Owner');

  const overwrites = [
    { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (staffRole) overwrites.push({ id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
  if (ownerRole) overwrites.push({ id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });

  const ticketChannel = await guild.channels.create({
    name: `ticket-${user.username.toLowerCase()}`,
    type: ChannelType.GuildText,
    parent: ticketCategory.id,
    permissionOverwrites: overwrites,
    reason: `Support ticket for ${user.tag}`,
  });

  const embed = new EmbedBuilder()
    .setColor(NOVA_RED)
    .setTitle('🎫 Support Ticket')
    .setDescription(
      `Hey ${user}, our **Staff / Support** team will be with you shortly.\n\n` +
      'Give us as much detail as you can about your issue — it\'ll speed things up.\n\u200b'
    )
    .addFields({
      name: '📌 Helpful to include:',
      value:
        '• Your **Project ID** or script name\n' +
        '• What you expected vs. what happened\n' +
        '• Any error messages or screenshots',
    })
    .setFooter({ text: 'NovaPROTECTED Support • Click 🔒 Close when resolved' })
    .setTimestamp();

  const closeBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('🔒 Close Ticket')
      .setStyle(ButtonStyle.Secondary)
  );

  await ticketChannel.send({
    content: `${user}${staffRole ? ` ${staffRole}` : ''}`,
    embeds: [embed],
    components: [closeBtn],
  });

  await interaction.reply({ content: `✅ Ticket opened: ${ticketChannel}`, ephemeral: true });
}

async function handleCloseTicketButton(interaction) {
  const channel = interaction.channel;
  if (!channel.name.startsWith('ticket-') && !channel.name.startsWith('purchase-')) return;

  await interaction.reply({ content: '🔒 Closing ticket in 5 seconds…' });

  try {
    const logChannel = interaction.guild.channels.cache.find(c => c.name.includes('ticket-logs'));
    if (logChannel) {
      const messages  = await channel.messages.fetch({ limit: 100 });
      const sorted    = [...messages.values()].reverse();
      const transcript = sorted
        .map(m => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content || '[embed]'}`)
        .join('\n');

      const transcriptEmbed = new EmbedBuilder()
        .setColor(NOVA_GREY)
        .setTitle(`📋 Transcript — #${channel.name}`)
        .setDescription(`\`\`\`\n${transcript.slice(0, 4000)}\n\`\`\``)
        .setTimestamp();

      await logChannel.send({ embeds: [transcriptEmbed] });
    }
  } catch { /* fail silently */ }

  setTimeout(() => channel.delete('Ticket closed').catch(console.error), 5000);
}

async function handlePurchaseButton(interaction, plan) {
  const guild = interaction.guild;
  const user  = interaction.user;

  const channelName = `purchase-${user.username.toLowerCase()}`;
  const existing = guild.channels.cache.find(c => c.name === channelName);
  if (existing) {
    return interaction.reply({ content: `❌ You already have an open purchase ticket: ${existing}`, ephemeral: true });
  }

  let ticketCategory = guild.channels.cache.find(
    c => c.name === '🎟️ TICKETS' && c.type === ChannelType.GuildCategory
  );
  if (!ticketCategory) {
    ticketCategory = await guild.channels.create({
      name: '🎟️ TICKETS', type: ChannelType.GuildCategory,
      permissionOverwrites: [{ id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] }],
      reason: 'NovaPROTECTED ticket system',
    });
  }

  const staffRole = guild.roles.cache.find(r => r.name === 'Staff / Support');
  const ownerRole = guild.roles.cache.find(r => r.name === 'Owner');

  const overwrites = [
    { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (staffRole) overwrites.push({ id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
  if (ownerRole) overwrites.push({ id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });

  const purchaseChannel = await guild.channels.create({
    name: channelName, type: ChannelType.GuildText,
    parent: ticketCategory.id, permissionOverwrites: overwrites,
    reason: `Purchase ticket for ${user.tag}`,
  });

  const closeBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('🔒 Close Ticket')
      .setStyle(ButtonStyle.Secondary)
  );

  await purchaseChannel.send({
    content: `${user}${staffRole ? ` ${staffRole}` : ''}`,
    embeds: [buildPurchaseTicketEmbed(user, plan)],
    components: [closeBtn],
  });

  await interaction.reply({ content: `✅ Purchase ticket opened: ${purchaseChannel}`, ephemeral: true });
}

async function handleCloseTicketCommand(interaction) {
  const channel = interaction.channel;
  if (!channel.name.startsWith('ticket-') && !channel.name.startsWith('purchase-')) {
    return interaction.reply({ content: '❌ This command can only be used inside a ticket channel.', ephemeral: true });
  }
  await interaction.reply({ content: '🔒 Closing this ticket in 5 seconds…' });

  try {
    const logChannel = interaction.guild.channels.cache.find(c => c.name.includes('ticket-logs'));
    if (logChannel) {
      const messages  = await channel.messages.fetch({ limit: 100 });
      const sorted    = [...messages.values()].reverse();
      const transcript = sorted
        .map(m => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content || '[embed]'}`)
        .join('\n');

      const transcriptEmbed = new EmbedBuilder()
        .setColor(NOVA_GREY)
        .setTitle(`📋 Transcript — #${channel.name}`)
        .setDescription(`\`\`\`\n${transcript.slice(0, 4000)}\n\`\`\``)
        .setTimestamp();

      await logChannel.send({ embeds: [transcriptEmbed] });
    }
  } catch { /* fail silently */ }

  setTimeout(() => channel.delete('Ticket closed').catch(console.error), 5000);
}

// ═══════════════════════════════════════════════════════════════════════════════
//   COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

async function handlePricing(interaction) {
  await interaction.reply({ embeds: [buildPricingEmbed()], components: [buildPricingButtons()] });
}

async function handleDocs(interaction) {
  const section = interaction.options.getString('section') || 'getting_started';
  const embedMap = {
    getting_started: buildDocsGettingStartedEmbed(),
    advanced:        buildDocsAdvancedEmbed(),
    roadmap:         buildDocsRoadmapEmbed(),
    faq:             buildDocsFAQEmbed(),
  };
  await interaction.reply({ embeds: [embedMap[section] || buildDocsGettingStartedEmbed()] });
}

async function handleStatus(interaction) {
  const start = Date.now();
  await supabase.from('projects').select('id').limit(1);
  const latency = Date.now() - start;

  const embed = new EmbedBuilder()
    .setColor(NOVA_GREEN)
    .setTitle('📡 NovaPROTECTED Status')
    .addFields(
      { name: '🤖 Bot',        value: '✅ Online',                        inline: true },
      { name: '🗄️ Database',   value: `✅ Online (${latency}ms)`,          inline: true },
      { name: '🌐 API',        value: '✅ Operational',                    inline: true },
      { name: '🏓 WS Latency', value: `${interaction.client.ws.ping}ms`,   inline: true },
    )
    .setFooter({ text: 'NovaPROTECTED • All systems operational' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleAddCustomer(interaction) {
  const target = interaction.options.getMember('user');
  const plan   = interaction.options.getString('plan');

  const planLabels = { starter: '🆓 Starter', pro: '⚡ Pro', developer: '👑 Developer' };

  const customerRole = interaction.guild.roles.cache.find(r => r.name === 'Customer');
  if (!customerRole) {
    return interaction.reply({ content: '❌ Customer role not found. Run `/setup` first.', ephemeral: true });
  }

  await target.roles.add(customerRole, `Plan: ${plan}`);

  const embed = new EmbedBuilder()
    .setColor(NOVA_GREEN)
    .setTitle('✅ Customer Verified')
    .addFields(
      { name: 'User',  value: `${target}`, inline: true },
      { name: 'Plan',  value: planLabels[plan] || plan, inline: true },
      { name: 'By',    value: `${interaction.user}`, inline: true },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleRemoveCustomer(interaction) {
  const target = interaction.options.getMember('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  const customerRole = interaction.guild.roles.cache.find(r => r.name === 'Customer');
  if (customerRole) await target.roles.remove(customerRole, reason);

  const embed = new EmbedBuilder()
    .setColor(NOVA_RED)
    .setTitle('❌ Customer Access Revoked')
    .addFields(
      { name: 'User',   value: `${target}`, inline: true },
      { name: 'By',     value: `${interaction.user}`, inline: true },
      { name: 'Reason', value: reason, inline: false },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleAnnounce(interaction) {
  const message = interaction.options.getString('message');
  const title   = interaction.options.getString('title') || '📢 Announcement';

  const embed = new EmbedBuilder()
    .setColor(NOVA_RED)
    .setTitle(title)
    .setDescription(message)
    .setFooter({ text: `Posted by ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleWarn(interaction) {
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const count  = addWarning(target.id, reason, interaction.user.id);

  const embed = new EmbedBuilder()
    .setColor(NOVA_GOLD)
    .setTitle('⚠️ User Warned')
    .addFields(
      { name: 'User',           value: `${target}`,              inline: true },
      { name: 'Total Warnings', value: `${count}`,               inline: true },
      { name: 'By',             value: `${interaction.user}`,    inline: true },
      { name: 'Reason',         value: reason,                   inline: false },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  await target.send({
    embeds: [
      new EmbedBuilder()
        .setColor(NOVA_GOLD)
        .setTitle(`⚠️ You have been warned in ${interaction.guild.name}`)
        .addFields({ name: 'Reason', value: reason })
        .setFooter({ text: `Warning ${count} on record` })
        .setTimestamp(),
    ],
  }).catch(() => {});
}

async function handleWarnings(interaction) {
  const target   = interaction.options.getUser('user');
  const warnings = getWarnings(target.id);

  if (!warnings.length) {
    return interaction.reply({ content: `✅ ${target.tag} has no warnings on record.`, ephemeral: true });
  }

  const list = warnings
    .map((w, i) => `**${i + 1}.** ${w.reason} — <@${w.staffId}> • <t:${Math.floor(w.timestamp / 1000)}:R>`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(NOVA_GOLD)
    .setTitle(`📋 Warnings — ${target.tag}`)
    .setDescription(list)
    .setFooter({ text: `${warnings.length} warning(s) on record` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleClearWarnings(interaction) {
  const target = interaction.options.getUser('user');
  clearWarnings(target.id);

  await interaction.reply({
    content: `🧹 All warnings for **${target.tag}** have been cleared.`,
    ephemeral: true,
  });
}

async function handleKick(interaction) {
  const member = interaction.options.getMember('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  await member.kick(reason);

  const embed = new EmbedBuilder()
    .setColor(NOVA_GOLD)
    .setTitle('👢 User Kicked')
    .addFields(
      { name: 'User',   value: `${member.user.tag}`, inline: true },
      { name: 'By',     value: `${interaction.user}`, inline: true },
      { name: 'Reason', value: reason, inline: false },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleBan(interaction) {
  const member = interaction.options.getMember('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  await member.ban({ reason });

  const embed = new EmbedBuilder()
    .setColor(NOVA_RED)
    .setTitle('🔨 User Banned')
    .addFields(
      { name: 'User',   value: `${member.user.tag}`, inline: true },
      { name: 'By',     value: `${interaction.user}`, inline: true },
      { name: 'Reason', value: reason, inline: false },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════════════════════
//   NOVA KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function handleNovaCommand(interaction) {
  const session = loginSessions.get(interaction.user.id);
  if (!session?.userId) {
    return interaction.reply({
      content: 'Use `/login` with your UPanel key first.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const action   = interaction.options.getSubcommand(true);
  const keyVal   = interaction.options.getString('key');
  const quantity = interaction.options.getInteger('quantity') ?? 1;
  const projectValue = interaction.options.getString('project');

  if (action === 'freeze' || action === 'unfreeze') {
    const { data: found, error: fErr } = await supabase
      .from('license_keys').select('id')
      .eq('key_value', keyVal).eq('user_id', session.userId).maybeSingle();
    if (fErr) throw fErr;
    if (!found) return interaction.reply({ content: '❌ Key not found.', flags: MessageFlags.Ephemeral });

    const { error: uErr } = await supabase.from('license_keys')
      .update({ is_active: action === 'unfreeze' })
      .eq('key_value', keyVal).eq('user_id', session.userId);
    if (uErr) throw uErr;

    return interaction.reply({
      content: `Key \`${keyVal}\` ${action === 'freeze' ? '🔒 frozen' : '🔓 unfrozen'}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'remove') {
    const { error: dErr } = await supabase.from('license_keys')
      .delete().eq('key_value', keyVal).eq('user_id', session.userId);
    if (dErr) throw dErr;
    return interaction.reply({ content: `🗑️ Key \`${keyVal}\` removed.`, flags: MessageFlags.Ephemeral });
  }

  if (action === 'generate') {
    const qty      = Math.max(1, Math.min(MAX_BATCH, quantity));
    const projects = await getProjectsForUser(session.userId);
    if (!projects.length) {
      return interaction.reply({
        content: '❌ No projects found. Create a project in Nova first, then run `/nova generate`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    let proj = null;
    const trimmed = projectValue.trim();
    if (UUID_RE.test(trimmed)) proj = projects.find(p => p.id === trimmed) || null;
    if (!proj) {
      const matches = projects.filter(p => (p.name || '').trim() === trimmed);
      if (matches.length === 1) proj = matches[0];
      else if (matches.length > 1) {
        return interaction.reply({
          content: `❌ Multiple projects named **${trimmed}** — pick one from the autocomplete (duplicate names show an ID suffix).`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    if (!proj && UUID_RE.test(trimmed)) {
      const { data: row } = await supabase.from('projects').select('id, user_id, name').eq('id', trimmed).maybeSingle();
      if (row && row.user_id === session.userId) proj = { id: row.id, name: row.name };
    }
    if (!proj) {
      return interaction.reply({
        content: '❌ Project not found for your account. Pick a project from the **project** autocomplete.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const newRows = Array.from({ length: qty }, () => ({
      project_id: proj.id,
      user_id: session.userId,
      key_value: randomKey(),
      is_active: true,
      current_uses: 0,
    }));

    const { error: iErr } = await supabase.from('license_keys').insert(newRows);
    if (iErr) throw iErr;

    return interaction.reply({
      content: `✅ Created **${qty}** key(s) for project **${proj.name || 'Untitled'}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//   DISCORD CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, c => {
  console.log(`\n🛡️  NovaPROTECTED Bot online — ${c.user.tag}`);
  console.log(`   Watching ${c.guilds.cache.size} guild(s)\n`);
  c.user.setActivity('NovaPROTECTED | /pricing', { type: 3 });
});

// ── Auto-role + DM welcome on join ────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async member => {
  try {
    const guestRole = member.guild.roles.cache.find(r => r.name === 'Guest');
    if (guestRole) await member.roles.add(guestRole);

    const embed = new EmbedBuilder()
      .setColor(NOVA_RED)
      .setTitle('👋 Welcome to NovaPROTECTED!')
      .setDescription(
        'Thanks for joining. We\'re the all-in-one security and distribution platform for Roblox script developers.\n\u200b'
      )
      .addFields(
        { name: '📋 Get started', value: 'Check out `#📋・documentation` for guides and API references.',              inline: false },
        { name: '💎 View plans',  value: 'Run `/pricing` or visit `#🛒・pricing` to see what\'s available.',           inline: false },
        { name: '🎫 Need help?',  value: 'Open a ticket in `#📩・open-a-ticket` — our team will get back to you.',    inline: false },
      )
      .setFooter({ text: 'NovaPROTECTED • Secure. Distribute. Dominate.' })
      .setTimestamp();

    await member.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error('GuildMemberAdd error:', err);
  }
});

// ── Autocomplete ──────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isAutocomplete()) return;
  if (interaction.commandName !== 'nova') return;

  const focused = interaction.options.getFocused(true);
  const sub     = interaction.options.getSubcommand(false);
  if (sub !== 'generate' || focused?.name !== 'project') return;

  try {
    const session = loginSessions.get(interaction.user.id);
    if (!session?.userId) { await interaction.respond([]); return; }

    const projects = await getProjectsForUser(session.userId);
    const q        = (focused.value || '').toLowerCase().trim();
    const filtered = projects.filter(p => !q || (p.name || '').toLowerCase().includes(q)).slice(0, 25);

    const choices = filtered.map(p => {
      const sameName = projects.filter(x => (x.name || 'Untitled') === (p.name || 'Untitled'));
      return { name: displayNameForProject(p, sameName), value: p.id };
    });

    await interaction.respond(choices);
  } catch (e) {
    console.error('Autocomplete error:', e);
    try { await interaction.respond([]); } catch { /* ignore */ }
  }
});

// ── Slash Commands ────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // /setup and /resetserver are owner-only — no operator check needed
  if (commandName === 'setup')       return runSetup(interaction).catch(handleErr(interaction));
  if (commandName === 'resetserver') return runServerReset(interaction).catch(handleErr(interaction));

  // Public commands (no auth required)
  if (commandName === 'pricing') return handlePricing(interaction).catch(handleErr(interaction));
  if (commandName === 'docs')    return handleDocs(interaction).catch(handleErr(interaction));
  if (commandName === 'status')  return handleStatus(interaction).catch(handleErr(interaction));

  // /login — operator check then auth
  if (commandName === 'login') {
    const allowed = await isOperator(interaction.user.id);
    if (!allowed) return interaction.reply({ content: NOT_AUTHORIZED, flags: MessageFlags.Ephemeral });

    const panelKey = interaction.options.getString('upanel_key', true).trim();
    try {
      const verified = await verifyPanelKey(panelKey);
      if (!verified?.user_id) {
        return interaction.reply({ content: '❌ Invalid UPanel key.', flags: MessageFlags.Ephemeral });
      }
      loginSessions.set(interaction.user.id, { userId: verified.user_id, panelKey, loggedInAt: Date.now() });
      await linkDiscordConnection(verified.user_id, interaction.user);
      return interaction.reply({ content: '✅ Login successful. You can now use `/nova` commands.', flags: MessageFlags.Ephemeral });
    } catch (e) {
      return interaction.reply({ content: `❌ Login failed: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  }

  // /nova — operator check
  if (commandName === 'nova') {
    const allowed = await isOperator(interaction.user.id);
    if (!allowed) return interaction.reply({ content: NOT_AUTHORIZED, flags: MessageFlags.Ephemeral });
    return handleNovaCommand(interaction).catch(handleErr(interaction));
  }

  // Staff commands — use Discord permission system (setDefaultMemberPermissions handles it)
  try {
    switch (commandName) {
      case 'addcustomer':    return await handleAddCustomer(interaction);
      case 'removecustomer': return await handleRemoveCustomer(interaction);
      case 'announce':       return await handleAnnounce(interaction);
      case 'warn':           return await handleWarn(interaction);
      case 'warnings':       return await handleWarnings(interaction);
      case 'clearwarnings':  return await handleClearWarnings(interaction);
      case 'kick':           return await handleKick(interaction);
      case 'ban':            return await handleBan(interaction);
      case 'closeticket':    return await handleCloseTicketCommand(interaction);
      default:
        return interaction.reply({ content: '❓ Unknown command.', ephemeral: true });
    }
  } catch (err) {
    return handleErr(interaction)(err);
  }
});

// ── Button Router ─────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;
  const { customId } = interaction;

  try {
    if (customId === 'open_ticket')   return await handleSupportTicketOpen(interaction);
    if (customId === 'close_ticket')  return await handleCloseTicketButton(interaction);
    if (customId.startsWith('purchase_')) {
      const plan = customId.replace('purchase_', '');
      return await handlePurchaseButton(interaction, plan);
    }
  } catch (err) {
    const msg = { content: `❌ Error: \`${err.message}\``, ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

// ── Error helper ──────────────────────────────────────────────────────────────
const NOT_AUTHORIZED =
  '**Not authorized.** Ask the owner to add your Discord user ID to the `discord_bot_operators` table in Supabase.';

function handleErr(interaction) {
  return async (err) => {
    console.error(`Error in /${interaction.commandName}:`, err);
    const msg = { content: `❌ Something went wrong: \`${err.message}\``, ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch { /* ignore */ }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//   START
// ═══════════════════════════════════════════════════════════════════════════════

try {
  await registerCommands();
} catch (e) {
  console.warn('⚠️  Slash command registration failed (bot still starting):', e.message);
  if (e.message?.includes('Unknown Application')) {
    console.warn('   → Set DISCORD_APPLICATION_ID to the Application ID in the Discord Developer Portal.');
  }
}

client.login(DISCORD_TOKEN).catch(err => {
  console.error('❌ Login failed:', err.message);
  process.exit(1);
});