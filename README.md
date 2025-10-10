⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
MAKE SURE YOU READ THIS 
⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
# 🟩 Supabase Keep-Alive Service

This Node.js service keeps your Supabase projects awake by pinging their REST endpoints at regular intervals (every 48 hours by default).  
Perfect for preventing Render or Supabase projects from going idle.

---

## 🚀 Features
- Pings multiple Supabase projects automatically
- Runs on a simple Express server
- Uses Node-Cron for flexible scheduling
- Compatible with **Render**, **Vercel**, or **any Node host**

---

## 🧩 Setup Steps

### 1️⃣ Clone this project
```bash
git clone https://github.com/yourusername/supabase-keepalive.git
cd supabase-keepalive
```
###2️⃣ Install dependencies
```bash
npm install
```
### 3️⃣ Add your Supabase project URLs
Edit the SUPABASE_APIS array in index.js:
```bash
const SUPABASE_APIS = [
  // Replace with your Supabase project URLs
  "https://your-project-1.supabase.co/rest/v1/",
  "https://your-project-2.supabase.co/rest/v1/"
];
```
🟡 Note:
You can find your Supabase project’s REST URL by going to:
Settings → API → Project URL

🕒 Change Ping Frequency

The cron job is currently set to every 48 hours:
```bash
cron.schedule("0 */48 * * *", () => {
  pingSupabase();
});
```

You can modify it:
```bash
"0 */24 * * *" → every 24 hours

"*/10 * * * *" → every 10 minutes (for testing)
```
🌍 Deploy to Render

Go to https://render.com

Create a New Web Service

Connect your GitHub repo (or use Deploy from Tar/Zip)

In “Build Command” → npm install

In “Start Command” → npm start

Click Deploy

Render will give you a live URL like:
```bash
https://your-app-name.onrender.com
```
✅ Test if it’s running

Visit the deployed URL (e.g. https://your-app.onrender.com),
You should see:
**Note: If you see a 401 Unauthorized error in the logs, don’t worry — it’s still working.**
The ping request successfully wakes your Supabase instance even if authentication isn’t provided. The 401 just means the public endpoint requires an API key to access data, but the server still becomes active.
✅ Supabase Keep-Alive Service is running!

⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
Important Note
⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️

When sharing the code, make sure you:

Remove my Supabase URLs.

Replace them with your own project URLs.

🧰 Tech Stack

Node.js + Express

Axios

Node-Cron

👨‍💻 Maintained by GRIDVEM / Young Gee

Simple tool to keep your Supabase projects alive without stress.










