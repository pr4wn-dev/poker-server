# Poker Server Installation Guide

## Quick Start (WAMP/XAMPP Server)

### Prerequisites
1. **WAMP or XAMPP** installed and running (for MySQL)
2. **Node.js 18+** installed ([download here](https://nodejs.org/))

### Step 1: Clone the Repository
```bash
git clone https://github.com/pr4wn-dev/poker-server.git
cd poker-server
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment
```bash
# Copy the example environment file
copy env.example .env
```

Edit `.env` if needed (defaults work for standard WAMP/XAMPP):
```ini
# Database (MySQL comes with WAMP/XAMPP)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=poker_game
DB_USER=root
DB_PASSWORD=

# Server
PORT=3000
```

### Step 4: Start MySQL
- **WAMP:** Click the WAMP icon → Start All Services
- **XAMPP:** Open XAMPP Control Panel → Start MySQL

### Step 5: Run Setup (Optional)
This creates the database and tables (also happens automatically on start):
```bash
npm run setup
```

### Step 6: Start the Server
```bash
# Production mode
npm start

# Development mode (auto-restart on changes)
npm run dev
```

### Step 7: Verify It's Working
Open your browser to: `http://localhost:3000`

You should see:
```json
{
  "name": "Poker Game Server",
  "version": "1.0.0",
  "status": "online"
}
```

---

## Connecting Unity Client

In your Unity project, connect to:
```
http://YOUR_SERVER_IP:3000
```

Find your server's IP:
- **Windows:** Open CMD → `ipconfig` → Look for IPv4 Address
- The server also displays it on startup

---

## Database Tables (Auto-Created)

The following tables are created automatically:
- `users` - Player accounts
- `user_stats` - Game statistics
- `adventure_progress` - Single-player progression
- `bosses_defeated` - Defeated boss tracking
- `inventory` - Player items
- `friends` - Friend relationships
- `friend_requests` - Pending friend requests
- `blocked_users` - Blocked players
- `game_sessions` - Game history
- `hand_history` - Hand records

---

## Troubleshooting

### "Database connection failed"
1. Make sure MySQL is running (WAMP/XAMPP)
2. Check `.env` file has correct credentials
3. Try accessing phpMyAdmin to verify MySQL works

### "Port 3000 already in use"
Change the port in `.env`:
```ini
PORT=3001
```

### Unity can't connect
1. Make sure server and Unity device are on same network
2. Check Windows Firewall allows Node.js
3. Use the server's local IP, not `localhost`

---

## Running as a Windows Service (Optional)

To keep the server running after closing the terminal:

1. Install PM2:
   ```bash
   npm install -g pm2
   ```

2. Start with PM2:
   ```bash
   pm2 start src/server.js --name poker-server
   ```

3. Auto-start on boot:
   ```bash
   pm2 startup
   pm2 save
   ```

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Server info |
| `GET /health` | Health check + stats |
| `GET /api/tables` | List public tables |

## WebSocket Events

See `src/sockets/Events.js` for full documentation.

---

## Security Notes

For production:
1. Change `DB_PASSWORD` to a strong password
2. Set `NODE_ENV=production` in `.env`
3. Consider using HTTPS with a reverse proxy (nginx)
4. Limit `ALLOWED_ORIGINS` to your app's domain





