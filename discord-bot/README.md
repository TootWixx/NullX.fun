# NovaPROTECTED Discord bot

Runs as a small Node process (Discord gateway). Uses the **Supabase service role** to manage license keys — keep the token secret.

## Environment

Create `discord-bot/.env`:

```env
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_APPLICATION_ID=your_application_id
# Optional: register slash commands on one guild only (faster while testing)
DISCORD_GUILD_ID=your_server_snowflake

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## One-time setup

1. Apply the Supabase migration that creates `discord_bot_operators` and `discord_connections`.
2. In **Supabase → SQL**:

   ```sql
   insert into public.discord_bot_operators (discord_user_id, label)
   values ('YOUR_DISCORD_USER_ID', 'Owner');
   ```

3. In the Discord Developer Portal, create a bot, copy the token, enable **Server Members Intent** if needed.
4. Set `VITE_DISCORD_APPLICATION_ID` in the web app so the **Discord** page can show the OAuth invite link.
5. Install and run:

   ```bash
   cd discord-bot
   npm install
   npm start
   ```

## Slash command

`/nova` — sub-options:

- `action`: freeze | unfreeze | delete | add  
- `key`: license key string (freeze / unfreeze / delete)  
- `project_id`: UUID (add)  
- `new_key`: optional custom key (add); random if omitted  

Only Discord users listed in `discord_bot_operators` can run commands.

## Website

Dashboard → **Account → Discord bot** has the invite URL (when `VITE_DISCORD_APPLICATION_ID` is set) and optional linking of your Discord user ID to your Nova account.
