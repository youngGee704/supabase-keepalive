# Supabase Keep-Alive (Cloudflare Worker)

Keeps Supabase free-tier projects active by executing scheduled pings every 6 hours via Cloudflare Workers and Cron Triggers. Projects are managed dynamically via a web UI and stored securely in Cloudflare Workers KV.

## Architecture

- **Runtime:** Cloudflare Workers (TypeScript, Strict Mode, zero runtime dependencies)
- **Database / Storage:** Cloudflare Workers KV (`SUPABASE_PROJECTS` namespace)
- **Scheduler:** Cron Trigger (`0 */6 * * *` - every 6 hours)
- **UI:** Server-rendered minimal monospace dark UI for adding, testing, and deleting projects
- **Target Ping Endpoint:** `GET {url}/rest/v1/keepalive?select=*&limit=1`

---

## 1. Supabase Database Preparation

Each Supabase project to be kept alive must have the `keepalive` table created. Run the following SQL migration in your project's SQL Editor:

```sql
-- migrations/001_keepalive.sql
create table if not exists public.keepalive (
  id smallint primary key default 1,
  pinged_at timestamptz not null default now()
);
insert into public.keepalive (id) values (1) on conflict do nothing;
alter table public.keepalive enable row level security;
create policy "anon can read keepalive"
  on public.keepalive for select to anon using (true);
```

---

## 2. Cloudflare Setup & Deployment

### Step 1: Install Dependencies
```bash
pnpm install
```

### Step 2: Create Workers KV Namespace
Create the production KV namespace:
```bash
npx wrangler kv namespace create SUPABASE_PROJECTS
```

The output will contain:
```toml
[[kv_namespaces]]
binding = "SUPABASE_PROJECTS"
id = "<KV_NAMESPACE_ID>"
```

### Step 3: Update `wrangler.toml`
Paste the generated ID into `wrangler.toml`:
```toml
name = "supabase-keepalive"
main = "src/index.ts"
compatibility_date = "2024-04-03"

[[kv_namespaces]]
binding = "SUPABASE_PROJECTS"
id = "<YOUR_PRODUCTION_KV_ID>"

[triggers]
crons = ["0 */6 * * *"]
```

### Step 4: Local Development & Testing
Start the local worker dev server:
```bash
pnpm dev
```
Open `http://localhost:8787` in your browser to view the management UI.

#### Manually Trigger the Cron Locally
In a separate terminal, trigger the scheduled cron execution:
```bash
curl "http://localhost:8787/__scheduled?cron=0+*/6+*+*+*"
```

### Step 5: Deploy to Cloudflare
```bash
pnpm deploy
```

---

## 3. API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves the HTML management dashboard |
| `GET` | `/api/projects` | Returns project list with masked anon keys (`{ name, url, anonKey }[]`) |
| `POST` | `/api/projects` | Adds a project (`{ name, url, anonKey }`), validates, tests connection, and appends to KV |
| `DELETE` | `/api/projects?name=<name>` | Deletes the specified project from KV |
| `POST` | `/api/test?name=<name>` | Tests connectivity for a specific project server-side and returns ping status |

---

## 4. Quality Checks

```bash
pnpm typecheck
```
