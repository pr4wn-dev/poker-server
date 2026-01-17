# Installation Progress Log

> **Started:** January 17, 2026
> **Goal:** Get poker game running locally for Monday demo

---

## 🔄 CURRENT STATUS

**Step:** Installing XAMPP
**Status:** ⏳ Ready to start

---

## ✅ COMPLETED STEPS

| Step | Status | Notes |
|------|--------|-------|
| Code complete (server) | ✅ Done | All features ready |
| Code complete (Unity client) | ✅ Done | All scenes ready |
| GitHub repos synced | ✅ Done | Both pushed |
| Node.js installed | ✅ Done | v24.13.0, npm 11.6.2 |
| npm install | ✅ Done | 184 packages installed |

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

### 2. XAMPP Installation
- [ ] Downloaded from apachefriends.org
- [ ] Ran installer
- [ ] Selected MySQL component
- [ ] Installed to default path (C:\xampp)
- [ ] Opened XAMPP Control Panel
- [ ] Started MySQL service
- [ ] MySQL showing green "Running"

**Result:** _not started_

---

### 3. Database Setup
- [ ] Created `.env` file in poker-server folder
- [ ] Set DB_HOST=localhost
- [ ] Set DB_USER=root
- [ ] Set DB_PASSWORD= (blank)
- [ ] Set DB_NAME=poker_game
- [x] Ran `npm install` ✅ (done in step 1)
- [ ] Ran `npm run setup`
- [ ] Tables created successfully

**Result:** _waiting for XAMPP_

---

### 4. Server Test
- [ ] Ran `npm start`
- [ ] Server started on port 3000
- [ ] No errors in console
- [ ] Tested http://localhost:3000 in browser

**Result:** _not started_

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

**PC Local IP:** _not recorded yet_
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


