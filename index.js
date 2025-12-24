import express from "express";
import axios from "axios";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 🔧 Configuration
const SUPABASE_PROJECT_IDS = process.env.SUPABASE_PROJECT_IDS 
  ? process.env.SUPABASE_PROJECT_IDS.split(',').map(id => id.trim())
  : [];

// Auto-detect Render URL
const getSelfUrl = () => {
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL;
  }
  return `http://localhost:${PORT}`;
};

const SELF_URL = getSelfUrl();

// Convert project ID to full REST API URL
const getSupabaseUrls = (projectIds) => {
  return projectIds.map(id => {
    // Handle both formats: abc123 or abc123.supabase.co
    const cleanId = id.replace('.supabase.co', '').replace('https://', '').replace('http://', '');
    return `https://${cleanId}.supabase.co/rest/v1/`;
  });
};

// Store ping statistics
const stats = {
  lastSupabasePing: null,
  lastExternalPing: null,
  totalSupabasePings: 0,
  successfulSupabasePings: 0,
  failedSupabasePings: 0,
  externalPingCount: 0,
  startTime: new Date(),
  recentErrors: []
};

// 🔧 Add error to recent errors list (keep last 10)
const logError = (error) => {
  stats.recentErrors.unshift({
    timestamp: new Date().toISOString(),
    error: error
  });
  if (stats.recentErrors.length > 10) {
    stats.recentErrors.pop();
  }
};

// 🧠 Function to ping all Supabase projects
const pingSupabase = async () => {
  const urls = getSupabaseUrls(SUPABASE_PROJECT_IDS);
  
  if (urls.length === 0) {
    const errorMsg = "No Supabase projects configured";
    console.log(`⚠️ ${errorMsg}. Add SUPABASE_PROJECT_IDS to your .env file`);
    return { success: false, message: errorMsg };
  }

  const timestamp = new Date().toISOString();
  console.log(`\n${"=".repeat(70)}`);
  console.log(`🔁 PINGING ${urls.length} SUPABASE PROJECT(S)`);
  console.log(`⏰ Time: ${timestamp}`);
  console.log(`${"=".repeat(70)}`);
  
  const results = [];
  let successCount = 0;
  let failCount = 0;
  
  for (const url of urls) {
    try {
      const startTime = Date.now();
      const response = await axios.get(url, { 
        timeout: 15000,
        validateStatus: () => true, // Accept any status code
        headers: {
          'User-Agent': 'Supabase-KeepAlive/1.0'
        }
      });
      const responseTime = Date.now() - startTime;
      
      const projectId = url.match(/https:\/\/(.+?)\.supabase\.co/)?.[1] || 'unknown';
      
      if (response.status >= 200 && response.status < 500) {
        console.log(`✅ ${projectId} - Status ${response.status} (${responseTime}ms)`);
        results.push({ 
          projectId, 
          url, 
          status: response.status, 
          success: true, 
          responseTime,
          timestamp 
        });
        successCount++;
        stats.successfulSupabasePings++;
      } else {
        console.log(`⚠️ ${projectId} - Status ${response.status} (${responseTime}ms)`);
        results.push({ 
          projectId, 
          url, 
          status: response.status, 
          success: false, 
          responseTime,
          timestamp 
        });
        failCount++;
        stats.failedSupabasePings++;
        logError(`${projectId}: Status ${response.status}`);
      }
    } catch (error) {
      const projectId = url.match(/https:\/\/(.+?)\.supabase\.co/)?.[1] || 'unknown';
      console.error(`❌ ${projectId} - ${error.message}`);
      results.push({ 
        projectId, 
        url, 
        success: false, 
        error: error.message,
        timestamp 
      });
      failCount++;
      stats.failedSupabasePings++;
      logError(`${projectId}: ${error.message}`);
    }
  }
  
  stats.totalSupabasePings++;
  stats.lastSupabasePing = timestamp;
  
  console.log(`${"=".repeat(70)}`);
  console.log(`✅ Ping cycle completed - Success: ${successCount}, Failed: ${failCount}`);
  console.log(`${"=".repeat(70)}\n`);
  
  return { 
    success: true, 
    timestamp, 
    results,
    summary: {
      total: urls.length,
      successful: successCount,
      failed: failCount
    }
  };
};

// 🚀 Run initial ping on startup
console.log("🚀 Starting up - Running initial Supabase ping in 5 seconds...");
setTimeout(() => {
  pingSupabase();
}, 5000);

// ⏰ Schedule Supabase pings: Every 6 hours
// Supabase pauses after 7 days, so 6-hour pings = 4x per day = plenty of buffer
cron.schedule("0 */6 * * *", async () => {
  console.log("⏰ 6-hour trigger - Pinging Supabase projects");
  await pingSupabase();
}, {
  timezone: "UTC"
});

console.log("✅ Cron job scheduled: Supabase ping every 6 hours");

// 🏥 Health check endpoint (for external monitoring)
// This is what keeps YOUR service alive on Render
app.get("/", (req, res) => {
  stats.externalPingCount++;
  stats.lastExternalPing = new Date().toISOString();
  
  const uptime = Math.floor((Date.now() - stats.startTime.getTime()) / 1000);
  const urls = getSupabaseUrls(SUPABASE_PROJECT_IDS);
  
  res.status(200).json({
    status: "✅ Supabase Keep-Alive Service Running",
    service_url: SELF_URL,
    monitoring: {
      project_count: SUPABASE_PROJECT_IDS.length,
      project_ids: SUPABASE_PROJECT_IDS
    },
    schedules: {
      supabase_ping: "Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)",
      note: "This service needs external pings every 10-14 minutes to stay awake on Render free tier"
    },
    endpoints: {
      manual_ping: `${SELF_URL}/ping`,
      health_check: `${SELF_URL}/health`,
      statistics: `${SELF_URL}/stats`
    },
    uptime: {
      seconds: uptime,
      human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`
    },
    last_external_ping: stats.lastExternalPing || "Just now",
    last_supabase_ping: stats.lastSupabasePing || "Not yet run",
    next_supabase_ping: getNextScheduledTime()
  });
});

// 🏥 Alternative health check endpoint
app.get("/health", (req, res) => {
  stats.externalPingCount++;
  stats.lastExternalPing = new Date().toISOString();
  
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor((Date.now() - stats.startTime.getTime()) / 1000)
  });
});

// 💡 Manual trigger endpoint
app.get("/ping", async (req, res) => {
  console.log("🖱️ Manual ping triggered via /ping endpoint");
  const result = await pingSupabase();
  
  res.json({ 
    message: "Manual ping completed", 
    ...result,
    overall_stats: {
      total_pings: stats.totalSupabasePings,
      successful: stats.successfulSupabasePings,
      failed: stats.failedSupabasePings,
      success_rate: stats.totalSupabasePings > 0 
        ? `${((stats.successfulSupabasePings / stats.totalSupabasePings) * 100).toFixed(1)}%`
        : "N/A"
    }
  });
});

// 📊 Detailed stats endpoint
app.get("/stats", (req, res) => {
  const uptime = Math.floor((Date.now() - stats.startTime.getTime()) / 1000);
  const urls = getSupabaseUrls(SUPABASE_PROJECT_IDS);
  
  res.json({
    service: "Supabase Keep-Alive Monitor",
    version: "2.0",
    uptime: {
      seconds: uptime,
      human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`,
      started_at: stats.startTime.toISOString()
    },
    monitoring: {
      configured_project_ids: SUPABASE_PROJECT_IDS,
      configured_urls: urls,
      project_count: SUPABASE_PROJECT_IDS.length
    },
    supabase_pings: {
      last_ping: stats.lastSupabasePing || "Not yet run",
      next_ping: getNextScheduledTime(),
      total_pings: stats.totalSupabasePings,
      successful_pings: stats.successfulSupabasePings,
      failed_pings: stats.failedSupabasePings,
      success_rate: stats.totalSupabasePings > 0 
        ? `${((stats.successfulSupabasePings / stats.totalSupabasePings) * 100).toFixed(1)}%`
        : "N/A"
    },
    external_monitoring: {
      last_external_ping: stats.lastExternalPing || "Not yet received",
      total_external_pings: stats.externalPingCount,
      note: "This service needs external pings every 10-14 min to stay awake on Render free tier"
    },
    recent_errors: stats.recentErrors.length > 0 ? stats.recentErrors : "None",
    health: stats.failedSupabasePings === 0 ? "excellent" : 
            stats.failedSupabasePings < stats.successfulSupabasePings ? "good" : "degraded"
  });
});

// 🕐 Calculate next scheduled ping time
function getNextScheduledTime() {
  const now = new Date();
  const hours = [0, 6, 12, 18];
  const currentHour = now.getUTCHours();
  
  let nextHour = hours.find(h => h > currentHour);
  if (!nextHour) {
    nextHour = hours[0];
  }
  
  const next = new Date(now);
  next.setUTCHours(nextHour, 0, 0, 0);
  if (nextHour <= currentHour) {
    next.setDate(next.getDate() + 1);
  }
  
  const diff = Math.floor((next - now) / 1000 / 60);
  return `${next.toISOString()} (in ${diff} minutes)`;
}

// Start server
app.listen(PORT, () => {
  const urls = getSupabaseUrls(SUPABASE_PROJECT_IDS);
  
  console.log(`\n${"=".repeat(70)}`);
  console.log(`🚀 SUPABASE KEEP-ALIVE SERVICE STARTED`);
  console.log(`${"=".repeat(70)}`);
  console.log(`📍 Service URL: ${SELF_URL}`);
  console.log(`📊 Monitoring: ${SUPABASE_PROJECT_IDS.length} Supabase project(s)`);
  console.log(`⏰ Supabase Pings: Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)`);
  console.log(`${"=".repeat(70)}`);
  
  if (SUPABASE_PROJECT_IDS.length > 0) {
    console.log(`\n📌 Your Supabase Projects:`);
    urls.forEach((url, i) => {
      const projectId = SUPABASE_PROJECT_IDS[i];
      console.log(`   ${i + 1}. ${projectId} → ${url}`);
    });
  } else {
    console.log(`\n⚠️ WARNING: No Supabase projects configured!`);
    console.log(`   Add SUPABASE_PROJECT_IDS to your .env file`);
  }
  
  console.log(`\n${"=".repeat(70)}`);
  console.log(`⚡ IMPORTANT: To keep this service awake on Render free tier:`);
  console.log(`   1. Sign up at https://uptimerobot.com (free)`);
  console.log(`   2. Create a monitor with URL: ${SELF_URL}`);
  console.log(`   3. Set interval to 5 minutes`);
  console.log(`   This will ping YOUR service to keep it awake!`);
  console.log(`${"=".repeat(70)}\n`);
  console.log(`✅ Service is ready!\n`);
});