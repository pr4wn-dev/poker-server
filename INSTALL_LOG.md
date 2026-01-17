# Installation Progress Log

> **Started:** January 17, 2026
> **Goal:** Get poker game running for Monday demo

---

## 🏠 SETUP OVERVIEW

| Location | Purpose | What's Installed |
|----------|---------|------------------|
| **Home PC** | Development (Cursor, code editing) | Node.js, XAMPP, Unity 6 LTS, Git |
| **Boss's PC (Monday)** | Production Server | Will install: Node.js, XAMPP |

**Workflow:**
- You edit code at home → push to GitHub
- Server at boss's place pulls from GitHub → runs the game
- Unity builds the Android APK that players install

---

## 📦 EXACT VERSIONS

| Software | Version | Download Link |
|----------|---------|---------------|
| Node.js | v24.13.0 | https://nodejs.org/ |
| npm | 11.6.2 | (comes with Node.js) |
| XAMPP | 8.2.12 / PHP 8.2.12 | https://www.apachefriends.org/download.html |
| Unity Hub | Latest | https://unity.com/download |
| Unity Editor | 6 LTS (6.3) | (via Unity Hub) |

---

## ✅ HOME PC - COMPLETED

| Step | Status | Notes |
|------|--------|-------|
| Code complete (server) | ✅ Done | All features ready |
| Code complete (Unity client) | ✅ Done | All scenes ready |
| GitHub repos synced | ✅ Done | Both pushed |
| Node.js v24.13.0 | ✅ Done | + npm 11.6.2 |
| XAMPP 8.2.12 | ✅ Done | MySQL on port 3306 |
| Database tables | ✅ Done | All created |
| Server tested | ✅ Done | Runs on 192.168.1.23:3000 |
| Unity 6 LTS | ⏳ Installing | With Android Build Support |

**GitHub Repos:**
- Server: `https://github.com/pr4wn-dev/poker-server`
- Unity Client: `https://github.com/pr4wn-dev/poker-client-unity`

---

## 📋 MONDAY CHECKLIST - BOSS'S SERVER PC

### Before You Go
- [ ] Make sure latest code is pushed to GitHub from home
- [ ] Have this checklist ready on your phone or printed

### At Boss's Place - Server Setup (15-20 min)

#### Step 1: Install Node.js
```
1. Go to https://nodejs.org/
2. Download LTS (should be v24.x)
3. Run installer → Next → Next → CHECK "Tools for Native Modules" → Install
4. Wait for black window to finish (takes 5-10 min)
5. Press ENTER when it says "Type ENTER to exit"
```

#### Step 2: Install XAMPP
```
1. Go to https://www.apachefriends.org/download.html
2. Download 8.2.12 (or latest)
3. Run installer → Keep MySQL checked → Install to C:\xampp
4. Open XAMPP Control Panel
5. Click START next to MySQL → wait for GREEN
```

#### Step 3: Get Server Code
```powershell
# Open PowerShell or Command Prompt
cd C:\Projects
git clone https://github.com/pr4wn-dev/poker-server.git
cd poker-server
```

#### Step 4: Setup & Run Server
```powershell
# Install dependencies
npm install

# Copy environment file
Copy-Item env.example .env

# Create database tables
echo y | npm run setup

# Start server
npm start
```

#### Step 5: Note the Server IP
- Server will show: `Network: http://192.168.X.X:3000`
- **Write this IP down** - Unity clients connect here!

#### Step 6: Port Forward (for outside access)
```
1. Open router admin (usually 192.168.1.1 or 192.168.0.1)
2. Find "Port Forwarding" 
3. Add rule: External Port 3000 → Internal IP (server PC) → Port 3000
4. Save
```

### Unity Client Setup

#### Option A: Use Pre-Built APK
- Build APK at home before Monday
- Transfer to phones via USB or cloud

#### Option B: Install Unity at Boss's (takes longer)
```
1. Download Unity Hub from https://unity.com/download
2. Install Unity 6 LTS with Android Build Support
3. Clone: git clone https://github.com/pr4wn-dev/poker-client-unity.git
4. Open project in Unity
5. Update serverUrl in SocketManager.cs to boss's server IP
6. Build → Android APK
```

---

## 🔄 UPDATING SERVER FROM HOME

Once server is set up at boss's place, you can update it remotely:

### From Home (push changes):
```powershell
cd C:\Projects\poker-server
git add .
git commit -m "Your changes"
git push
```

### At Boss's Server (pull changes):
```powershell
cd C:\Projects\poker-server
git pull
# Restart server if needed
npm start
```

**OR** set up auto-pull (advanced - can do later)

---

## 🆘 TROUBLESHOOTING

### Node.js Not Found
```powershell
node --version  # Should show v24.x
# If not found, restart terminal or check PATH
```

### MySQL Won't Start
```
- Open XAMPP Control Panel
- Check if port 3306 is blocked
- Try "Stop" then "Start" again
```

### Server Won't Connect to Database
```powershell
# Check MySQL is running
netstat -an | findstr 3306

# Check .env file exists and has correct settings
cat .env
```

### Can't Connect from Phone
```
1. Make sure phone is on same WiFi as server
2. Check Windows Firewall allowed Node.js
3. Try: http://SERVER_IP:3000 in phone browser
```

---

## 📝 NOTES

- Monday demo with boss
- Home PC IP: 192.168.1.23 (for local testing only)
- Boss's server IP: TBD Monday
- Unity 6 LTS is compatible with our code (uses stable APIs)

---

## 🎮 PLAYING THE GAME

1. Server running at `http://BOSS_SERVER_IP:3000`
2. Install APK on Android phones
3. Open app → Register/Login
4. Create table or join existing one
5. Play poker! 🃏

