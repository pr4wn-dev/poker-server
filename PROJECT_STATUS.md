# Poker Game Project Status

> **Last Updated:** January 16, 2026
> **Session:** 2 - Database & Authentication

---

## 📋 Project Overview

Building a **Texas Hold'em Poker Game** with two modes:
1. **Multiplayer** - Real-time online poker with friends
2. **Adventure** - Single-player progression with poker bosses

**Tech Stack:**
- **Server:** Node.js + Socket.IO (WebSockets) + MySQL
- **Client:** Unity C# (Android target)
- **Database:** MySQL (included with WAMP/XAMPP)
- **Hosting:** WAMP/XAMPP on separate PC (not yet set up)

**Repositories:**
- Server: https://github.com/pr4wn-dev/poker-server
- Client: https://github.com/pr4wn-dev/poker-client-unity

---

## ✅ Completed Features

### Server (poker-server)

| Feature | Status | Files |
|---------|--------|-------|
| Core poker game logic | ✅ Done | `src/game/Table.js`, `Deck.js`, `HandEvaluator.js` |
| WebSocket communication | ✅ Done | `src/sockets/SocketHandler.js`, `Events.js` |
| Game/Table management | ✅ Done | `src/game/GameManager.js` |
| **MySQL Database** | ✅ Done | `src/database/Database.js` |
| **Auto-table creation** | ✅ Done | Tables created on startup if missing |
| **User authentication** | ✅ Done | `src/database/UserRepository.js` |
| **Password hashing (bcrypt)** | ✅ Done | Secure login/register |
| User model (accounts, chips, inventory) | ✅ Done | `src/models/User.js` |
| Item system (rarities, types) | ✅ Done | `src/models/Item.js` |
| House rules (betting types, variants) | ✅ Done | `src/models/HouseRules.js` |
| Friends system | ✅ Done | `src/social/FriendsManager.js` |
| Adventure bosses (6 defined) | ✅ Done | `src/adventure/Boss.js` |
| Adventure session manager | ✅ Done | `src/adventure/AdventureManager.js` |
| Table passwords & privacy | ✅ Done | Updated in `Table.js` |
| Spectator mode | ✅ Done | Updated in `Table.js` |
| Table invites | ✅ Done | Updated in `Table.js` |
| **Item side pot gambling** | ✅ Done | `src/game/SidePot.js` |
| **Setup script** | ✅ Done | `npm run setup` |
| **Install documentation** | ✅ Done | `INSTALL.md` |

### Unity Client (poker-client-unity)

| Feature | Status | Files |
|---------|--------|-------|
| Network models (matching server) | ✅ Done | `Scripts/Networking/NetworkModels.cs` |
| Socket event definitions | ✅ Done | `Scripts/Networking/PokerEvents.cs` |
| Network manager (Socket.IO) | ✅ Done | `Scripts/Networking/PokerNetworkManager.cs` |
| Main menu UI structure | ✅ Done | `Scripts/UI/MainMenuUI.cs` |
| Multiplayer lobby UI | ✅ Done | `Scripts/UI/MultiplayerLobbyUI.cs` |
| Friends UI | ✅ Done | `Scripts/UI/FriendsUI.cs` |
| Table controller | ✅ Done | `Scripts/Game/TableController.cs` |
| Game controller | ✅ Done | `Scripts/Game/GameController.cs` |
| Adventure controller | ✅ Done | `Scripts/Adventure/AdventureController.cs` |

---

## 🚧 In Progress / Not Started

### Server
- [ ] Bosses for levels 6-19 (only 1-5 and 20 defined)
- [ ] Adventure AI (boss decision-making during hands)
- [ ] Side pot calculations for all-in scenarios
- [ ] Item trading/gambling between players
- [ ] Tournament mode

### Unity Client  
- [ ] Actual Unity project setup (scenes, prefabs)
- [ ] Card visuals and animations
- [ ] Table layout and seat positions
- [ ] Chip animations
- [ ] Sound effects
- [ ] Android build configuration
- [ ] Socket.IO package installation

### Infrastructure
- [ ] Server PC setup (WAMP/XAMPP + Node.js)
- [ ] Production deployment
- [ ] SSL/HTTPS for WebSocket security

---

## 🔌 Plug & Play Setup

The server is now fully plug-and-play:

1. Clone repo on server PC
2. Run `npm install`
3. Start WAMP/XAMPP (for MySQL)
4. Run `npm start`

**Database tables are created automatically on first run!**

See `INSTALL.md` for detailed instructions.

---

## 🗄️ Database Tables

| Table | Purpose |
|-------|---------|
| `users` | Player accounts, chips, coins |
| `user_stats` | Game statistics |
| `adventure_progress` | Level progression |
| `bosses_defeated` | Defeated boss tracking |
| `inventory` | Player items |
| `friends` | Friend relationships |
| `friend_requests` | Pending requests |
| `blocked_users` | Blocked players |
| `game_sessions` | Game history |
| `hand_history` | Hand records |

---

## 🎮 Game Design Details

### Multiplayer Mode
- Players create/join tables from lobby
- Tables can be public or private (password protected)
- House rules: No Limit, Pot Limit, Fixed Limit, Short Deck, Bomb Pot, Straddle
- 2-9 players per table
- Spectator mode for full/in-progress games
- Friends can be invited before game starts
- Chat at tables

### Adventure Mode
- 20 levels with unique bosses
- Each boss has personality, difficulty, and play style
- Defeat bosses to progress and earn rewards
- Item drops based on rarity (Common → Legendary)
- Coin rewards for victories
- Items can be used cosmetically or gambled

### Item Types
- Card Backs
- Table Skins  
- Avatars
- Emotes
- Chip Styles
- Trophies (boss-specific, non-tradeable)
- Consumables
- Special items

### Defined Bosses
1. **Dealer Dan** (Lv.1) - Tutorial, passive, easy
2. **Slick Sally** (Lv.2) - Tricky hustler
3. **Iron Mike** (Lv.3) - Aggressive boxer
4. **The Countess** (Lv.4) - Tight aristocrat
5. **The Cipher** (Lv.5) - Mysterious, balanced
6-19. **[Not yet defined]**
20. **The House** (Lv.20) - Final boss, legendary difficulty

---

## 📁 Project Structure

```
C:\Projects\
├── poker-server\               # Node.js server
│   ├── src\
│   │   ├── server.js           # Entry point
│   │   ├── setup.js            # Database setup wizard
│   │   ├── database\           # MySQL connection & repos
│   │   │   ├── Database.js     # Connection & migrations
│   │   │   └── UserRepository.js # User CRUD operations
│   │   ├── game\               # Poker game logic
│   │   ├── sockets\            # WebSocket handlers
│   │   ├── models\             # User, Item, HouseRules
│   │   ├── adventure\          # Boss, AdventureManager
│   │   └── social\             # FriendsManager
│   ├── package.json
│   ├── env.example             # Environment template
│   ├── INSTALL.md              # Setup instructions
│   └── PROJECT_STATUS.md       # This file
│
└── poker-client-unity\         # Unity client
    └── Assets\Scripts\
        ├── Networking\         # Socket.IO, models
        ├── Game\               # Table, Game controllers
        ├── Adventure\          # Adventure mode
        └── UI\                 # Menu, Lobby, Friends
```

---

## 📝 Session Notes

### Session 1 (Jan 16, 2026)
- Created both projects from scratch
- Set up GitHub repos and pushed initial code
- Built complete server architecture
- Built Unity C# networking layer
- Defined game modes, features, and boss system
- Server PC not yet available (user will set up in a few days)

### Session 2 (Jan 16, 2026)
- Added MySQL database with auto-table creation
- Implemented user authentication (register/login)
- Added password hashing with bcrypt
- Updated all socket handlers for authenticated users
- Created UserRepository for all user/friend/inventory operations
- Made server plug-and-play (just clone, npm install, npm start)
- Created INSTALL.md with detailed setup instructions
- Server now shows local IP for easy Unity connection
- **Added item side pot gambling system:**
  - Table creator can start side pot with their item
  - Other players submit items for approval
  - Creator approves/declines each item
  - Winner takes all items in side pot
  - Players can opt out and just play for chips

---

## 🎯 Next Steps (Priority Order)

1. **Add remaining bosses** (levels 6-19)
2. **Build Unity scenes** (main menu, lobby, game table)
3. **Implement boss AI** (decision making during adventure hands)
4. **Server PC setup** (when available)
5. **Card/chip visuals** in Unity

---

## ⚙️ Configuration (.env)

```ini
# Database (MySQL - WAMP/XAMPP)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=poker_game
DB_USER=root
DB_PASSWORD=

# Server
PORT=3000
NODE_ENV=development

# Game
DEFAULT_STARTING_CHIPS=10000
DEFAULT_SMALL_BLIND=50
DEFAULT_BIG_BLIND=100
MAX_PLAYERS=9
```

---

*This file should be read at the start of each session to understand project state.*
