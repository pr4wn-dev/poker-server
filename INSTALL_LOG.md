# Installation Progress Log

> **Started:** January 17, 2026
> **Goal:** Get poker game running locally for Monday demo

---

## 📦 EXACT VERSIONS (for Monday replication)

| Software | Version | Download Link |
|----------|---------|---------------|
| Node.js | v24.13.0 (LTS) | https://nodejs.org/ |
| npm | 11.6.2 | (comes with Node.js) |
| XAMPP | 8.2.12 / PHP 8.2.12 | https://www.apachefriends.org/download.html |
| Unity Hub | _TBD_ | https://unity.com/download |
| Unity Editor | _TBD_ (2022.3 LTS recommended) | (via Unity Hub) |

### Monday Quick Install Commands
```powershell
# After Node.js installed:
cd C:\Projects\poker-server
npm install

# After XAMPP MySQL running:
npm run setup

# Start server:
npm start
```

---

## 🔄 CURRENT STATUS

**Step:** Installing Unity
**Status:** ⏳ Ready to start

**🟢 SERVER IS RUNNING AT:** `http://192.168.1.23:3000`

---

## ✅ COMPLETED STEPS

| Step | Status | Notes |
|------|--------|-------|
| Code complete (server) | ✅ Done | All features ready |
| Code complete (Unity client) | ✅ Done | All scenes ready |
| GitHub repos synced | ✅ Done | Both pushed |
| Node.js installed | ✅ Done | v24.13.0, npm 11.6.2 |
| npm install | ✅ Done | 184 packages installed |
| XAMPP installed | ✅ Done | 8.2.12 / PHP 8.2.12 |
| MySQL running | ✅ Done | Port 3306 |
| Database setup | ✅ Done | All tables created |
| Server started | ✅ Done | http://192.168.1.23:3000 |

---

## 📋 INSTALLATION PROGRESS

### 1. Node.js Installation ✅ COMPLETE
- [x] Downloaded from nodejs.org (LTS version)
- [x] Ran installer
- [x] Accepted license
- [x] Kept default install path
- [x] Checked "Tools for Native Modules" box
- [x] Clicked Install
- [x] Build tools installed (19 Chocolatey packages)
- [x] Restarted Cursor
- [x] Verified with `node --version` → v24.13.0
- [x] Verified with `npm --version` → 11.6.2
- [x] Ran `npm install` → 184 packages

**Result:** ✅ SUCCESS

---

### 2. XAMPP Installation ✅ COMPLETE
- [x] Downloaded from apachefriends.org (8.2.12)
- [x] Ran installer
- [x] Selected MySQL component
- [x] Installed to default path (C:\xampp)
- [x] Opened XAMPP Control Panel
- [x] Started MySQL service
- [x] MySQL showing green "Running"

**Result:** ✅ SUCCESS

---

### 3. Database Setup ✅ COMPLETE
- [x] Created `.env` file in poker-server folder
- [x] Set DB_HOST=localhost
- [x] Set DB_USER=root
- [x] Set DB_PASSWORD= (blank)
- [x] Set DB_NAME=poker_game
- [x] Ran `npm install` ✅ (done in step 1)
- [x] Ran `npm run setup`
- [x] Tables created successfully

**Result:** ✅ SUCCESS

---

### 4. Server Test ✅ COMPLETE
- [x] Ran `npm start`
- [x] Server started on port 3000
- [x] No errors in console
- [x] Database connected ✓
- [x] WebSocket ready ✓

**Local URL:** http://localhost:3000
**Network URL:** http://192.168.1.23:3000

**Result:** ✅ SUCCESS - SERVER RUNNING!

---

### 5. Unity Installation
- [ ] Downloaded Unity Hub
- [ ] Installed Unity Hub
- [ ] Logged into Unity account
- [ ] Installed Unity 2022.3 LTS
- [ ] Checked Android Build Support
- [ ] Android SDK installed
- [ ] Android NDK installed

**Result:** _not started_

---

### 6. Unity Project Setup
- [ ] Opened poker-client-unity project
- [ ] Imported TextMeshPro
- [ ] Added scenes to Build Settings
- [ ] Set orientation to Landscape
- [ ] Changed serverUrl to localhost:3000
- [ ] Built for Android

**Result:** _not started_

---

### 7. Network Setup (for remote play)
- [ ] Found PC's local IP (ipconfig)
- [ ] Logged into router
- [ ] Port forwarded 3000 → PC IP
- [ ] Allowed Node.js through Windows Firewall
- [ ] Tested from another device

**PC Local IP:** `192.168.1.23`
**Router Admin URL:** _usually 192.168.1.1 or 192.168.0.1_

**Result:** _not started_

---

## 🔧 ISSUES ENCOUNTERED

_None yet_

---

## 📝 NOTES

- User doing installs one by one
- Will need router port forwarding for remote play
- Monday demo with boss

---

## 🆘 IF SOMETHING BREAKS

### Node.js Issues
```powershell
# Check if installed
node --version
npm --version

# If not found, check PATH:
$env:PATH -split ';' | Select-String "node"

# Manual PATH fix (if needed):
# Add C:\Program Files\nodejs\ to System PATH
```

### XAMPP/MySQL Issues
```powershell
# Check if MySQL is running
netstat -an | findstr 3306

# If port 3306 not listening, MySQL isn't running
# Open XAMPP Control Panel and click Start next to MySQL
```

### npm install Issues
```powershell
# Clear npm cache
npm cache clean --force

# Delete node_modules and try again
Remove-Item -Recurse -Force node_modules
npm install
```

### Server Won't Start
```powershell
# Check what's using port 3000
netstat -ano | findstr 3000

# Kill process using port (replace PID with actual number)
taskkill /PID <PID> /F
```


