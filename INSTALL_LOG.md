# POKER GAME - MASTER PROJECT LOG

> **READ THIS FILE AT START OF EVERY SESSION**
> 
> **Last Updated:** January 17, 2026
> **Session:** 5 - Fixing Unity compilation and Socket.IO issues
> **Next:** Test multiplayer flow end-to-end
> **Goal:** Get poker game running for Monday demo

## ⚠️ AGENT RULES - FOLLOW THESE ALWAYS

1. **COMMIT CHANGES AUTOMATICALLY** - Don't wait to be asked. After making code changes, immediately `git add -A; git commit -m "message"; git push`
2. **READ THIS LOG AT SESSION START** - Check for solutions before debugging
3. **ADD NEW ISSUES TO THIS LOG** - Document every fix with symptoms, cause, and solution
4. **ONE MASTER LOG FILE** - All notes go here, not in separate files

---

## 📋 PROJECT OVERVIEW

Building a **Texas Hold'em Poker Game** with two modes:
1. **Multiplayer** - Real-time online poker with friends
2. **Adventure** - Single-player progression with XP, world map, and poker bosses

**Tech Stack:**
- **Server:** Node.js + Socket.IO (WebSockets) + MySQL
- **Client:** Unity C# (Android target)
- **Database:** MySQL (included with WAMP/XAMPP)

**Repositories:**
- Server: `https://github.com/pr4wn-dev/poker-server`
- Client: `https://github.com/pr4wn-dev/poker-client-unity`

**Project Paths:**
- Server: `C:\Projects\poker-server`
- Unity Client: `C:\Projects\poker-client-unity`

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

## 🔧 ISSUES ENCOUNTERED & SOLUTIONS

### 1. SocketIOUnity GetValue<T>() Returns Default Values (CRITICAL)
**Symptoms:**
- Server sends `{"success":true,...}` 
- Unity receives it but `response.success` is `false`
- All fields have default values instead of parsed values

**Root Cause:**
SocketIOUnity's `GetValue<T>()` method doesn't properly deserialize JSON to C# classes with `[Serializable]` attribute.

**Solution:**
In `SocketManager.cs`, DON'T use `response.GetValue<T>()` directly. Instead:
```csharp
// Get JSON string from response object
var obj = response.GetValue<object>();
string jsonStr = obj.ToString();

// Use Unity's JsonUtility to deserialize
var result = JsonUtility.FromJson<T>(jsonStr);
```

---

### 2. Empty Email Causes Duplicate Entry Error
**Symptoms:**
- Server crashes with `ER_DUP_ENTRY` for empty email
- Multiple users can't register without email

**Solution:**
In `UserRepository.js`, only check email uniqueness if email is provided:
```javascript
if (email && email.trim() !== '') {
    // Check email uniqueness
}
```

---

### 3. Unity Mock Mode Keeps Reverting
**Symptoms:**
- `useMockMode` checkbox keeps turning back on
- Client shows "Connected" but doesn't actually connect

**Solution:**
1. Set default value in code: `public bool useMockMode = false;`
2. Delete the Services GameObject
3. Re-add it fresh (gets new default value)

---

### 4. "No overload for EmitStringAsJSON takes 3 arguments"
**Symptoms:**
- Compile error with SocketIOUnity Emit methods

**Solution:**
Use this pattern for events with responses:
```csharp
// Listen for response event first
_socket.On(eventName + "_response", handler);

// Then emit the request
_socket.Emit(eventName, data);
```

---

### 5. Unity Duplicate Class Definitions
**Symptoms:**
- CS0101 errors: "namespace already contains a definition for..."

**Causes:**
1. Nested Scripts folder (`Assets/Scripts/Scripts/`)
2. Duplicate response classes in both `NetworkModels.cs` and `GameService.cs`

**Solution:**
- Delete duplicate folders
- Keep response classes ONLY in `NetworkModels.cs`

---

### 6. WorldMapArea Not Found
**Symptoms:**
- CS0246: Type 'WorldMapArea' could not be found

**Solution:**
The class is named `AreaInfo` in `NetworkModels.cs`. Update references to use `AreaInfo`.

---

### 7. Git Remote Already Exists
**Symptoms:**
- `fatal: remote origin already exists`

**Solution:**
```powershell
git remote set-url origin https://github.com/YOUR_USERNAME/repo-name.git
```

---

### 8. PowerShell && Operator Error
**Symptoms:**
- "The token '&&' is not a valid statement separator"

**Solution:**
Use semicolons instead, or run commands separately:
```powershell
cd folder; command1; command2
```

---

## 📝 NOTES

- Monday demo with boss
- Home PC IP: 192.168.1.23 (for local testing only)
- Boss's server IP: TBD Monday
- Unity 6 LTS is compatible with our code (uses stable APIs)
- **CRITICAL:** Always use `JsonUtility.FromJson<T>()` for SocketIOUnity responses!

---

## 🎮 PLAYING THE GAME

1. Server running at `http://BOSS_SERVER_IP:3000`
2. Install APK on Android phones
3. Open app → Register/Login
4. Create table or join existing one
5. Play poker! 🃏

---

## ✅ DEMO READY CHECKLIST

- [x] Server code complete
- [x] Unity client code complete
- [x] Socket connection working
- [x] Registration working
- [x] Login working
- [x] Main menu displaying
- [ ] Multiplayer table creation (testing now)
- [ ] Multiplayer joining
- [x] Adventure mode - WORKING! World map, boss selection, start adventure all functional
- [ ] AdventureBattleScene (needs to be created)
- [ ] Android APK build

---

## 🔧 ADDITIONAL ISSUES & SOLUTIONS (Session 2)

### 9. GameService/SocketManager Getting Destroyed Despite DontDestroyOnLoad
**Symptoms:**
- GameService created with DontDestroyOnLoad but still destroyed on scene change
- AdventureScene can't find GameService.Instance

**Root Cause:**
Unknown - possibly Unity 6 behavior or scene-specific object in hierarchy

**Solution:**
Changed GameService and SocketManager to use lazy singleton pattern:
```csharp
private static GameService _instance;
public static GameService Instance 
{ 
    get 
    {
        if (_instance == null)
        {
            _instance = FindAnyObjectByType<GameService>(FindObjectsInactive.Include);
            if (_instance == null)
            {
                var go = new GameObject("Services");
                _instance = go.AddComponent<GameService>();
                go.AddComponent<SocketManager>();
            }
        }
        return _instance;
    }
}
```
Also made `CurrentUser` static so login state survives recreation.

---

### 10. GetComponent<LayoutElement>() Returns Null
**Symptoms:**
- NullReferenceException on `.GetComponent<LayoutElement>().preferredHeight = 30;`

**Solution:**
Added extension method in UIFactory.cs:
```csharp
public static LayoutElement GetOrAddLayoutElement(this GameObject go)
{
    var le = go.GetComponent<LayoutElement>();
    if (le == null)
        le = go.AddComponent<LayoutElement>();
    return le;
}
```
Then use `go.GetOrAddLayoutElement().preferredHeight = 30;`

---

### 11. Server Using Callbacks But Client Expects Response Events
**Symptoms:**
- Client emits event, server processes it, but client never receives response
- Adventure mode shows "Loading..." forever

**Root Cause:**
Server was using `callback({ success: true, ... })` but client listens for `eventName_response` events.

**Solution:**
Update server handlers to emit response events:
```javascript
socket.on('get_world_map', async (data, callback) => {
    const response = { success: true, mapState: await manager.getMapState(userId) };
    if (callback) callback(response);  // For old clients
    socket.emit('get_world_map_response', response);  // For new clients
});
```

---

### 12. SocketManager._socket is Null When Emit Called
**Symptoms:**
- NullReferenceException in SocketManager.Emit
- Socket never connected

**Solution:**
Auto-connect when creating on demand:
```csharp
if (_instance == null)
{
    var go = new GameObject("SocketManager");
    _instance = go.AddComponent<SocketManager>();
    DontDestroyOnLoad(go);
    _instance.Connect();  // Auto-connect!
}
```

Also added safety check in Emit:
```csharp
if (_socket == null)
{
    Connect();
    if (_socket == null) { callback?.Invoke(null); return; }
}
```

---

### 13. Missing `using PokerClient.UI;` Import in Scene Files
**Symptoms:**
- Blue screen when playing in Unity
- No compile errors but UI doesn't build
- `Theme.Current` and `UIFactory` not found at runtime

**Root Cause:**
Scene files and component files were importing `PokerClient.UI.Components` but `Theme` and `UIFactory` are in `PokerClient.UI` namespace.

**Solution:**
Add `using PokerClient.UI;` to all files that use Theme or UIFactory:
- All files in `Scripts/UI/Scenes/`
- All files in `Scripts/UI/Components/`

---

### 14. Nullable int? Operator Misuse
**Symptoms:**
- CS0019: Operator '??' cannot be applied to operands of type 'int' and 'int'
- CS0266: Cannot implicitly convert type 'float?' to 'float'

**Root Cause:**
Using `??` operator on non-nullable types, or doing math with nullable types without handling null.

**Solution:**
Check which fields are actually nullable in `NetworkModels.cs`:
```csharp
// WRONG - playerLevel is int, not int?
playerLevelText.text = $"Level {state.playerLevel ?? 1}";

// RIGHT - only xpForNextLevel is nullable
int xpNeeded = state.xpForNextLevel ?? 100;
float progress = xpNeeded > 0 ? (float)state.playerXP / xpNeeded : 0;
```

---

### 15. GetOrAddComponent Extension Method
**Issue:** `GetComponent<LayoutElement>()` returns null because UIFactory doesn't add LayoutElements.

**Solution:** Added extension method in `UIFactory.cs`:
```csharp
public static class GameObjectExtensions
{
    public static T GetOrAddComponent<T>(this GameObject go) where T : Component
    {
        var component = go.GetComponent<T>();
        if (component == null)
            component = go.AddComponent<T>();
        return component;
    }
    
    public static T GetOrAddComponent<T>(this Component c) where T : Component
    {
        return c.gameObject.GetOrAddComponent<T>();
    }
}
```

Use: `title.GetOrAddComponent<LayoutElement>().preferredHeight = 50;`

---

### 16. SocketIOUnity Callback Pattern Doesn't Work Reliably
**Symptoms:**
- Client emits event, loading spinner never stops
- Server logs show event received and response sent
- Client callback never fires

**Root Cause:**
SocketIOUnity's `EmitAsync` with callback doesn't reliably receive responses. The socket.io callback mechanism may not work the same as in JavaScript.

**Solution:**
Instead of using callbacks, have the server emit a `eventName_response` event:

**Server (Node.js):**
```javascript
socket.on('create_table', (data, callback) => {
    const response = { success: true, tableId: table.id };
    if (callback) callback(response);  // Keep for compatibility
    socket.emit('create_table_response', response);  // This is what client uses
});
```

**Client (C#):**
```csharp
public void Emit<T>(string eventName, object data, Action<T> callback) where T : class
{
    string responseEvent = eventName + "_response";
    
    void OnResponse(SocketIOResponse response)
    {
        _socket.Off(responseEvent);  // Unsubscribe after receiving
        var obj = response.GetValue<object>();
        string jsonStr = obj?.ToString() ?? "{}";
        var result = JsonUtility.FromJson<T>(jsonStr);
        UnityMainThread.Execute(() => callback?.Invoke(result));
    }
    
    _socket.On(responseEvent, OnResponse);
    _socket?.EmitAsync(eventName, data);
}
```

---

### 17. SocketIOUnity Namespace Collision
**Symptoms:**
- CS0426: The type name 'SocketIOUnity' does not exist in the type 'SocketIOUnity'
- Can't use fully qualified name `SocketIOUnity.SocketIOUnity`

**Root Cause:**
The SocketIOUnity package has a namespace AND class with the same name. C# gets confused when you try `SocketIOUnity.SocketIOUnity`.

**Solution:**
Just import the namespace and use the class directly:
```csharp
#if SOCKET_IO_AVAILABLE
using SocketIOClient;
using SocketIOUnity;  // Just the namespace
#endif

// Then use it directly:
private SocketIOUnity _socket;  // Class name same as namespace - works after using

_socket = new SocketIOUnity(uri, new SocketIOOptions
{
    Transport = SocketIOClient.Transport.TransportProtocol.WebSocket
});
```

**DON'T DO THIS:**
```csharp
using SIOUnity = SocketIOUnity.SocketIOUnity;  // FAILS - namespace/type conflict
private SocketIOUnity.SocketIOUnity _socket;   // FAILS - same reason
using SocketIOUnity;  // FAILS - CS0138: it's a type, not a namespace
```

**CORRECT APPROACH:**
```csharp
#if SOCKET_IO_AVAILABLE
using SocketIOClient;
// SocketIOUnity class is in GLOBAL namespace - no using needed!
#endif

// Just use the class directly:
private SocketIOUnity _socket;
_socket = new SocketIOUnity(uri, new SocketIOOptions { ... });
```

---

### 19. Unity: CS0656 - Dynamic Keyword Not Supported
**Symptoms:**
- CS0656: Missing compiler required member 'Microsoft.CSharp.RuntimeBinder.CSharpArgumentInfo.Create'
- Happens when using `dynamic` keyword

**Root Cause:**
Unity doesn't include Microsoft.CSharp.dll by default. The `dynamic` keyword requires this assembly.

**Solution:**
DON'T use `dynamic` in Unity. Instead use JSON parsing:
```csharp
// WRONG - doesn't work in Unity:
var username = ((dynamic)data).username;

// RIGHT - use Newtonsoft.Json:
var json = JsonConvert.SerializeObject(data);
var jobj = JObject.Parse(json);
string username = jobj["username"]?.ToString() ?? "DefaultValue";
```

---

### 20. Unity: Anonymous Types Cause Same CS0656 Error
**Symptoms:**
- Same CS0656 error even after removing `dynamic`
- Code uses `return new { success = true, ... }`

**Root Cause:**
Anonymous types in Unity also use the runtime binder internally.

**Solution:**
Replace anonymous types with proper classes:
```csharp
// WRONG - anonymous type:
return new { success = true, tableId = "123" };

// RIGHT - use proper response class:
return new CreateTableResponse { success = true, tableId = "123" };
```

---

### 21. SOCKET_IO_AVAILABLE Only Defined for Android
**Symptoms:**
- Socket code works on Android but not in Editor
- Unity falls back to mock mode when testing in Editor

**Root Cause:**
In ProjectSettings.asset, `SOCKET_IO_AVAILABLE` is only defined for Android platform.

**Solution:**
Either:
1. Add define for Standalone in Project Settings → Player → Scripting Define Symbols
2. Or make mock mode actually work (use proper response classes, not anonymous types)
3. Or remove the `#if SOCKET_IO_AVAILABLE` checks if package is always installed

---

### 18. SocketIOUnity GetValue<T>() Returns Wrong Data
**Symptoms:**
- `response.GetValue<MyClass>()` returns object with all default values
- Server sends `{"success":true}` but client gets `success = false`

**Root Cause:**
SocketIOUnity uses System.Text.Json or Newtonsoft internally, but Unity's `[Serializable]` classes need `JsonUtility`.

**Solution:**
Get raw JSON string, then use `JsonUtility.FromJson<T>()`:
```csharp
var obj = response.GetValue<object>();
string jsonStr = obj?.ToString() ?? "{}";
var result = JsonUtility.FromJson<T>(jsonStr);
```

---

## 📋 SOCKET.IO BEST PRACTICES FOR THIS PROJECT

### Event Naming Convention
- Client sends: `event_name` (e.g., `create_table`, `join_table`)
- Server responds: `event_name_response` (e.g., `create_table_response`)

### Response Format
All responses should follow this pattern:
```javascript
{
    success: boolean,
    error?: string,        // Only if success = false
    ...other_data          // Only if success = true
}
```

### Unity Client Pattern
```csharp
// 1. Listen for response event BEFORE emitting
_socket.On("my_event_response", OnResponse);

// 2. Emit the request
_socket.EmitAsync("my_event", data);

// 3. In OnResponse, unsubscribe immediately
void OnResponse(SocketIOResponse response) {
    _socket.Off("my_event_response");
    // Process response...
}
```

### Debugging Tips
1. Check Unity Console for `[SocketManager]` logs
2. Check Node.js console for server-side logs
3. Use browser at `http://localhost:3000` to verify server is running
4. Add `Debug.Log` for every emit and every response received

---

## ✅ COMPLETED FEATURES

### Server (poker-server)
| Feature | Status | Files |
|---------|--------|-------|
| Core poker game logic | ✅ Done | `src/game/Table.js`, `Deck.js`, `HandEvaluator.js` |
| WebSocket communication | ✅ Done | `src/sockets/SocketHandler.js`, `Events.js` |
| MySQL Database | ✅ Done | `src/database/Database.js` |
| User authentication | ✅ Done | `src/database/UserRepository.js` |
| XP System & World Map | ✅ Done | `src/adventure/WorldMap.js` |
| 12 Bosses across 8 areas | ✅ Done | `src/adventure/Boss.js` |
| Tournament System | ✅ Done | `src/game/Tournament.js` |

### Unity Client (poker-client-unity)
| Feature | Status | Files |
|---------|--------|-------|
| SocketManager (WebSocket) | ✅ Done | `Scripts/Networking/SocketManager.cs` |
| GameService API | ✅ Done | `Scripts/Networking/GameService.cs` |
| UI Theme System | ✅ Done | `Scripts/UI/Core/GameTheme.cs` |
| UI Factory | ✅ Done | `Scripts/UI/Core/UIFactory.cs` |
| MainMenuScene | ✅ Done | `Scripts/UI/Scenes/MainMenuScene.cs` |
| LobbyScene | ✅ Done | `Scripts/UI/Scenes/LobbyScene.cs` |
| TableScene | ✅ Done | `Scripts/UI/Scenes/TableScene.cs` |
| AdventureScene | ✅ Done | `Scripts/UI/Scenes/AdventureScene.cs` |

---

## 🎮 ADVENTURE MODE DESIGN

### World Map Areas
| Area | Requirements | Bosses |
|------|--------------|--------|
| Poker Academy | None | Dealer Dan |
| Downtown Casino | Level 2 | Slick Sally, Iron Mike |
| The Highrise | Level 5 | The Countess, The Cipher |
| The Underground | Level 8, 50k chips | Shadow, Viper |
| Golden Yacht | **Yacht Invitation item** | Captain Goldhand, The Heiress |
| Private Island | **Island Key item**, Level 15 | The Mogul, The Oracle |
| The Penthouse | Level 20 | **The House** (final boss) |
| ??? Lounge | **Mystery Token item** | ??? |

### Ultra-Rare Drops (All Tradeable!)
| Item | Drop Source | Drop Rate |
|------|-------------|-----------|
| Yacht Invitation | Iron Mike, Countess, Cipher, Shadow | 0.1-0.3% |
| Island Key | Viper, Captain, Heiress | 0.08-0.15% |
| Mystery Token | The Mogul, The Oracle, The House | 0.01-0.1% |

---

## 📁 KEY FILE LOCATIONS

### Server
```
poker-server/src/
├── server.js              # Entry point
├── database/Database.js   # MySQL connection
├── adventure/Boss.js      # All bosses defined
├── game/Table.js          # Poker table logic
└── sockets/SocketHandler.js # All socket events
```

### Unity Client
```
poker-client-unity/Assets/Scripts/
├── Networking/
│   ├── SocketManager.cs   # WebSocket connection
│   ├── GameService.cs     # High-level API
│   └── NetworkModels.cs   # All data models
├── UI/Core/
│   ├── UIFactory.cs       # UI element creation
│   └── GameTheme.cs       # Color/styling
└── UI/Scenes/             # All scene scripts
```

---

## 🚧 TODO / IN PROGRESS

- [ ] Test multiplayer table creation end-to-end
- [ ] Test multiplayer joining
- [ ] Adventure battle scene
- [ ] Android APK build
- [ ] Boss PC setup for Monday demo

