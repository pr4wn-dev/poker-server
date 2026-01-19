# Poker Server & Client Setup Guide for New PC/Server

This guide will help you set up both the poker-server (Node.js) and poker-client-unity (Unity) repositories on a new PC or server.

## Repositories
- **Server**: `https://github.com/pr4wn-dev/poker-server`
- **Client**: `https://github.com/pr4wn-dev/poker-client-unity`

---

## Prerequisites

### 1. Install Cursor
1. Download from https://cursor.sh
2. Install and **login with the same Cursor account** (syncs settings automatically)

### 2. Install Git
1. Download Git for Windows from https://git-scm.com/download/win
2. During installation:
   - Choose "Git Credential Manager" for credential storage
   - Use default options for everything else

### 3. Configure Git Credentials
Open PowerShell and run:
```powershell
git config --global user.name "bobby yontz"
git config --global user.email "megapr4wn@gmail.com"
```

### 4. Install Node.js (for poker-server)
1. Download Node.js 18+ from https://nodejs.org/
2. Install with default options
3. Verify installation:
   ```powershell
   node --version
   npm --version
   ```

### 5. Install Unity (for poker-client-unity)
1. Download Unity Hub from https://unity.com/download
2. Install Unity Hub
3. Install Unity 2022.3 LTS or newer via Unity Hub
4. During Unity installation, include:
   - **Android Build Support** (if building for Android)
   - **Visual Studio Community** (recommended for C# development)

---

## Step 1: Clone Repositories

### 1.1 Clone poker-server
```powershell
# Create directory structure
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\source\repos"
cd "$env:USERPROFILE\source\repos"

# Clone the server repository
git clone https://github.com/pr4wn-dev/poker-server.git
```

### 1.2 Clone poker-client-unity
```powershell
# Create Projects directory if it doesn't exist
New-Item -ItemType Directory -Force -Path "C:\Projects"
cd C:\Projects

# Clone the Unity client repository
git clone https://github.com/pr4wn-dev/poker-client-unity.git
```

**Note:** When cloning, Git Credential Manager will prompt you to authenticate with GitHub. Use your GitHub credentials or a Personal Access Token.

---

## Step 2: Setup poker-server

### 2.1 Navigate to server directory
```powershell
cd "$env:USERPROFILE\source\repos\poker-server"
```

### 2.2 Install dependencies
```powershell
npm install
```

### 2.3 Configure environment
```powershell
# Copy the example environment file
Copy-Item env.example .env

# Edit .env file with your preferred settings
# Default values:
# PORT=3000
# DEFAULT_STARTING_CHIPS=10000
# DEFAULT_SMALL_BLIND=50
# DEFAULT_BIG_BLIND=100
# MAX_PLAYERS=9
```

You can edit `.env` in Cursor or any text editor. The defaults should work for development.

### 2.4 Test the server
```powershell
# Development mode (with auto-reload)
npm run dev

# OR production mode
npm start
```

The server should start on port 3000 (or your configured port). You should see:
```
Server running on port 3000
```

### 2.5 Verify server is running
Open a browser and navigate to:
- `http://localhost:3000/health` - Should return health status
- `http://localhost:3000/api/tables` - Should return list of tables (may be empty)

---

## Step 3: Setup poker-client-unity

### 3.1 Open Unity project
1. Open Unity Hub
2. Click **"Open"** or **"Add"**
3. Navigate to `C:\Projects\poker-client-unity`
4. Select the folder and click **"Open"**
5. Unity will import the project (this may take a few minutes)

### 3.2 Install Socket.IO client package
The Unity project needs the Socket.IO client library. You have a few options:

**Option A: Using NuGet (Recommended)**
1. In Unity, go to **Window → Package Manager**
2. Click **"+"** → **"Add package from git URL"**
3. Enter: `https://github.com/doghappy/socket.io-client-csharp.git`
4. Click **"Add"**

**Option B: Manual installation**
1. Download socket.io-client-csharp from NuGet or GitHub
2. Extract DLLs to `Assets/Plugins/` folder
3. Unity will automatically import them

**Option C: Using .NET CLI (if you have it)**
```powershell
cd C:\Projects\poker-client-unity
dotnet add package SocketIOClient
```

### 3.3 Configure server address
1. In Unity, locate `PokerNetworkManager.cs` (usually in `Assets/Scripts/Networking/`)
2. Open it in Cursor or Visual Studio
3. Update the server URL to match your server:
   ```csharp
   // For local development
   private string serverUrl = "http://localhost:3000";
   
   // For server on network
   private string serverUrl = "http://192.168.1.100:3000"; // Replace with your server IP
   ```

### 3.4 Build for Android (Optional)
1. In Unity: **File → Build Settings**
2. Select **Android** platform
3. Click **"Switch Platform"** (if not already selected)
4. Configure Android SDK in **Edit → Preferences → External Tools**
5. Click **"Build"** or **"Build and Run"**

---

## Step 4: Open Projects in Cursor

### 4.1 Open poker-server
1. Open Cursor
2. **File → Open Folder**
3. Navigate to `C:\Users\YourUsername\source\repos\poker-server`
4. Click **"Select Folder"**

### 4.2 Add poker-client-unity (Optional - Multi-root workspace)
If you want both projects open at once:
1. In Cursor: **File → Add Folder to Workspace**
2. Navigate to `C:\Projects\poker-client-unity`
3. Click **"Select Folder"**
4. **File → Save Workspace As...** → Save as `poker-workspace.code-workspace`

---

## Step 5: Verify Everything Works

### 5.1 Test Server
```powershell
# Start the server
cd "$env:USERPROFILE\source\repos\poker-server"
npm run dev
```

Check:
- ✅ Server starts without errors
- ✅ Health endpoint responds: `http://localhost:3000/health`
- ✅ No port conflicts

### 5.2 Test Unity Client
1. Open Unity project
2. Press **Play** button in Unity Editor
3. Check Unity Console for connection errors
4. If configured correctly, client should connect to server

### 5.3 Test Connection Between Server and Client
1. Start the server: `npm run dev`
2. Run Unity client (Play in Editor or build)
3. Check server console for connection logs
4. Check Unity console for connection success

---

## Step 6: Development Workflow

### Running the Server
```powershell
cd "$env:USERPROFILE\source\repos\poker-server"
npm run dev  # Development mode with auto-reload
```

### Making Changes
- **Server changes**: Edit files in `poker-server/src/` - server auto-reloads
- **Client changes**: Edit Unity scripts - Unity will recompile automatically

### Testing
- Server logs will show in the terminal where `npm run dev` is running
- Unity logs appear in Unity Console (Window → General → Console)

---

## Configuration Reference

### Server Environment Variables (.env)
| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| DEFAULT_STARTING_CHIPS | 10000 | Starting chips for players |
| DEFAULT_SMALL_BLIND | 50 | Small blind amount |
| DEFAULT_BIG_BLIND | 100 | Big blind amount |
| MAX_PLAYERS | 9 | Maximum players per table |

### Client Configuration
- Server URL: Set in `PokerNetworkManager.cs`
- For local testing: `http://localhost:3000`
- For network testing: `http://[SERVER_IP]:3000`

---

## Troubleshooting

### Server Issues

**Port already in use:**
```powershell
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual process ID)
taskkill /PID [PID] /F

# Or change PORT in .env file
```

**npm install fails:**
- Make sure Node.js 18+ is installed
- Try deleting `node_modules` and `package-lock.json`, then run `npm install` again
- Check your internet connection

**Server won't start:**
- Check `.env` file exists and is properly formatted
- Check Node.js version: `node --version` (should be 18+)
- Check for syntax errors in server code

### Unity Client Issues

**Socket.IO package not found:**
- Make sure you installed the Socket.IO client package
- Check Unity Console for import errors
- Try reimporting the package

**Can't connect to server:**
- Verify server is running: `http://localhost:3000/health`
- Check server URL in `PokerNetworkManager.cs`
- Check firewall settings (Windows Firewall may block connections)
- For network connections, ensure server IP is correct

**Unity project won't open:**
- Make sure Unity 2022.3 LTS or newer is installed
- Check Unity Hub for compatibility issues
- Try creating a new Unity project and copying Assets folder

### Git Issues

**Authentication errors:**
1. Open Windows Credential Manager (search "Credential Manager" in Windows)
2. Remove any GitHub credentials
3. Try cloning again - it will prompt for new credentials

**Repository not found:**
- Verify you have access to the repositories
- Check repository URLs are correct
- Ensure you're logged into GitHub

---

## Quick Reference

**Repository Locations:**
- Server: `C:\Users\YourUsername\source\repos\poker-server`
- Client: `C:\Projects\poker-client-unity`

**GitHub Repositories:**
- Server: `https://github.com/pr4wn-dev/poker-server.git`
- Client: `https://github.com/pr4wn-dev/poker-client-unity.git`

**Git Credentials:**
- Name: `bobby yontz`
- Email: `megapr4wn@gmail.com`

**Default Server Port:** 3000

**Server Health Check:** `http://localhost:3000/health`

---

## Next Steps

1. ✅ Both repositories cloned
2. ✅ Server running and accessible
3. ✅ Unity project opens without errors
4. ✅ Socket.IO client installed in Unity
5. ✅ Server URL configured in Unity client
6. ✅ Test connection between client and server

Once everything is set up, you can:
- Start developing new features
- Test multiplayer functionality
- Build and deploy the Unity client
- Deploy the server to a production environment

---

## Additional Resources

- **Server Documentation**: See `INSTALL.md` and `README.md` in poker-server repo
- **WebSocket Events**: See `src/sockets/Events.js` in poker-server for event documentation
- **Unity Socket.IO**: https://github.com/doghappy/socket.io-client-csharp

---

**Important:** Replace `YourUsername` with your actual Windows username on the new PC.
