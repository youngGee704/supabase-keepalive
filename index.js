import express from "express";
import axios from "axios";
import cron from "node-cron";
import dotenv from "dotenv";

// 🔧 Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 🟩 Configuration - ONLY URLs needed
const SUPABASE_URLS = process.env.SUPABASE_URLS 
  ? process.env.SUPABASE_URLS.split(',').map(url => url.trim())
  : [];

// Auto-detect Render URL
const getSelfUrl = () => {
  // Render provides RENDER_EXTERNAL_URL automatically
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL;
  }
  // Fallback for local testing
  return `http://localhost:${PORT}`;
};

const SELF_URL = getSelfUrl();

// Store ping statistics
const stats = {
  lastSupabasePing: null,
  lastSelfPing: null,
  totalPings: 0,
  successfulPings: 0,
  failedPings: 0,
  startTime: new Date()
};

// 🧠 Function to ping all Supabase projects
const pingSupabase = async () => {
  if (SUPABASE_URLS.length === 0) {
    console.log("⚠️ No Supabase URLs configured. Add SUPABASE_URLS to your .env file");
    return { success: false, message: "No URLs configured" };
  }

  const timestamp = new Date().toISOString();
  console.log(`\n🔁 Pinging ${SUPABASE_URLS.length} Supabase project(s) at ${timestamp}...`);
  
  const results = [];
  
  for (const url of SUPABASE_URLS) {
    try {
      const startTime = Date.now();
      const response = await axios.get(url, { 
        timeout: 10000,
        validateStatus: () => true // Accept any status code
      });
      const responseTime = Date.now() - startTime;
      
      console.log(`✅ ${url} - Status ${response.status} (${responseTime}ms)`);
      results.push({ url, status: response.status, success: true, responseTime });
      stats.successfulPings++;
    } catch (error) {
      console.error(`❌ ${url} - ${error.message}`);
      results.push({ url, success: false, error: error.message });
      stats.failedPings++;
    }
  }
  
  stats.totalPings++;
  stats.lastSupabasePing = timestamp;
  
  console.log(`✅ Ping cycle completed at ${new Date().toISOString()}\n`);
  
  return { success: true, timestamp, results };
};

// 🔄 Self-ping to keep THIS service alive on Render
const selfPing = async () => {
  try {
    await axios.get(`${SELF_URL}/health`, { 
      timeout: 5000,
      validateStatus: () => true
    });
    stats.lastSelfPing = new Date().toISOString();
    console.log(`🔄 Self-ping OK - Service stays awake`);
  } catch (error) {
    console.error(`❌ Self-ping failed: ${error.message}`);
  }
};

// 🔹 Run Supabase ping immediately on startup
console.log("🚀 Starting up - Running initial Supabase ping...");
pingSupabase();

// 🔹 Schedule Supabase pings: Every 24 hours at midnight UTC
cron.schedule("0 0 * * *", async () => {
  console.log("⏰ 24-hour trigger - Pinging Supabase projects");
  await pingSupabase();
}, {
  timezone: "UTC"
});

// 🔹 Keep service awake: Self-ping every 14 minutes
// (Render free tier sleeps after 15 min inactivity)
cron.schedule("*/14 * * * *", async () => {
  await selfPing();
}, {
  timezone: "UTC"
});

// 💡 Manual trigger endpoint
app.get("/ping", async (req, res) => {
  console.log("🖱️ Manual ping triggered via /ping endpoint");
  const result = await pingSupabase();
  res.json({ 
    message: "Manual ping completed", 
    ...result,
    stats: {
      total: stats.totalPings,
      successful: stats.successfulPings,
      failed: stats.failedPings
    }
  });
});

// 🏥 Health check endpoint (for self-pinging)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

// 📊 Stats endpoint
app.get("/stats", (req, res) => {
  const uptime = Math.floor((Date.now() - stats.startTime.getTime()) / 1000);
  
  res.json({
    service: "Supabase Keep-Alive",
    uptime_seconds: uptime,
    uptime_human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    configured_urls: SUPABASE_URLS.length,
    last_supabase_ping: stats.lastSupabasePing || "Not yet run",
    last_self_ping: stats.lastSelfPing || "Not yet run",
    total_pings: stats.totalPings,
    successful_pings: stats.successfulPings,
    failed_pings: stats.failedPings,
    success_rate: stats.totalPings > 0 
      ? `${((stats.successfulPings / (stats.successfulPings + stats.failedPings)) * 100).toFixed(1)}%`
      : "N/A"
  });
});

// 🏠 Home endpoint
app.get("/", (req, res) => {
  const uptime = Math.floor((Date.now() - stats.startTime.getTime()) / 1000);
  
  res.json({
    status: "✅ Supabase Keep-Alive Service Running",
    service_url: SELF_URL,
    monitoring: `${SUPABASE_URLS.length} Supabase project(s)`,
    schedules: {
      supabase_ping: "Every 24 hours at 00:00 UTC",
      self_ping: "Every 14 minutes (keeps service awake)"
    },
    endpoints: {
      manual_ping: `${SELF_URL}/ping`,
      health_check: `${SELF_URL}/health`,
      statistics: `${SELF_URL}/stats`
    },
    stats: {
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      last_ping: stats.lastSupabasePing || "Not yet run",
      total_pings: stats.totalPings,
      success_rate: stats.totalPings > 0 
        ? `${((stats.successfulPings / (stats.successfulPings + stats.failedPings)) * 100).toFixed(1)}%`
        : "N/A"
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`🚀 SUPABASE KEEP-ALIVE SERVICE STARTED`);
  console.log(`${"=".repeat(70)}`);
  console.log(`📍 Service URL: ${SELF_URL}`);
  console.log(`📊 Monitoring: ${SUPABASE_URLS.length} Supabase project(s)`);
  console.log(`⏰ Supabase Pings: Every 24 hours at midnight UTC`);
  console.log(`🔄 Self-Ping: Every 14 minutes (keeps service awake on Render)`);
  console.log(`${"=".repeat(70)}`);
  console.log(`\n📌 Your Supabase URLs:`);
  SUPABASE_URLS.forEach((url, i) => console.log(`   ${i + 1}. ${url}`));
  console.log(`\n✅ Service is ready and will run 24/7!\n`);
});