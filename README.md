# Supabase Keep-Alive (Cloudflare Worker)

Keeps Supabase free-tier projects active by executing scheduled pings every 6 hours via Cloudflare Workers and Cron Triggers. Projects are managed dynamically via a web UI and stored securely in Cloudflare Workers KV.

## Architecture

- **Runtime:** Cloudflare Workers (TypeScript, Strict Mode, zero runtime dependencies)
- **Database / Storage:** Cloudflare Workers KV (`SUPABASE_PROJECTS` namespace, schema: `{ version: 1, projects: [...] }`)
- **Scheduler:** Cron Trigger (`0 */6 * * *` - every 6 hours)
- **Security:** `AUTH_SECRET` gate via session cookie (`HttpOnly`, `Secure`, `SameSite=Strict`) and `Authorization: Bearer`
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

## 2. Authentication

The Worker is protected by an `AUTH_SECRET` environment secret. It is never committed to source control or stored in KV.

### Setting the Secret in Production
```bash
npx wrangler secret put AUTH_SECRET
```
You will be prompted to enter a long random secret key.

### Local Development Authentication
Create a `.dev.vars` file in the project root (ignored by git):
```bash
AUTH_SECRET=local-dev-secret-key-12345
```

### Access Rules
- **Dashboard (`GET /`)**: Returns HTTP 401 with an unlock password form if unauthenticated. Submitting the correct password posts to `POST /auth`, setting a `session` cookie (`HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`).
- **REST APIs (`/api/*`)**: Require either a valid `session` cookie or `Authorization: Bearer <AUTH_SECRET>`. Unauthenticated requests receive HTTP 401 JSON `{ "error": "unauthorized" }`.
- **Logout (`POST /auth/logout`)**: Clears the session cookie and redirects back to `/`.

---

## 3. Cloudflare Setup & Deployment

### Step 1: Install Dependencies
```bash
pnpm install
```

### Step 2: Create Workers KV Namespace
Create the production KV namespace:
```bash
pnpm exec wrangler kv namespace create SUPABASE_PROJECTS
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

### Step 4: Configure `AUTH_SECRET`
```bash
pnpm exec wrangler secret put AUTH_SECRET
```

### Step 5: Local Development & Testing
Start the local worker dev server:
```bash
pnpm dev
```
Open `http://localhost:8787` in your browser.

#### Manually Trigger the Cron Locally
In a separate terminal, trigger the scheduled cron execution:
```bash
curl "http://localhost:8787/__scheduled?cron=0+*/6+*+*+*"
```

### Step 6: Deploy to Cloudflare
```bash
pnpm deploy
```

---

## 4. API Reference

All `/api/*` endpoints require authentication (`Cookie: session=...` or `Authorization: Bearer <AUTH_SECRET>`).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves unlock form (if 401) or dashboard UI |
| `POST` | `/auth` | Validates password, sets session cookie, redirects to `/` |
| `POST` | `/auth/logout` | Clears session cookie, redirects to `/` |
| `GET` | `/api/projects` | Returns project list with masked anon keys (`{ name, url, anonKey }[]`) |
| `POST` | `/api/projects` | Adds a project (`{ name, url, anonKey }`), validates, tests connection, and appends to KV |
| `DELETE` | `/api/projects?name=<name>` | Deletes the specified project from KV |
| `POST` | `/api/test?name=<name>` | Tests connectivity for a specific project server-side and returns ping status |

### Ping Reason Codes
Responses from `POST /api/projects` and `POST /api/test` return clean reason codes without leaking raw stack traces or internal URLs:
- `ok`: Ping succeeded with HTTP 200.
- `missing_table`: Returned HTTP 404 (the `keepalive` table migration has not been applied).
- `http_error`: Target returned non-200 HTTP status (e.g. 401, 500).
- `network_error`: Network connection failure, timeout, or invalid hostname.

---

## 5. Storage Schema & Concurrency

- **KV Schema**: Stored under key `"projects"` as versioned JSON:
  ```json
  {
    "version": 1,
    "projects": [
      { "name": "prod-db", "url": "https://xyz.supabase.co", "anonKey": "..." }
    ]
  }
  ```
  The reader also supports bare arrays (`[...]`) for backwards compatibility.
- **Concurrency Mitigation**: Designed for single-user management. Write paths (`POST /api/projects` and `DELETE /api/projects`) implement a read-back verification loop with up to 3 retry attempts to mitigate lost updates across multiple tabs.

---

## 6. Quality Checks

```bash
pnpm typecheck
```
