# 🚀 Supabase Keep-Alive Service - Complete Setup Guide

## What This Solves

**Problem**: Supabase free tier pauses projects after 7 days of inactivity.  
**Solution**: This service pings your Supabase projects every 6 hours to keep them active.

---

## 📋 Prerequisites

1. Node.js installed (v16+)
2. A Render.com account (free tier works)
3. UptimeRobot account (free - to keep Render service awake)

---

## 🔧 Setup Instructions

### Step 1: Get Your Supabase Project IDs

1. Go to your Supabase dashboard: https://app.supabase.com
2. Find your project URL (looks like: `https://abc123xyz.supabase.co`)
3. Copy only the project ID part: `abc123xyz`
4. Repeat for each project you want to monitor

### Step 2: Configure Environment Variables

Create a `.env` file:

```bash
# Single project
SUPABASE_PROJECT_IDS=abc123xyz

# Multiple projects (comma-separated)
SUPABASE_PROJECT_IDS=abc123xyz,def456uvw,ghi789rst
```

**That's it!** No need to write full URLs anymore.

### Step 3: Test Locally (Optional)

```bash
npm install
npm start
```

Visit `http://localhost:3000` to see the service running.

---

## 🚀 Deploy to Render

### Option A: Deploy from GitHub (Recommended)

1. Push your code to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com/)
3. Click **New +** → **Web Service**
4. Connect your GitHub repository
5. Configure:
   - **Name**: `supabase-keepalive` (or any name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
6. Add Environment Variable:
   - **Key**: `SUPABASE_PROJECT_IDS`
   - **Value**: `abc123xyz,def456uvw` (your project IDs)
7. Click **Create Web Service**

### Option B: Deploy Manually

1. Install Render CLI: `npm install -g render`
2. Login: `render login`
3. Deploy: `render deploy`

---

## ⚡ Keep Your Service Awake (CRITICAL!)

**Problem**: Render's free tier spins down after 15 minutes of inactivity.  
**Solution**: Use UptimeRobot to ping your service every 5 minutes.

### Setup UptimeRobot (Takes 2 minutes)

1. Go to [UptimeRobot](https://uptimerobot.com) and sign up (free)
2. Click **+ Add New Monitor**
3. Configure:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: Supabase Keep-Alive
   - **URL**: `https://your-service-name.onrender.com` (your Render URL)
   - **Monitoring Interval**: 5 minutes
4. Click **Create Monitor**

**Done!** Your service will now stay awake 24/7.

---

## 🔍 How to Verify It's Working

### Check Service Status

Visit your Render URL: `https://your-service-name.onrender.com`

You should see:
```json
{
  "status": "✅ Supabase Keep-Alive Service Running",
  "monitoring": {
    "project_count": 2,
    "project_ids": ["abc123", "def456"]
  },
  "last_supabase_ping": "2024-01-15T12:00:00.000Z"
}
```

### Check Detailed Stats

Visit: `https://your-service-name.onrender.com/stats`

### Trigger Manual Ping

Visit: `https://your-service-name.onrender.com/ping`

---

## 📊 Endpoints Reference

| Endpoint | Purpose | Example |
|----------|---------|---------|
| `/` | Service status & info | `https://your-app.onrender.com/` |
| `/health` | Health check (for monitoring) | `https://your-app.onrender.com/health` |
| `/stats` | Detailed statistics | `https://your-app.onrender.com/stats` |
| `/ping` | Manual ping trigger | `https://your-app.onrender.com/ping` |

---

## ⏰ Ping Schedule

- **Supabase Projects**: Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
- **Your Service** (via UptimeRobot): Every 5 minutes

### Why 6 hours?

- Supabase pauses after 7 days (168 hours) of inactivity
- 6-hour pings = 4 pings per day = 28 pings per week
- Huge buffer to prevent pausing

---

## 🐛 Troubleshooting

### Service keeps spinning down
- ✅ Make sure UptimeRobot monitor is active
- ✅ Check UptimeRobot is set to 5-minute intervals
- ✅ Verify the URL in UptimeRobot matches your Render URL

### Supabase projects still pausing
- ✅ Check `/stats` endpoint to see if pings are successful
- ✅ Verify your project IDs are correct
- ✅ Check Render logs for errors: `Logs` tab in Render dashboard

### "No Supabase projects configured" error
- ✅ Make sure `SUPABASE_PROJECT_IDS` is set in Render environment variables
- ✅ Don't include `.supabase.co` in the IDs - just the ID part

### How to check Render logs
1. Go to your service in Render dashboard
2. Click **Logs** tab
3. Look for ping confirmations every 6 hours

---

## 💰 Cost

**Total: $0/month**

- Render Web Service: Free tier (750 hours/month)
- UptimeRobot: Free tier (50 monitors, 5-min intervals)
- Supabase: Free tier stays active!

---

## 🔐 Security Notes

- No API keys needed (pings public REST endpoints)
- No authentication required
- Service only reads from Supabase (GET requests)
- All endpoints are safe to expose publicly

---

## 📝 Example Configuration

**For 3 Supabase projects:**

```bash
# .env file
SUPABASE_PROJECT_IDS=abc123xyz,def456uvw,ghi789rst
```

**Service will ping:**
- `https://abc123xyz.supabase.co/rest/v1/`
- `https://def456uvw.supabase.co/rest/v1/`
- `https://ghi789rst.supabase.co/rest/v1/`

**Every 6 hours, automatically!**

---

## 🎉 You're Done!

Your Supabase projects will now stay active 24/7 without manual intervention.

**Questions?** Check the `/stats` endpoint or Render logs for diagnostics.