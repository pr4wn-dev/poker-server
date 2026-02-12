# 🖥️ Setup Guide - New Machine (Boss's House)

**Quick setup guide for running the poker game on a different computer.**

---

## Prerequisites

### Install These First:
1. **Node.js 18+** - https://nodejs.org/
2. **WAMP or XAMPP** (for MySQL database)
   - WAMP: https://www.wampserver.com/
   - XAMPP: https://www.apachefriends.org/
3. **Unity Hub + Unity 2021.3+** - https://unity.com/download
4. **Git** - https://git-scm.com/

---

## Server Setup (poker-server)

### 1. Clone Repository
```bash
git clone https://github.com/pr4wn-dev/poker-server.git
cd poker-server
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Database
**Start WAMP/XAMPP:**
- Start MySQL service
- Open phpMyAdmin: http://localhost/phpmyadmin
- Create database: `poker_game`

**Database will auto-create tables on first run!**

### 4. Configure Environment
```bash
# Copy template
copy .env.example .env

# Edit .env file and set:
DB_PASSWORD=your_mysql_root_password
# (other settings should work as-is)
```

### 5. Start Server
```bash
npm start
```

**Server should start on:** http://localhost:3000

---

## Unity Client Setup (poker-client-unity)

### 1. Clone Repository
```bash
git clone https://github.com/pr4wn-dev/poker-client-unity.git
```

### 2. Open in Unity
- Open Unity Hub
- Click "Open" or "Add"
- Select `poker-client-unity` folder
- Unity will import all assets (takes 5-10 minutes first time)

### 3. Configure Server URL

**If server is on same machine (localhost):**
- No changes needed! Default: `http://localhost:3000`

**If server is on different machine (boss's server):**
1. Open scene: `Assets/Scenes/MainMenuScene`
2. Find GameObject: `SocketManager` (in Hierarchy)
3. In Inspector: Set `Server Url` to: `http://192.168.X.X:3000`
   - Replace `192.168.X.X` with boss's server IP
   - Find IP on server machine: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)

### 4. Test Connection
- Click Play in Unity
- Should connect to server automatically
- Check Unity Console for connection logs

---

## Testing Phone Connection

### 1. Build to Phone
- Unity → File → Build Settings
- Platform: Android/iOS
- Build and Run

### 2. Server Must Be Accessible
**On server machine:**
```bash
# Find your IP address
ipconfig
# Look for "IPv4 Address" like 192.168.1.100
```

**Update Unity Server URL:**
- Set to: `http://192.168.1.100:3000`

**Firewall:**
- Allow port 3000 in Windows Firewall
- Or temporarily disable firewall for testing

### 3. Same Network
- Phone and server must be on same WiFi network
- Test: Ping server IP from phone's browser

---

## Common Issues

### "Cannot connect to server"
- ✅ Check server is running: `npm start`
- ✅ Check server URL in Unity (SocketManager Inspector)
- ✅ Check firewall allows port 3000
- ✅ Check both on same network (WiFi)

### "Database connection failed"
- ✅ Check WAMP/XAMPP MySQL is running
- ✅ Check `.env` has correct DB_PASSWORD
- ✅ Check database `poker_game` exists in phpMyAdmin

### "Module not found"
- ✅ Run `npm install` again
- ✅ Delete `node_modules` and `package-lock.json`, then `npm install`

### Unity "Assembly errors"
- ✅ Wait for Unity to finish importing (first time is slow)
- ✅ Close and reopen Unity
- ✅ Assets → Reimport All

---

## Quick Test Checklist

### Server:
- [ ] MySQL running (WAMP/XAMPP green)
- [ ] `npm start` shows "Server running on port 3000"
- [ ] `npm start` shows "Database connected"
- [ ] No errors in console

### Unity Client:
- [ ] Scene opens without errors
- [ ] Console shows "Connected to server" when playing
- [ ] Can register/login
- [ ] Can create/join tables

### Phone:
- [ ] Server URL set to network IP (not localhost)
- [ ] Phone on same WiFi as server
- [ ] Build runs and connects

---

## Environment Differences (Boss's House)

### WiFi Network
- Boss's WiFi will have different IP range
- Find new IP: `ipconfig` on server machine
- Update Unity Server URL

### MySQL Password
- Boss's WAMP/XAMPP might have different root password
- Update `.env` file: `DB_PASSWORD=boss_password`

### Ports
- Port 3000 must be available (not used by other apps)
- If blocked, change in `.env`: `PORT=3001` and update Unity

---

## Files to NOT Push to GitHub

❌ **NEVER commit these:**
- `.env` (has passwords!)
- `node_modules/` (too big, generated)
- `logs/` (runtime logs)
- Unity `Library/` folder (huge, generated)
- Unity `Temp/` folder (temporary)

✅ **Safe to commit:**
- `.env.example` (template, no secrets)
- All source code (`.js`, `.cs` files)
- Unity assets (sprites, prefabs, scenes)

---

## Need Help?

**Server logs:** Check console where you ran `npm start`  
**Unity logs:** Unity Editor → Console window  
**Database:** phpMyAdmin → http://localhost/phpmyadmin

**Everything is pushed to GitHub - just clone and setup! 🚀**
