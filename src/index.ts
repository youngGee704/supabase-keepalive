export interface SupabaseProject {
  name: string;
  url: string;
  anonKey: string;
}

export interface MaskedSupabaseProject {
  name: string;
  url: string;
  anonKey: string;
}

export type PingReason = "ok" | "missing_table" | "http_error" | "network_error";

export interface PingResult {
  ok: boolean;
  status: number;
  reason: PingReason;
}

export interface KVProjectsData {
  version: 1;
  projects: SupabaseProject[];
}

export interface Env {
  SUPABASE_PROJECTS: KVNamespace;
  AUTH_SECRET?: string;
}

const KV_PROJECTS_KEY = "projects";

const MIGRATION_SQL = `create table if not exists public.keepalive (
  id smallint primary key default 1,
  pinged_at timestamptz not null default now()
);
insert into public.keepalive (id) values (1) on conflict do nothing;
alter table public.keepalive enable row level security;
create policy "anon can read keepalive"
  on public.keepalive for select to anon using (true);`;

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function normalizePingUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const noQuery = trimmed.split("?")[0].split("#")[0].replace(/\/+$/, "");

  if (noQuery.endsWith("/keepalive")) {
    return `${noQuery}?select=*&limit=1`;
  }
  if (noQuery.endsWith("/rest/v1")) {
    return `${noQuery}/keepalive?select=*&limit=1`;
  }
  if (noQuery.includes("/rest/v1/keepalive")) {
    return `${noQuery}?select=*&limit=1`;
  }
  return `${noQuery}/rest/v1/keepalive?select=*&limit=1`;
}

export function maskAnonKey(key: string): string {
  if (!key) return "...";
  if (key.length <= 8) return key;
  return `${key.slice(0, 8)}...`;
}

export async function pingProject(project: SupabaseProject): Promise<PingResult> {
  const pingUrl = normalizePingUrl(project.url);

  try {
    const res = await fetch(pingUrl, {
      method: "GET",
      headers: {
        "apikey": project.anonKey,
        "Authorization": `Bearer ${project.anonKey}`
      }
    });

    if (res.status === 200) {
      return { ok: true, status: 200, reason: "ok" };
    }

    if (res.status === 404) {
      console.error(`${project.name}: keepalive table missing — run migrations/001_keepalive.sql`);
      return { ok: false, status: 404, reason: "missing_table" };
    }

    console.error(`${project.name}: ping failed with HTTP status ${res.status}`);
    return { ok: false, status: res.status, reason: "http_error" };
  } catch (err) {
    console.error(`${project.name}: network/fetch error:`, err);
    return { ok: false, status: 0, reason: "network_error" };
  }
}

export async function getProjectsFromKV(env: Env): Promise<SupabaseProject[]> {
  const raw = await env.SUPABASE_PROJECTS.get<unknown>(KV_PROJECTS_KEY, "json");
  if (!raw) {
    return [];
  }

  // Legacy bare-array tolerance
  if (Array.isArray(raw)) {
    return raw as SupabaseProject[];
  }

  // Versioned schema: { version: 1, projects: [...] }
  if (typeof raw === "object" && raw !== null && "projects" in raw) {
    const candidate = (raw as Record<string, unknown>).projects;
    if (Array.isArray(candidate)) {
      return candidate as SupabaseProject[];
    }
  }

  return [];
}

export async function saveProjectsToKV(env: Env, projects: SupabaseProject[]): Promise<void> {
  const payload: KVProjectsData = {
    version: 1,
    projects
  };
  await env.SUPABASE_PROJECTS.put(KV_PROJECTS_KEY, JSON.stringify(payload));
}

export async function pingAllProjects(env: Env): Promise<void> {
  const projects = await getProjectsFromKV(env);
  if (projects.length === 0) {
    console.log("[Keep-Alive Cron] No projects registered in KV.");
    return;
  }

  console.log(`[Keep-Alive Cron] Pinging ${projects.length} project(s)...`);
  for (const project of projects) {
    try {
      const result = await pingProject(project);
      if (result.ok) {
        console.log(`[Keep-Alive Cron] ✅ ${project.name}: 200 OK`);
      }
    } catch (err) {
      console.error(`[Keep-Alive Cron] Unexpected failure pinging ${project.name}:`, err);
    }
  }
  console.log("[Keep-Alive Cron] Ping cycle completed.");
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [name, ...rest] = pair.trim().split("=");
    if (name && rest.length > 0) {
      cookies[name] = decodeURIComponent(rest.join("="));
    }
  }
  return cookies;
}

export function isAuthenticated(request: Request, env: Env): boolean {
  const secret = env.AUTH_SECRET;
  if (!secret) {
    return false;
  }

  // 1. Check Bearer token
  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1] === secret) {
      return true;
    }
  }

  // 2. Check session cookie
  const cookieHeader = request.headers.get("Cookie");
  const cookies = parseCookies(cookieHeader);
  if (cookies["session"] === secret) {
    return true;
  }

  return false;
}

function renderPasswordForm(hasError: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Supabase Keep-Alive - Login</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --text-muted: #8b949e;
      --accent: #238636;
      --accent-hover: #2ea043;
      --danger: #da3633;
      --red-text: #f85149;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1.5rem;
      width: 100%;
      max-width: 380px;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    h1 {
      font-size: 1.2rem;
      letter-spacing: -0.02em;
    }
    p {
      color: var(--text-muted);
      font-size: 0.8rem;
    }
    .error-box {
      background: #da363326;
      border: 1px solid var(--danger);
      color: var(--red-text);
      padding: 0.5rem 0.75rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    label {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.05em;
    }
    input {
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.5rem 0.75rem;
      border-radius: 4px;
      font-family: inherit;
      font-size: 0.85rem;
      outline: none;
    }
    input:focus {
      border-color: #58a6ff;
    }
    button {
      font-family: inherit;
      font-size: 0.85rem;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      border: 1px solid rgba(240, 246, 252, 0.1);
      cursor: pointer;
      background: var(--accent);
      color: #fff;
    }
    button:hover {
      background: var(--accent-hover);
    }
  </style>
</head>
<body>
  <div class="card">
    <div>
      <h1>Supabase Keep-Alive</h1>
      <p>Enter AUTH_SECRET to access dashboard</p>
    </div>
    ${hasError ? `<div class="error-box">Invalid password. Please try again.</div>` : ""}
    <form method="POST" action="/auth">
      <div class="field">
        <label for="password">Secret Key</label>
        <input type="password" id="password" name="password" required autofocus autocomplete="current-password" />
      </div>
      <button type="submit">Unlock</button>
    </form>
  </div>
</body>
</html>`;
}

function renderDashboardHtml(): string {
  const escapedSql = escapeHtml(MIGRATION_SQL);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Supabase Keep-Alive</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --text-muted: #8b949e;
      --accent: #238636;
      --accent-hover: #2ea043;
      --btn-bg: #21262d;
      --btn-hover: #30363d;
      --danger: #da3633;
      --danger-hover: #b62324;
      --yellow-badge: #d29922;
      --yellow-bg: #bb800926;
      --green-text: #3fb950;
      --red-text: #f85149;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      padding: 2rem 1rem;
      display: flex;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 960px;
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
    }
    header h1 {
      font-size: 1.5rem;
      margin-bottom: 0.25rem;
      letter-spacing: -0.02em;
    }
    header p {
      color: var(--text-muted);
      font-size: 0.875rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1.25rem;
    }
    h2 {
      font-size: 1.1rem;
      margin-bottom: 1rem;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    @media (min-width: 640px) {
      .form-grid {
        grid-template-columns: 1fr 1fr 1fr;
      }
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    label {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.05em;
    }
    input {
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.5rem 0.75rem;
      border-radius: 4px;
      font-family: inherit;
      font-size: 0.85rem;
      outline: none;
    }
    input:focus {
      border-color: #58a6ff;
    }
    button {
      font-family: inherit;
      font-size: 0.85rem;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      border: 1px solid var(--border);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    .btn-primary {
      background: var(--accent);
      color: #ffffff;
      border-color: rgba(240, 246, 252, 0.1);
      align-self: flex-start;
    }
    .btn-primary:hover {
      background: var(--accent-hover);
    }
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .btn-action {
      background: var(--btn-bg);
      color: var(--text);
      padding: 0.3rem 0.65rem;
      font-size: 0.75rem;
    }
    .btn-action:hover {
      background: var(--btn-hover);
    }
    .btn-danger {
      color: var(--red-text);
      border-color: var(--border);
    }
    .btn-danger:hover {
      background: var(--danger);
      color: #fff;
      border-color: var(--danger);
    }
    details {
      margin-top: 1rem;
      border-top: 1px solid var(--border);
      padding-top: 1rem;
    }
    summary {
      font-size: 0.85rem;
      color: var(--text-muted);
      cursor: pointer;
      user-select: none;
      outline: none;
    }
    summary:hover {
      color: var(--text);
    }
    .sql-box {
      margin-top: 0.75rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.75rem;
      position: relative;
    }
    pre {
      font-size: 0.8rem;
      line-height: 1.4;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      color: #79c0ff;
    }
    .copy-btn {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: var(--btn-bg);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 0.25rem 0.5rem;
      font-size: 0.7rem;
    }
    .copy-btn:hover {
      background: var(--btn-hover);
    }
    .table-wrapper {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      text-align: left;
    }
    th, td {
      padding: 0.75rem 0.5rem;
      border-bottom: 1px solid var(--border);
    }
    th {
      color: var(--text-muted);
      font-weight: 500;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 3px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-untested {
      background: var(--yellow-bg);
      color: var(--yellow-badge);
      border: 1px solid var(--yellow-badge);
    }
    .status-ok {
      color: var(--green-text);
      font-weight: bold;
    }
    .status-err {
      color: var(--red-text);
      font-weight: bold;
    }
    .actions-cell {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    #alert {
      padding: 0.75rem 1rem;
      border-radius: 4px;
      font-size: 0.8rem;
      display: none;
    }
    #alert.info {
      display: block;
      background: #1f6feb26;
      border: 1px solid #388bfd;
      color: #58a6ff;
    }
    #alert.error {
      display: block;
      background: #da363326;
      border: 1px solid var(--danger);
      color: var(--red-text);
    }
    .empty-state {
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Supabase Keep-Alive</h1>
        <p>Cloudflare Workers cron pinger (every 6 hours) &bull; KV Storage</p>
      </div>
      <form method="POST" action="/auth/logout" style="margin: 0;">
        <button type="submit" class="btn-action btn-danger">Logout</button>
      </form>
    </header>

    <div id="alert"></div>

    <section class="card">
      <h2>Add Project</h2>
      <form id="add-form">
        <div class="form-grid">
          <div class="field">
            <label for="name">Project Name</label>
            <input type="text" id="name" required placeholder="e.g. prod-db" autocomplete="off" />
          </div>
          <div class="field">
            <label for="url">Supabase URL</label>
            <input type="url" id="url" required placeholder="https://xyz.supabase.co" autocomplete="off" />
          </div>
          <div class="field">
            <label for="anonKey">Anon Key</label>
            <input type="text" id="anonKey" required placeholder="eyJhbGciOi..." autocomplete="off" />
          </div>
        </div>
        <button type="submit" id="add-btn" class="btn-primary">Add Project</button>
      </form>

      <details>
        <summary>Setup SQL — run this in the project's SQL editor before saving</summary>
        <div class="sql-box">
          <button type="button" class="copy-btn" id="copy-sql-btn" onclick="copySql()">Copy SQL</button>
          <pre id="migration-sql">${escapedSql}</pre>
        </div>
      </details>
    </section>

    <section class="card">
      <h2>Configured Projects</h2>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Supabase URL</th>
              <th>Anon Key</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="projects-tbody">
            <tr><td colspan="5" class="empty-state">Loading projects...</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>

  <script>
    const testResults = new Map();

    function showAlert(msg, isError = false) {
      const el = document.getElementById("alert");
      el.textContent = msg;
      el.className = isError ? "error" : "info";
      el.style.display = "block";
      setTimeout(() => { el.style.display = "none"; }, 6000);
    }

    async function copySql() {
      const sql = document.getElementById("migration-sql").textContent || "";
      try {
        await navigator.clipboard.writeText(sql);
        const btn = document.getElementById("copy-sql-btn");
        const orig = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = orig; }, 2000);
      } catch (err) {
        showAlert("Failed to copy SQL to clipboard", true);
      }
    }

    async function handleApiResponse(res) {
      if (res.status === 401) {
        window.location.href = "/";
        return null;
      }
      return res;
    }

    async function loadProjects() {
      const tbody = document.getElementById("projects-tbody");
      try {
        const rawRes = await fetch("/api/projects");
        const res = await handleApiResponse(rawRes);
        if (!res) return;

        if (!res.ok) throw new Error("HTTP " + res.status);
        const projects = await res.json();
        renderTable(projects);
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state" style="color:var(--red-text);">Failed to load projects: ' + escapeHtml(err.message) + '</td></tr>';
      }
    }

    function escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str || "";
      return div.innerHTML;
    }

    function renderTable(projects) {
      const tbody = document.getElementById("projects-tbody");
      tbody.innerHTML = "";

      if (!projects || projects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No projects registered yet. Use the form above to add one.</td></tr>';
        return;
      }

      projects.forEach(p => {
        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        tdName.textContent = p.name;
        tdName.style.fontWeight = "600";

        const tdUrl = document.createElement("td");
        tdUrl.textContent = p.url;

        const tdKey = document.createElement("td");
        tdKey.textContent = p.anonKey;
        tdKey.style.color = "var(--text-muted)";

        const tdStatus = document.createElement("td");
        tdStatus.id = "status-" + encodeURIComponent(p.name);
        renderStatusCell(tdStatus, p.name);

        const tdActions = document.createElement("td");
        tdActions.className = "actions-cell";

        const testBtn = document.createElement("button");
        testBtn.type = "button";
        testBtn.className = "btn-action";
        testBtn.textContent = "Test";
        testBtn.onclick = () => runTest(p.name);

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn-action btn-danger";
        delBtn.textContent = "Delete";
        delBtn.onclick = () => deleteProject(p.name);

        tdActions.appendChild(testBtn);
        tdActions.appendChild(delBtn);

        tr.appendChild(tdName);
        tr.appendChild(tdUrl);
        tr.appendChild(tdKey);
        tr.appendChild(tdStatus);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
      });
    }

    function renderStatusCell(cell, name) {
      const res = testResults.get(name);
      if (!res) {
        cell.innerHTML = '<span class="badge badge-untested">untested</span>';
        return;
      }

      if (res.ok) {
        cell.innerHTML = '<span class="status-ok">✅ 200</span>';
      } else {
        const reasonText = res.reason ? escapeHtml(res.reason) : (res.status ? res.status : "failed");
        cell.innerHTML = '<span class="status-err">❌ ' + reasonText + '</span> <span class="badge badge-untested" style="margin-left:4px;">untested</span>';
      }
    }

    async function runTest(name) {
      const statusEl = document.getElementById("status-" + encodeURIComponent(name));
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:var(--text-muted);">⏳ Testing...</span>';
      }

      try {
        const rawRes = await fetch("/api/test?name=" + encodeURIComponent(name), { method: "POST" });
        const res = await handleApiResponse(rawRes);
        if (!res) return;

        const data = await res.json();
        testResults.set(name, {
          ok: data.ok,
          status: data.status,
          reason: data.reason
        });
      } catch (err) {
        testResults.set(name, {
          ok: false,
          status: 0,
          reason: "network_error"
        });
      }

      if (statusEl) {
        renderStatusCell(statusEl, name);
      }
    }

    async function deleteProject(name) {
      if (!confirm("Are you sure you want to delete project \\"" + name + "\\"?")) {
        return;
      }
      try {
        const rawRes = await fetch("/api/projects?name=" + encodeURIComponent(name), { method: "DELETE" });
        const res = await handleApiResponse(rawRes);
        if (!res) return;

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to delete");
        }
        testResults.delete(name);
        showAlert("Project \\"" + name + "\\" deleted.");
        loadProjects();
      } catch (err) {
        showAlert("Error deleting project: " + err.message, true);
      }
    }

    document.getElementById("add-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const addBtn = document.getElementById("add-btn");
      const nameInput = document.getElementById("name");
      const urlInput = document.getElementById("url");
      const anonKeyInput = document.getElementById("anonKey");

      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      const anonKey = anonKeyInput.value.trim();

      if (!name || !url || !anonKey) {
        showAlert("All fields are required", true);
        return;
      }

      addBtn.disabled = true;
      addBtn.textContent = "Saving & Testing...";

      try {
        const rawRes = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, url, anonKey })
        });
        const res = await handleApiResponse(rawRes);
        if (!res) return;

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to add project");
        }

        testResults.set(name, {
          ok: data.pingOk,
          status: data.pingStatus,
          reason: data.reason
        });

        nameInput.value = "";
        urlInput.value = "";
        anonKeyInput.value = "";

        if (data.pingOk) {
          showAlert("Project \\"" + name + "\\" added and verified (✅ 200).");
        } else {
          showAlert("Project \\"" + name + "\\" added, but initial ping failed (" + data.reason + "). Marked untested.", false);
        }

        await loadProjects();
      } catch (err) {
        showAlert("Error adding project: " + err.message, true);
      } finally {
        addBtn.disabled = false;
        addBtn.textContent = "Add Project";
      }
    });

    loadProjects();
  </script>
</body>
</html>`;
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method.toUpperCase();

  // Route: POST /auth
  if (method === "POST" && pathname === "/auth") {
    let password = "";
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      password = (formData.get("password") as string || "").trim();
    } else if (contentType.includes("application/json")) {
      try {
        const body = await request.json() as { password?: string };
        password = (body.password || "").trim();
      } catch {
        password = "";
      }
    }

    if (env.AUTH_SECRET && password === env.AUTH_SECRET) {
      return new Response(null, {
        status: 302,
        headers: {
          "Location": "/",
          "Set-Cookie": `session=${encodeURIComponent(env.AUTH_SECRET)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`
        }
      });
    }

    return new Response(null, {
      status: 302,
      headers: {
        "Location": "/?error=invalid_password"
      }
    });
  }

  // Route: POST /auth/logout
  if (method === "POST" && pathname === "/auth/logout") {
    return new Response(null, {
      status: 302,
      headers: {
        "Location": "/",
        "Set-Cookie": "session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
      }
    });
  }

  // Route: GET /
  if (method === "GET" && pathname === "/") {
    if (!isAuthenticated(request, env)) {
      const hasError = searchParams.get("error") === "invalid_password";
      return new Response(renderPasswordForm(hasError), {
        status: 401,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    return new Response(renderDashboardHtml(), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  // All /api/* routes require authentication
  if (pathname.startsWith("/api/")) {
    if (!isAuthenticated(request, env)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Route: GET /api/projects
    if (method === "GET" && pathname === "/api/projects") {
      const projects = await getProjectsFromKV(env);
      const masked: MaskedSupabaseProject[] = projects.map(p => ({
        name: p.name,
        url: p.url,
        anonKey: maskAnonKey(p.anonKey)
      }));

      return new Response(JSON.stringify(masked), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Route: POST /api/projects
    if (method === "POST" && pathname === "/api/projects") {
      let body: Partial<SupabaseProject>;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const name = typeof body.name === "string" ? body.name.trim() : "";
      const projectUrl = typeof body.url === "string" ? body.url.trim() : "";
      const anonKey = typeof body.anonKey === "string" ? body.anonKey.trim() : "";

      if (!name || !projectUrl || !anonKey) {
        return new Response(JSON.stringify({ error: "name, url, and anonKey are required and must be non-empty" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const projects = await getProjectsFromKV(env);
      if (projects.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        return new Response(JSON.stringify({ error: `Project with name "${name}" already exists` }), {
          status: 409,
          headers: { "Content-Type": "application/json" }
        });
      }

      const newProject: SupabaseProject = { name, url: projectUrl, anonKey };
      projects.push(newProject);
      await saveProjectsToKV(env, projects);

      // Test ping after saving (do not block saving on failure)
      const pingResult = await pingProject(newProject);

      return new Response(JSON.stringify({
        success: true,
        project: {
          name: newProject.name,
          url: newProject.url,
          anonKey: maskAnonKey(newProject.anonKey)
        },
        pingOk: pingResult.ok,
        pingStatus: pingResult.status,
        reason: pingResult.reason
      }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Route: DELETE /api/projects?name=xxx
    if (method === "DELETE" && pathname === "/api/projects") {
      const name = searchParams.get("name")?.trim();
      if (!name) {
        return new Response(JSON.stringify({ error: "Query param 'name' is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const projects = await getProjectsFromKV(env);
      const updated = projects.filter(p => p.name.toLowerCase() !== name.toLowerCase());

      if (updated.length === projects.length) {
        return new Response(JSON.stringify({ error: `Project "${name}" not found` }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }

      await saveProjectsToKV(env, updated);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Route: POST /api/test?name=xxx
    if (method === "POST" && pathname === "/api/test") {
      const name = searchParams.get("name")?.trim();
      if (!name) {
        return new Response(JSON.stringify({ error: "Query param 'name' is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const projects = await getProjectsFromKV(env);
      const target = projects.find(p => p.name.toLowerCase() === name.toLowerCase());

      if (!target) {
        return new Response(JSON.stringify({ error: "project not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }

      const result = await pingProject(target);

      return new Response(JSON.stringify({
        ok: result.ok,
        status: result.status,
        reason: result.reason
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  return new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" }
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env);
  },

  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(pingAllProjects(env));
  }
};
