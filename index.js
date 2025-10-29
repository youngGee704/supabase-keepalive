import express from "express";
import axios from "axios";
import cron from "node-cron";

const app = express();
const PORT = process.env.PORT || 3000;

// 🟩 Load Supabase URLs from environment variable
const SUPABASE_URLS = process.env.SUPABASE_URLS 
  ? process.env.SUPABASE_URLS.split(',').map(url => url.trim())
  : [];

// 🔑 Optional: Load Supabase API keys (if needed)
const SUPABASE_KEYS = process.env.SUPABASE_KEYS
  ? process.env.SUPABASE_KEYS.split(',').map(key => key.trim())
  : [];

// 🧠 Function to ping all Supabase projects to prevent them from sleeping
const pingSupabase = async () => {
  if (SUPABASE_URLS.length === 0) {
    console.log("⚠️ No Supabase URLs configured. Add SUPABASE_URLS to your .env file");
    return;
  }

  console.log(`🔁 Running scheduled Supabase pings at ${new Date().toISOString()}...`);
  
  for (let i = 0; i < SUPABASE_URLS.length; i++) {
    const url = SUPABASE_URLS[i];
    const headers = {};
    
    // Add API key if available
    if (SUPABASE_KEYS[i]) {
      headers['apikey'] = SUPABASE_KEYS[i];
      headers['Authorization'] = `Bearer ${SUPABASE_KEYS[i]}`;
    }

    try {
      const response = await axios.get(url, { 
        timeout: 10000,
        headers 
      });
      console.log(`✅ ${url} responded with status ${response.status}`);
    } catch (error) {
      if (error.response) {
        console.error(`❌ ${url} responded with status ${error.response.status}: ${error.message}`);
      } else {
        console.error(`❌ Error pinging ${url}: ${error.message}`);
      }
    }
  }
  console.log(`✅ Ping cycle completed at ${new Date().toISOString()}\n`);
};

// 🔹 Run immediately on startup
pingSupabase();

// 🔹 Schedule: every 24 hours at midnight UTC
// "0 0 * * *" = At 00:00 (midnight) every day
cron.schedule("0 0 * * *", () => {
  pingSupabase();
});

// 💡 Optional: Add manual trigger endpoint
app.get("/ping", async (req, res) => {
  await pingSupabase();
  res.json({ 
    message: "Ping cycle completed", 
    timestamp: new Date().toISOString(),
    urls: SUPABASE_URLS.length
  });
});

app.get("/", (req, res) => {
  res.json({
    status: "✅ Supabase Keep-Alive Service is running!",
    configured_urls: SUPABASE_URLS.length,
    next_ping: "Every 24 hours at midnight UTC",
    manual_trigger: "/ping"
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Monitoring ${SUPABASE_URLS.length} Supabase project(s)`);
  console.log(`⏰ Scheduled pings: Every 24 hours at midnight UTC (cron: "0 0 * * *")`);
});