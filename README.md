# Supabase Keep-Alive

A lightweight Cloudflare Worker that prevents free-tier Supabase projects from pausing due to inactivity.

It runs a scheduled cron job every 6 hours, pinging a simple table in each of your Supabase databases. You can manage the list of projects through a built-in web UI.

## How it works

1. **Cloudflare Workers**: Hosts the UI and handles the scheduled cron job. (It never sleeps).
2. **Cloudflare KV**: Stores your list of Supabase projects.
3. **Supabase REST API**: The Worker sends a GET request to a `keepalive` table to trigger database activity.

## 1. Supabase Setup (Required for every project)

For each Supabase project you want to keep alive, you must create a table that the Worker can ping.

1. Go to your Supabase project dashboard.
2. Open the **SQL Editor**.
3. Paste and run the following SQL:

```sql
create table if not exists public.keepalive (
  id smallint primary key default 1,
  pinged_at timestamptz not null default now()
);
insert into public.keepalive (id) values (1) on conflict do nothing;
alter table public.keepalive enable row level security;
create policy "anon can read keepalive"
  on public.keepalive for select to anon using (true);
```

> **Note:** If you skip this, the dashboard will show a ❌ 404 error when you click "Test".

## 2. Deployment

You need a Cloudflare account.

### Prerequisites & Login

1. **Install Wrangler** (globally or use via `npx`):
```bash
npm install -g wrangler
# or use without global install: npx wrangler
```

2. **Login to your Cloudflare account**:
```bash
npx wrangler login
```
*(If the browser popup fails or you are in a headless environment, run `npx wrangler login --device` instead).*

3. **Create the KV Namespace**:
```bash
npx wrangler kv namespace create SUPABASE_PROJECTS
```
Copy the generated `id` from the output and paste it into your `wrangler.toml` file under `[[kv_namespaces]]`:
```toml
[[kv_namespaces]]
binding = "SUPABASE_PROJECTS"
id = "<YOUR_KV_NAMESPACE_ID>"
```

*(Note: If you encounter a Cloudflare "memberships" error during deployment, locate your Cloudflare **Account ID** in the Cloudflare dashboard and add `account_id = "<YOUR_ACCOUNT_ID>"` near the top of `wrangler.toml`).*

### Set up authentication
The dashboard is protected by a password. Generate a secret key:

```bash
npx wrangler secret put AUTH_SECRET
```
(Paste a long random string when prompted. You will use this to log in).

### Deploy
```bash
npx wrangler deploy
```
Wrangler will give you a live URL (e.g., `https://supabase-keepalive.your-name.workers.dev`). Open it, log in with your `AUTH_SECRET`, and add your projects.

## Local Development
To run the worker locally for testing:

1. Create a `.dev.vars` file in the root directory:
```env
AUTH_SECRET=local-password
```
> **Important:** Ensure `.dev.vars` is listed in your `.gitignore` so your local password/secret is never committed to GitHub.

2. Start the dev server:
```bash
npx wrangler dev --test-scheduled
```
Open `http://localhost:8787` and log in with `local-password`.

3. To test the cron job locally, open a second terminal and run:
```bash
curl.exe "http://localhost:8787/__scheduled?cron=0+*/6+*+*+*"
```

## Limitations
- **Single User Only**: The UI does not support multiple accounts. Anyone with the `AUTH_SECRET` has full access.
- **KV Eventual Consistency**: Cloudflare KV updates are eventually consistent. If you open two browser tabs and add/delete projects at the exact same time, you might lose an update. Use one tab at a time.
