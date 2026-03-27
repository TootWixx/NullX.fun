// ================================================
//   NullX.fun Bot — Full Platform Bot
//   Combines: Key Management (Supabase) +
//             Server Setup + Tickets + Moderation
//   Start: node src/index.js
// ================================================

import {
  Client, GatewayIntentBits, MessageFlags,
  REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionsBitField, Partials,
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
const VERIFY_EMOJI = '✅';

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
  {
    name: 'Verified',
    color: NOVA_GREY,
    hoist: true,
    mentionable: false,
    // Verified should be read-only by default. Staff/Customer/Tester/Friends channel overwrites control write access.
    permissions: ['ViewChannel', 'ReadMessageHistory'],
  },
  {
    name: 'Friends',
    color: NOVA_GOLD,
    hoist: false,
    mentionable: true,
    // Non-staff write access is controlled by channel overwrites (general/vouches + tickets only)
    permissions: ['ViewChannel', 'ReadMessageHistory'],
  },
  {
    name: 'Tester',
    color: NOVA_BLUE,
    hoist: false,
    mentionable: true,
    // Non-staff write access is controlled by channel overwrites (general/vouches + tickets only)
    permissions: ['ViewChannel', 'ReadMessageHistory'],
  },
];

const CATEGORIES = [
  {
    name: '✅ START HERE',
    channels: [
      {
        name: '✅・verify',
        topic: 'New here? React with ✅ on the message to verify and unlock the server.',
        permissions: [
          { role: '@everyone', allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'] },
          { role: 'Staff / Support', allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'ManageMessages'] },
          { role: 'Owner', allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'ManageMessages'] },
        ],
        isVerifyChannel: true,
      },
    ],
  },
  {
    name: '📌 NULLX.FUN',
    channels: [
      {
        name: '📢・announcements',
        topic: 'Official NullX.fun updates, releases, and news.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
        requiresVerified: true,
      },
      {
        name: '👋・welcome',
        topic: 'Welcome to NullX.fun — the security & distribution platform for Roblox script developers.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks'] },
        ],
        isWelcomeChannel: true,
        requiresVerified: true,
      },
    ],
  },
  {
    name: '📋 INFORMATION',
    channels: [
      {
        name: '❓・faq',
        topic: 'Frequently asked questions about NullX.fun plans, keys, and setup.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
        isFaqChannel: true,
        requiresVerified: true,
      },
      {
        name: '💳・accepted-payment-methods',
        topic: 'Accepted payment methods for NullX.fun purchases and upgrades.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks'] },
        ],
        isPaymentMethodsChannel: true,
        requiresVerified: true,
      },
      {
        name: '🛒・pricing',
        topic: 'Plans, pricing, and how to purchase NullX.fun access.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks'] },
        ],
        isPricingChannel: true,
        requiresVerified: true,
      },
    ],
  },
  {
    name: '📦 SCRIPTS',
    channels: [
      {
        name: '📦・scripts',
        topic: 'Script releases, updates, and announcements from creators.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
        requiresVerified: true,
      },
      {
        name: '📜・general-script-logs',
        topic: 'General script logs, runtime reports, and troubleshooting output.',
        permissions: [
          { role: '@everyone',      deny: ['ViewChannel'] },
          { role: 'Staff / Support', allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Owner',           allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
      },
      {
        name: '🛠️・script-support',
        topic: 'Supported executors: Xeno, Solora, Volt, Seliware, Bunni, Ronix, Potassium, Volcano, Synapse Z.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Verified',      allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          // Keep it view-only for non-staff/non-owner.
          { role: 'Staff / Support', allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Owner',           allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
        requiresVerified: true,
      },
    ],
  },
  {
    name: '🧩 WHITELISTING SERVICE',
    channels: [
      {
        name: '🧩・whitelisting-info',
        topic: 'How NullX.fun whitelisting works, key flow, security model, and setup guidance.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
        isWhitelistInfoChannel: true,
        requiresVerified: true,
      },
      {
        name: '🧩・whitelisting-support',
        topic: 'Support for whitelist/auth setup, loader issues, and key validation problems.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          // View-only for non-staff users. Support goes through tickets.
          { role: 'Staff / Support', allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Owner',           allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
        requiresVerified: true,
      },
    ],
  },
  {
    name: '🆓 FREE ROBLOX EXTERNAL',
    channels: [
      {
        name: '🆓・free-roblox-external',
        topic: 'Free external resources and links (use at your own risk).',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
        requiresVerified: true,
      },
      {
        name: '✅・vouches',
        topic: 'Community vouches and feedback for NullX.fun scripts and services.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Verified',       allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Friends',        allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Tester',         allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
        requiresVerified: true,
      },
    ],
  },
  {
    name: '💬 COMMUNITY',
    channels: [
      {
        name: '💬・general',
        topic: 'General chat (non-staff messaging only).',
        permissions: [
          { role: '@everyone', allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Verified',  allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Friends',   allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Tester',    allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
        requiresVerified: true,
      },
      {
        name: '🛍️・showcase',
        topic: 'Show off your protected scripts and projects powered by NullX.fun.',
        permissions: [
          { role: '@everyone',      allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
          { role: 'Staff / Support', allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
          { role: 'Owner',           allow: ['SendMessages', 'EmbedLinks', 'AttachFiles'] },
        ],
        requiresVerified: true,
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
        topic: 'Exclusive chat for verified NullX.fun customers.',
        permissions: [
          { role: '@everyone',      deny: ['ViewChannel'] },
          // Customers can view only; staff/owner handle moderation.
          { role: 'Verified',        allow: ['ViewChannel', 'ReadMessageHistory'] },
          { role: 'Customer',        allow: ['ViewChannel', 'ReadMessageHistory'] },
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
          { role: 'Verified',        allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] },
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
    .setColor(NOVA_BLUE)
    .setTitle('🚀 Welcome to NullX.fun')
    .setDescription(
      '**High-quality script protection, clean key systems, and stable execution flow.**\n\n' +
      'Our scripts and loader pipeline are built for reliability, performance, and low detection surface across modern executors.\n\u200b'
    )
    .addFields(
      {
        name: '⚔️ Script Quality First',
        value:
          '• Fast and stable loader flow\n' +
          '• Hardened auth + key validation\n' +
          '• Built for everyday use and long-term uptime',
        inline: false,
      },
      {
        name: '🧩 Whitelisting Service',
        value:
          '• Project-scoped keys\n' +
          '• HWID locking and session heartbeat\n' +
          '• Checkpoints + Discord OAuth ready',
        inline: false,
      },
      {
        name: '📌 Quick Start',
        value:
          '✅ React in **#✅・verify** to unlock the server\n' +
          '📦 Check **#📦・scripts** for script releases\n' +
          '🧩 Check **#🧩・whitelisting-info** for service details\n' +
          '❓ Browse **#❓・faq** for quick answers\n' +
          '🛒 Check **#🛒・pricing** for plans\n' +
          '🎫 Need help? Open a ticket in **#📩・open-a-ticket**\n\u200b',
        inline: false,
      }
    )
    .setFooter({ text: 'NullX.fun • Secure. Distribute. Dominate.' })
    .setTimestamp();
}

function buildTicketEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_RED)
    .setTitle('🎫 NullX.fun Support')
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
    .setFooter({ text: 'NullX.fun Support System' })
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
    .setDescription('NullX.fun server structure has been successfully built.')
    .addFields(
      { name: '📁 Categories & Channels', value: `${channelCount} channels created`, inline: true },
      { name: '🏷️ Roles',                 value: `${roleCount} roles created`,       inline: true },
    )
    .setFooter({ text: 'NullX.fun Setup' })
    .setTimestamp();
}

function buildPricingEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_RED)
    .setTitle('💎 NullX.fun — Plans & Pricing')
    .setDescription(
      'All plans include core key generation, HWID locking, and a clean dashboard + bot workflow.\n' +
      'To purchase or upgrade, open a ticket — our staff will handle you fast.\n\u200b'
    )
    .addFields(
      {
        name: '🆓 Starter — $0',
        value:
          'For new creators getting started.\n' +
          '• **1 project** slot\n' +
          '• **60** key generations\n' +
          '• **20** obfuscations\n' +
          '• Checkpoint System + Creator Profile (**generic links only**)\n' +
          '• HWID locking + key activation controls\n' +
          '• Community support\n\u200b',
        inline: false,
      },
      {
        name: '⚡ Pro — $20/month',
        value:
          'For serious devs actively selling scripts.\n' +
          '• **5 project** slots\n' +
          '• **1,000** key generations\n' +
          '• **200** obfuscations\n' +
          '• Full Checkpoint + Creator Profile system (YouTube, Discord OAuth, generic links)\n' +
          '• Discord bot key operations (generate/freeze/remove)\n' +
          '• Webhook logging + auth telemetry\n' +
          '• Priority support\n\u200b',
        inline: false,
      },
      {
        name: '🛠️ Admin Panel — $120 (one-time)',
        value:
          'One-time unlock for power users.\n' +
          '• Everything in **Pro**\n' +
          '• Admin panel access (site + operational tools)\n' +
          '• Elevated limits and admin-only controls\n' +
          '• Direct staff onboarding help\n\u200b',
        inline: false,
      },
      {
        name: '📌 Good to know',
        value:
          'To buy/upgrade: open a ticket in **#📩・open-a-ticket**.\n' +
          'A staff member will confirm your plan and get you set up.',
        inline: false,
      }
    )
    .setFooter({ text: 'NullX.fun • Open a ticket to purchase' })
    .setTimestamp();
}

function buildPricingButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_ticket')
      .setLabel('🎫 Open Ticket to Buy')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('pricing_details')
      .setLabel('📌 What do I get?')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildDocsGettingStartedEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_BLUE)
    .setTitle('🚀 Getting Started with NullX.fun')
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
    .setFooter({ text: 'NullX.fun Docs • Use /docs for more sections' })
    .setTimestamp();
}

function buildDocsAdvancedEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_RED)
    .setTitle('🔧 Advanced Features — The Hard Stuff Made Easy')
    .setDescription('Once you\'re set up, here\'s how to get the most out of the platform.\n\u200b')
    .addFields(
      {
        name: '🛡️ Remote Session Management (Pro & Admin Panel)',
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
          'Because all validation pings the NullX.fun API, disabling a key or an entire project ' +
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
        name: '💸 Checkpoints (Starter limited / Pro+ full)',
        value:
          'Force users through checkpoints (links + Discord OAuth) before generating their key. ' +
          'Starter has generic-link limits; Pro+ unlocks the full Creator Profile + checkpoint system.\n\u200b',
        inline: false,
      }
    )
    .setFooter({ text: 'NullX.fun Docs • Advanced Section' })
    .setTimestamp();
}

function buildDocsRoadmapEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_GOLD)
    .setTitle('🗺️ What\'s Coming to NullX.fun')
    .setDescription('Here\'s what\'s in development — no vague promises, just actual features being built.\n\u200b')
    .addFields(
      {
        name: '🌐 Global Ban Network',
        value: 'A shared blacklist across all NullX.fun projects. Ban a bad actor once — blocked everywhere.\n\u200b',
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
    .setFooter({ text: 'NullX.fun • Roadmap subject to change' })
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
        name: 'Is your script flow stable for users?',
        value: 'Yes. We optimize for stable runtime behavior, fast auth responses, and smooth key validation across supported executors.\n\u200b',
        inline: false,
      },
      {
        name: 'Which executors are supported in script support?',
        value: 'Xeno, Solora, Volt, Seliware, Bunni, Ronix, Potassium, Volcano, Synapse Z.\n\u200b',
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
        name: 'How does whitelisting work?',
        value:
          'Your script validates against NullX.fun before access is granted. ' +
          'Keys can be project-scoped, HWID-locked, and managed from dashboard + bot tools.\n\u200b',
        inline: false,
      },
      {
        name: 'Can someone bypass the protection?',
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
        name: 'What telemetry is available?',
        value: 'IP address, ISP, city/country, operating system, and HWID — all delivered to your Discord webhook on each authentication.\n\u200b',
        inline: false,
      }
    )
    .setFooter({ text: 'NullX.fun • Still have questions? Open a ticket.' })
    .setTimestamp();
}

function buildPaymentMethodsEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_GOLD)
    .setTitle('💳 Accepted Payment Methods')
    .setDescription('You can purchase or upgrade through any of the methods below.\n\u200b')
    .addFields(
      { name: 'Cash App', value: 'https://cash.app/$Tootwixx', inline: false },
      { name: 'PayPal', value: 'https://www.paypal.com/paypalme/yamamafavorite69', inline: false },
      { name: 'G2A Cards', value: 'Accepted', inline: true },
      { name: 'Crypto', value: 'All forms of crypto accepted', inline: true },
      {
        name: 'How to purchase',
        value: 'Open a ticket in **#📩・open-a-ticket**, choose your plan, and staff will guide you through payment + activation.',
        inline: false,
      }
    )
    .setFooter({ text: 'NullX.fun Payments • Open a ticket to buy/upgrade' })
    .setTimestamp();
}

async function postVerifyMessage(verifyChannel) {
  const embed = new EmbedBuilder()
    .setColor(NOVA_GREEN)
    .setTitle('✅ Verify To Unlock Server')
    .setDescription(
      'React with ✅ on this message to get the **Verified** role and unlock the rest of the server.\n\n' +
      'After verification, this channel is hidden for your account.'
    )
    .setFooter({ text: 'NullX.fun Verification' })
    .setTimestamp();

  const msg = await verifyChannel.send({ embeds: [embed] });
  await msg.react(VERIFY_EMOJI).catch(() => {});
}

function buildWhitelistingInfoEmbed() {
  return new EmbedBuilder()
    .setColor(NOVA_BLUE)
    .setTitle('🧩 NullX.fun Whitelisting Service')
    .setDescription(
      'API-protected validation + encrypted script pipeline. Your raw source stays encrypted end-to-end.\n\u200b'
    )
    .addFields(
      {
        name: '🔒 API Protection (Validation Flow)',
        value:
          '• Checkpoint/validate endpoints are API-protected (no open plaintext access)\n' +
          '• Requests are verified server-side before access is granted\n' +
          '• Project-scoped keys + session heartbeat keep permissions in sync\n' +
          '• Freeze/remove/blacklist controls apply instantly during active sessions\n\u200b',
        inline: false,
      },
      {
        name: '🔐 Script Encryption + Secure Storage',
        value:
          '• Script sources are encrypted client-side with AES-GCM before being stored\n' +
          '• The database stores ciphertext (IV + ciphertext), not raw Lua source\n' +
          '• Decryption happens only when your vault is unlocked on your device\n' +
          '• This means we never handle your raw script content in plaintext storage form\n\u200b',
        inline: false,
      },
      {
        name: '🛠️ Obfuscation + Loader Pipeline',
        value:
          '• VM-level protection + Lua string encryption (where enabled)\n' +
          '• Your loader only receives protected/obfuscated content\n' +
          '• Checkpoint gating can be used to control key issuance\n\u200b',
        inline: false,
      },
      {
        name: '🧩 Auto-Embedded UI (Including Checkpoints)',
        value:
          '• Auth UI is auto-embedded during the protection workflow\n' +
          '• When checkpoints are enabled, the UI can automatically include checkpoint redirects\n' +
          '• Discord OAuth checkpoints are supported in the flow\n\u200b',
        inline: false,
      }
      ,
      {
        name: '🧰 Need help setting up?',
        value:
          'Use **#🧩・whitelisting-support** for integration help.\n' +
          'For billing/upgrades, open a ticket in **#📩・open-a-ticket**.',
        inline: false,
      }
    )
    .setFooter({ text: 'NullX.fun Whitelisting • Secure. Reliable. Scalable.' })
    .setTimestamp();
}

function buildPurchaseTicketEmbed(user, plan) {
  const plans = {
    starter: { label: '🆓 Starter',     price: '$0',        color: NOVA_GREY },
    pro:     { label: '⚡ Pro',          price: '$20/month', color: NOVA_BLUE },
    admin:   { label: '🛠️ Admin Panel', price: '$120 (one-time)', color: NOVA_GOLD },
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
    .setFooter({ text: 'NullX.fun • Purchase Support' })
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
  // ── AUTHENTICATION ──
  new SlashCommandBuilder()
    .setName('login')
    .setDescription('🔑 Sign in to the bot using your UPanel key')
    .addStringOption(o =>
      o.setName('upanel_key').setDescription('Your 5-part UPanel Master Key').setRequired(true)),

  // ── KEY & PROJECT MANAGEMENT ──
  new SlashCommandBuilder()
  .setName('nova')
    .setDescription('🛡️ NullX.fun key management (requires /login)')
    .addSubcommand(s =>
      s.setName('generate')
        .setDescription('Generate randomized license keys for a project')
        .addStringOption(o =>
          o.setName('project').setDescription('Project name or ID').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o =>
          o.setName('quantity').setDescription('How many keys to generate (1–20)').setRequired(true).setMinValue(1).setMaxValue(MAX_BATCH)))
    .addSubcommand(s =>
      s.setName('freeze')
        .setDescription('Temporarily disable a license key')
        .addStringOption(o => o.setName('key').setDescription('License key to freeze').setRequired(true)))
    .addSubcommand(s =>
      s.setName('unfreeze')
        .setDescription('Reactive a frozen license key')
        .addStringOption(o => o.setName('key').setDescription('License key to unfreeze').setRequired(true)))
    .addSubcommand(s =>
      s.setName('remove')
        .setDescription('Permanently delete a license key')
        .addStringOption(o => o.setName('key').setDescription('License key to remove').setRequired(true))),

  // ── PUBLIC INFORMATION ──
  new SlashCommandBuilder()
    .setName('pricing')
    .setDescription('💎 View NullX.fun plans and pricing'),
  new SlashCommandBuilder()
    .setName('docs')
    .setDescription('📋 Browse NullX.fun documentation and FAQ')
    .addStringOption(o =>
      o.setName('section').setDescription('Section to view').setRequired(false)
      .addChoices(
          { name: 'Getting Started',   value: 'getting_started' },
          { name: 'Advanced Features', value: 'advanced' },
          { name: 'Roadmap',           value: 'roadmap' },
          { name: 'FAQ',               value: 'faq' },
        )),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('📡 Check NullX.fun API and bot status'),

  // ── STAFF & MODERATION ──
  new SlashCommandBuilder()
    .setName('addcustomer')
    .setDescription('✅ Grant Customer role to a verified user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('user').setDescription('User to verify').setRequired(true))
    .addStringOption(o =>
      o.setName('plan').setDescription('Purchased plan').setRequired(true)
        .addChoices(
          { name: 'Starter ($0)',            value: 'starter' },
          { name: 'Pro ($20/mo)',            value: 'pro' },
          { name: 'Admin Panel ($120 one-time)', value: 'admin' },
        )),
  new SlashCommandBuilder()
    .setName('removecustomer')
    .setDescription('❌ Revoke access from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('📢 Post a formatted announcement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('message').setDescription('Announcement content').setRequired(true))
    .addStringOption(o => o.setName('title').setDescription('Optional title').setRequired(false)),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('⚠️ Issue a warning to a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('📋 View disciplinary history for a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true)),
  new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('🧹 Wipe warning history for a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to clear').setRequired(true)),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('👢 Remove a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('🔨 Permanently ban a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder()
    .setName('closeticket')
    .setDescription('🔒 Close the current support or purchase ticket'),

  // ── SERVER ADMINISTRATION ──
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('🛡️ Build the full NullX.fun server structure (Owner only)'),
  new SlashCommandBuilder()
    .setName('resetserver')
    .setDescription('💥 WIPE and rebuild the entire server structure (Owner only)'),
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

function buildOverwrites(guild, channelPerms, chDef = {}) {
  if (!channelPerms) return [];
  const mapped = channelPerms.map(entry => {
    const allow = resolvePerms(entry.allow);
    const deny  = resolvePerms(entry.deny);
    if (entry.role === '@everyone') return { id: guild.roles.everyone, allow, deny };
    const role = roleMap[entry.role];
    if (!role) { console.warn(`  ⚠ Role not found: ${entry.role}`); return null; }
    return { id: role.id, allow, deny };
  }).filter(Boolean);

  if (chDef.requiresVerified) {
    const verified = roleMap['Verified'];
    if (verified) {
      // Gate visibility until users verify.
      mapped.push({
        id: guild.roles.everyone,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      });
      mapped.push({
        id: verified.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      });
    }
  }
  return mapped;
}

async function createRoles(guild) {
  for (const def of ROLES) {
    const existing = guild.roles.cache.find(r => r.name === def.name);
    if (existing) {
      roleMap[def.name] = existing;
      // Keep role permissions synced with the latest setup spec.
      try {
        await existing.edit({ permissions: resolvePerms(def.permissions), reason: 'NullX.fun setup sync' });
      } catch (e) {
        console.warn(`  ⚠ Failed to sync role permissions for ${def.name}:`, e?.message || e);
      }
      continue;
    }
    const role = await guild.roles.create({
      name: def.name, color: def.color, hoist: def.hoist,
      mentionable: def.mentionable, permissions: resolvePerms(def.permissions),
      reason: 'NullX.fun setup',
    });
    roleMap[def.name] = role;
    console.log(`  ✅ Role created: ${role.name}`);
  }
}

async function createChannels(guild) {
  let channelCount = 0;
  let welcomeChannel = null, ticketChannel = null, faqChannel = null, pricingChannel = null, whitelistingInfoChannel = null, paymentMethodsChannel = null, verifyChannel = null;

  for (const catDef of CATEGORIES) {
    let category = guild.channels.cache.find(
      c => c.name === catDef.name && c.type === ChannelType.GuildCategory
    );
    if (!category) {
      category = await guild.channels.create({
        name: catDef.name, type: ChannelType.GuildCategory,
        reason: 'NullX.fun setup',
      });
    }

    for (const chDef of catDef.channels) {
      const existing = guild.channels.cache.find(
        c => c.name === chDef.name && c.parentId === category.id
      );
      if (existing) {
        // Ensure permissions stay in sync with the latest setup spec.
        // (Older channels can keep previous overwrites, letting roles write when they shouldn't.)
        try {
          await existing.edit({
            topic: chDef.topic || '',
            permissionOverwrites: buildOverwrites(guild, chDef.permissions, chDef),
          });
        } catch (e) {
          console.warn(`  ⚠️ Failed to update permissions for ${existing.name}:`, e?.message || e);
        }

        if (chDef.isWelcomeChannel)  welcomeChannel  = existing;
        if (chDef.isTicketChannel)   ticketChannel   = existing;
        if (chDef.isFaqChannel)      faqChannel      = existing;
        if (chDef.isPricingChannel)  pricingChannel  = existing;
        if (chDef.isWhitelistInfoChannel) whitelistingInfoChannel = existing;
        if (chDef.isPaymentMethodsChannel) paymentMethodsChannel = existing;
        if (chDef.isVerifyChannel) verifyChannel = existing;
        continue;
      }

      const channel = await guild.channels.create({
        name: chDef.name, type: ChannelType.GuildText,
        parent: category.id, topic: chDef.topic || '',
        permissionOverwrites: buildOverwrites(guild, chDef.permissions, chDef),
        reason: 'NullX.fun setup',
      });
      channelCount++;
      console.log(`    ✅ Channel created: ${channel.name}`);

      if (chDef.isWelcomeChannel)  welcomeChannel  = channel;
      if (chDef.isTicketChannel)   ticketChannel   = channel;
      if (chDef.isFaqChannel)      faqChannel      = channel;
      if (chDef.isPricingChannel)  pricingChannel  = channel;
      if (chDef.isWhitelistInfoChannel) whitelistingInfoChannel = channel;
      if (chDef.isPaymentMethodsChannel) paymentMethodsChannel = channel;
      if (chDef.isVerifyChannel) verifyChannel = channel;
    }
  }
  return { channelCount, welcomeChannel, ticketChannel, faqChannel, pricingChannel, whitelistingInfoChannel, paymentMethodsChannel, verifyChannel };
}

async function postSetupEmbeds(welcomeChannel, ticketChannel, faqChannel, pricingChannel, whitelistingInfoChannel, paymentMethodsChannel, verifyChannel) {
  if (welcomeChannel) {
    await welcomeChannel.send({ embeds: [buildWelcomeEmbed()] });
  }
  if (ticketChannel) {
    await ticketChannel.send({ embeds: [buildTicketEmbed()], components: [buildTicketButton()] });
  }
  if (whitelistingInfoChannel) {
    await whitelistingInfoChannel.send({ embeds: [buildWhitelistingInfoEmbed()] });
  }
  if (faqChannel) {
    await faqChannel.send({ embeds: [buildDocsFAQEmbed()] });
  }
  if (paymentMethodsChannel) {
    await paymentMethodsChannel.send({ embeds: [buildPaymentMethodsEmbed()] });
  }
  if (pricingChannel) {
    await pricingChannel.send({ embeds: [buildPricingEmbed()], components: [buildPricingButtons()] });
  }
  if (verifyChannel) {
    await postVerifyMessage(verifyChannel);
  }
}

async function runSetup(interaction) {
  const guild = interaction.guild;
  if (interaction.user.id !== guild.ownerId) {
    return interaction.reply({ content: '❌ Only the **server owner** can run `/setup`.', ephemeral: true });
  }

  await interaction.reply({ content: '⚙️ Setting up your NullX.fun server… This may take a moment.', ephemeral: true });
  console.log(`\n🛡️  Running setup on guild: ${guild.name}`);

  try {
    await createRoles(guild);
    const { channelCount, welcomeChannel, ticketChannel, faqChannel, pricingChannel, whitelistingInfoChannel, paymentMethodsChannel, verifyChannel } = await createChannels(guild);
    await postSetupEmbeds(welcomeChannel, ticketChannel, faqChannel, pricingChannel, whitelistingInfoChannel, paymentMethodsChannel, verifyChannel);
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

  if (!guild) {
    return interaction.reply({
      content: '❌ This command can only be used inside a server.',
      ephemeral: true,
    });
  }

  const ownerId =
    guild.ownerId ??
    (await guild.fetchOwner().catch(() => null))?.id;

  // Hard guard — server owner only
  if (!ownerId || interaction.user.id !== ownerId) {
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
      await ch.delete('NullX.fun server reset').catch(() => {});
    }

    // ── 2. Delete all non-default roles (skip @everyone and the bot's own top role) ──
    await guild.roles.fetch();
    const botMember = await guild.members.fetchMe();
    const botTopPos = botMember.roles.highest.position;
    const roles = [...guild.roles.cache.values()].filter(
      r => r.id !== guild.roles.everyone.id && r.position < botTopPos
    );
    for (const r of roles) {
      await r.delete('NullX.fun server reset').catch(() => {});
    }

    // Clear the cached roleMap so setup starts fresh
    for (const key of Object.keys(roleMap)) delete roleMap[key];

    // ── 3. Re-run full setup ───────────────────────────────────────────────────
    await createRoles(guild);
    const { channelCount, welcomeChannel, ticketChannel, faqChannel, pricingChannel, whitelistingInfoChannel, paymentMethodsChannel, verifyChannel } = await createChannels(guild);
    await postSetupEmbeds(welcomeChannel, ticketChannel, faqChannel, pricingChannel, whitelistingInfoChannel, paymentMethodsChannel, verifyChannel);
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
      .setFooter({ text: 'NullX.fun Reset' })
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
      reason: 'NullX.fun ticket system',
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
    .setFooter({ text: 'NullX.fun Support • Click 🔒 Close when resolved' })
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
      reason: 'NullX.fun ticket system',
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
    .setTitle('📡 NullX.fun Status')
    .addFields(
      { name: '🤖 Bot',        value: '✅ Online',                        inline: true },
      { name: '🗄️ Database',   value: `✅ Online (${latency}ms)`,          inline: true },
      { name: '🌐 API',        value: '✅ Operational',                    inline: true },
      { name: '🏓 WS Latency', value: `${interaction.client.ws.ping}ms`,   inline: true },
    )
    .setFooter({ text: 'NullX.fun • All systems operational' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleAddCustomer(interaction) {
  const target = interaction.options.getMember('user');
  const plan   = interaction.options.getString('plan');

  const planLabels = { starter: '🆓 Starter', pro: '⚡ Pro', admin: '🛠️ Admin Panel' };

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
      // We reserve keys when a checkpoint completes, then the real auth
      // consumes the final use. This keeps checkpoint-issued keys usable.
      max_uses: 2,
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
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, c => {
  console.log(`\n🛡️  NullX.fun Bot online — ${c.user.tag}`);
  console.log(`   Watching ${c.guilds.cache.size} guild(s)\n`);
  c.user.setActivity('NullX.fun | /pricing', { type: 3 });
});

// ── Auto-role + DM welcome on join ────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async member => {
  try {
    const embed = new EmbedBuilder()
      .setColor(NOVA_BLUE)
      .setTitle('👋 Welcome to NullX.fun!')
      .setDescription(
        'To get started, verify first and unlock the full server.\n\u200b'
      )
      .addFields(
        { name: '✅ Step 1', value: 'Go to `#✅・verify` and react with ✅.', inline: false },
        { name: '📦 Step 2', value: 'Browse scripts and support channels after verification.', inline: false },
        { name: '🎫 Need help?',  value: 'Open a ticket in `#📩・open-a-ticket` — our team will get back to you.',    inline: false },
      )
      .setFooter({ text: 'NullX.fun • Secure. Distribute. Dominate.' })
      .setTimestamp();

    await member.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error('GuildMemberAdd error:', err);
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => null);
    const message = reaction.message;
    if (!message?.guild) return;
    if (reaction.emoji.name !== VERIFY_EMOJI) return;
    if (message.channel?.name !== '✅・verify') return;

    const guild = message.guild;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const verifiedRole = guild.roles.cache.find(r => r.name === 'Verified');
    if (!verifiedRole) return;

    if (!member.roles.cache.has(verifiedRole.id)) {
      await member.roles.add(verifiedRole, 'User completed verification reaction').catch(() => {});
    }

    // Hide verify channel for this member after successful verification.
    await message.channel.permissionOverwrites.edit(member.id, {
      ViewChannel: false,
    }).catch(() => {});

    await user.send('✅ You are now verified in NullX.fun and have full server access.').catch(() => {});
  } catch (err) {
    console.error('MessageReactionAdd verify handler error:', err);
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

  // /login - Role-based: Customer or Owner role + Discord linking check
  if (commandName === 'login') {
    const member = interaction.member;
    // member.roles.cache is a Discord.js Collection; if it's missing, fall back safely.
    const roleNames = member?.roles?.cache
      ? Array.from(member.roles.cache.values()).map(r => r.name)
      : [];
    const hasAccess = roleNames.some(n => ['Customer', 'Owner'].includes(n));
    if (!hasAccess) {
      return interaction.reply({
        content: '\u{1f512} **Access Denied.** You need the `Customer` or `Owner` role to use this command.\nPurchase a plan or ask a staff member for access.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const { data: connection } = await supabase
      .from('discord_connections')
      .select('user_id')
      .eq('discord_user_id', interaction.user.id)
      .maybeSingle();
    if (!connection?.user_id) {
      return interaction.reply({
        content: '\u{1f517} **Discord Not Linked.** Link your Discord ID in the NullX.fun dashboard first.\nGo to **Dashboard > Discord Bot** and save your Discord User ID.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const panelKey = interaction.options.getString('upanel_key', true).trim();
    try {
      const verified = await verifyPanelKey(panelKey);
      if (!verified?.user_id) {
        return interaction.reply({ content: '\u274c Invalid UPanel key.', flags: MessageFlags.Ephemeral });
      }
      if (verified.user_id !== connection.user_id) {
        return interaction.reply({
          content: '\u274c **Key Mismatch.** This UPanel key does not belong to the Nova account linked to your Discord.',
          flags: MessageFlags.Ephemeral,
        });
      }
      loginSessions.set(interaction.user.id, { userId: verified.user_id, panelKey, loggedInAt: Date.now() });
      return interaction.reply({ content: '\u2705 Login successful. You can now use `/nova` commands.', flags: MessageFlags.Ephemeral });
    } catch (e) {
      return interaction.reply({ content: `\u274c Login failed: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  }

  // /nova - requires active login session
  if (commandName === 'nova') {
    const session = loginSessions.get(interaction.user.id);
    if (!session?.userId) {
      return interaction.reply({
        content: '\u{1f512} **Not logged in.** Use `/login` with your UPanel key first.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return handleNovaCommand(interaction).catch(handleErr(interaction));
  }

  // Staff commands — use Discord permission system (setDefaultMemberPermissions handles it)
  try {
    // Extra auth requirement:
    // - Discord server owner can run staff commands immediately
    // - Everyone else must be logged in with /login (UPanel key session)
    const guild = interaction.guild;
    const isOwner = guild?.ownerId ? interaction.user.id === guild.ownerId : false;
    if (!isOwner) {
      const session = loginSessions.get(interaction.user.id);
      if (!session?.userId) {
        return interaction.reply({
          content: '\u{1f512} **Not logged in.** Use `/login` with your UPanel key before running this command.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }

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
    if (customId === 'pricing_details') {
      return await interaction.reply({
        ephemeral: true,
        embeds: [buildPricingEmbed()],
      });
    }
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
