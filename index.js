import express from "express";
import axios from "axios";
import cron from "node-cron";

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_APIS = [
//unburden
  "https://wcirwapsqqwhjdwxjaxv.supabase.co/rest/v1/",
//yd_xm
  "https://ojxmkrxjqqiuljbjlzbp.supabase.co/rest/v1/",
//chef_ivy
 "https://eevhvgzgyfelrnfrovrt.supabase.co/rest/v1/",
//sui-autoforge
 "https://krryepbfnchjpvtanhqf.supabase.co/rest/v1/",
//victory-mode
 "https://dxdlbdqbmwrnrzxrjsya.supabase.co/rest/v1/",
//focusMe-app
 "https://ynejsrlwwsoxnrvmpdnb.supabase.co/rest/v1/",
//my-porfolio
 "https://nmsvurpcujgjqpcalldh.supabase.co/rest/v1/",
//snag-app
 "https://sfmntmmyfxzjgorcbrjo.supabase.co/rest/v1/",
//nexu-mandiri
 "https://jaystmavbrhuwuihfnkg.supabase.co/rest/v1/"
];

// Function to ping all Supabase projects
const pingSupabase = async () => {
  console.log(" Running scheduled Supabase pings...");
  for (const url of SUPABASE_APIS) {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      console.log(`${url} responded with ${response.status}`);
    } catch (error) {
      console.error(`Error pinging ${url}: ${error.message}`);
    }
  }
};

// Run immediately on startup
pingSupabase();

// Schedule: every 24 hours
cron.schedule("0 */24 * * *", () => {
  pingSupabase();
});

app.get("/", (req, res) => {
  res.send("✅ Supabase keep-alive service is running!");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
