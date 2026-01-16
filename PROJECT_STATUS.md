# Poker Game Project Status

> **Last Updated:** January 16, 2026
> **Session:** 3 - XP System & World Map

---

## 📋 Project Overview

Building a **Texas Hold'em Poker Game** with two modes:
1. **Multiplayer** - Real-time online poker with friends
2. **Adventure** - Single-player progression with XP, world map, and poker bosses

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
| **XP System** | ✅ Done | `src/adventure/WorldMap.js`, `UserRepository.js` |
| **World Map with Areas** | ✅ Done | `src/adventure/WorldMap.js` |
| **12 Bosses across 8 areas** | ✅ Done | `src/adventure/Boss.js` |
| **Entry Requirements (XP + Chips)** | ✅ Done | `Boss.js`, `AdventureManager.js` |
| **Boss defeat tracking** | ✅ Done | `UserRepository.js` |
| **Ultra-rare drops (1/1000+)** | ✅ Done | Drop tables with `minDefeats` |
| **Special location items** | ✅ Done | Yacht Invitation, Island Key, Mystery Token |
| Adventure session manager | ✅ Done | `src/adventure/AdventureManager.js` |
| Table passwords & privacy | ✅ Done | Updated in `Table.js` |
| Spectator mode | ✅ Done | Updated in `Table.js` |
| Table invites | ✅ Done | Updated in `Table.js` |
| **Item side pot gambling** | ✅ Done | `src/game/SidePot.js` |
| **Tournament System** | ✅ Done | `src/game/Tournament.js`, `TournamentManager.js` |
| **Area Tournaments** | ✅ Done | Progressive requirements per area |
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
| **XP & World Map Models** | ✅ Done | `NetworkModels.cs` |
| **Adventure Events** | ✅ Done | `PokerEvents.cs` |
| **Tournament Models** | ✅ Done | `NetworkModels.cs` |
| **Tournament Events** | ✅ Done | `PokerEvents.cs` |

---

## 🎮 Adventure Mode Design

### XP System

| Level | XP Required | Cumulative |
|-------|-------------|------------|
| 1 | 0 | 0 |
| 2 | 100 | 100 |
| 3 | 250 | 250 |
| 5 | 1,000 | 1,000 |
| 10 | 12,000 | 12,000 |
| 15 | 52,000 | 52,000 |
| 20 | 170,000 | 170,000 |
| 25 (MAX) | 550,000 | 550,000 |

### World Map Areas

| Area | Type | Requirements | Bosses | Tournaments |
|------|------|--------------|--------|-------------|
| Poker Academy | Starter | None | Dealer Dan | None |
| Downtown Casino | Casino | Level 2 | Slick Sally, Iron Mike | Tier 1 |
| The Highrise | City | Level 5, Defeat Iron Mike | The Countess, The Cipher | Tier 2 |
| The Underground | Underground | Level 8, 50k chips | Shadow, Viper | Tier 3 |
| Golden Yacht | Yacht | **Yacht Invitation item** | Captain Goldhand, The Heiress | Tier 4 |
| Private Island | Island | **Island Key item**, Level 15 | The Mogul, The Oracle | Tier 5 |
| The Penthouse | Final | Level 20, Defeat Oracle | **The House** (final boss) | Tier 6 |
| ??? Lounge | Secret | **Mystery Token item** | ??? | Tier 7 |

### Tournament Tiers

Each area has multiplayer tournaments with progressive requirements:

| Tier | Area | Entry Fee | Level | Min Chips | Side Pot |
|------|------|-----------|-------|-----------|----------|
| 1 | Downtown | 500-2k | 2-3 | 5k | None |
| 2 | Highrise | 5k-10k | 5-7 | 10-25k | Uncommon+ |
| 3 | Underground | 25k-50k | 8-10 | 50-100k | Rare+ |
| 4 | Yacht | 50k-100k | 10-12 | 100-250k | Epic+ |
| 5 | Island | 200k-500k | 15-18 | 500k-1M | Legendary |
| 6 | Penthouse | 1M | 20 | 2M | Legendary |
| 7 | Secret | 2M | 22 | 5M | Legendary |

### Ultra-Rare Drops

These items unlock special areas. **NO ACCOUNT BOUND** - all tradeable/gambleable!

| Item | Drop Source | Drop Rate | Min Defeats |
|------|-------------|-----------|-------------|
| Yacht Invitation | Iron Mike, Countess, Cipher, Shadow | 0.1-0.3% | 150-500 |
| Island Key | Viper, Captain, Heiress | 0.08-0.15% | 300-800 |
| Mystery Token | The Mogul, The Oracle, The House | 0.01-0.1% | 100-1000 |

### Boss Progression

| Boss | Area | Level Req | Entry Fee | XP Reward | Chip Reward |
|------|------|-----------|-----------|-----------|-------------|
| Dealer Dan | Academy | 1 | 0 | 50 | 500 |
| Slick Sally | Downtown | 2 | 500 | 100 | 1,000 |
| Iron Mike | Downtown | 3 | 1,000 | 200 | 2,000 |
| The Countess | Highrise | 5 | 2,500 | 350 | 3,500 |
| The Cipher | Highrise | 7 | 5,000 | 500 | 5,000 |
| Shadow | Underground | 8 | 10,000 | 800 | 8,000 |
| Viper | Underground | 10 | 20,000 | 1,200 | 15,000 |
| Captain Goldhand | Yacht | 10 | 25,000 | 1,500 | 20,000 |
| The Heiress | Yacht | 12 | 50,000 | 2,500 | 40,000 |
| The Mogul | Island | 15 | 100,000 | 5,000 | 80,000 |
| The Oracle | Island | 18 | 200,000 | 10,000 | 150,000 |
| **The House** | Penthouse | 20 | 500,000 | 50,000 | 500,000 |
| ??? | Secret | 22 | 1,000,000 | 100,000 | 1,000,000 |

---

## 📦 Item System

### Item Types

| Type | Description |
|------|-------------|
| `card_back` | Custom card designs |
| `table_skin` | Custom table appearance |
| `avatar` | Player avatars |
| `chip_style` | Custom chip designs |
| `trophy` | Boss defeat trophies |
| `location_key` | **Unlocks special map areas** |
| `vehicle` | Yacht, jet (cosmetic + status) |
| `xp_boost` | Consumable XP items |

### Rarities & Drop Weights

| Rarity | Color | Base Weight |
|--------|-------|-------------|
| Common | Gray | 50% |
| Uncommon | Green | 30% |
| Rare | Blue | 15% |
| Epic | Purple | 4% |
| Legendary | Gold | 1% |

**ALL ITEMS ARE TRADEABLE/GAMBLEABLE** - Nothing is account bound!

---

## 🚧 In Progress / Not Started

### Server
- [ ] Adventure AI (boss decision-making during hands)
- [ ] Side pot calculations for all-in scenarios
- [ ] Tournament mode

### Unity Client  
- [ ] Actual Unity project setup (scenes, prefabs)
- [ ] Card visuals and animations
- [ ] Table layout and seat positions
- [ ] **World Map UI with tile-based areas**
- [ ] **Boss battle scene**
- [ ] **XP bar and level display**
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

The server will:
- Connect to MySQL
- Create database if it doesn't exist
- Create all tables automatically
- Be ready for connections

---

## 📡 Socket Events

### Adventure Mode Events

**Client -> Server:**
- `get_world_map` - Get full map state with unlocked areas
- `get_area_bosses` - Get bosses in an area with requirements
- `start_adventure` - Start a boss battle
- `adventure_action` - Send hand result during battle
- `forfeit_adventure` - Give up current battle
- `use_xp_item` - Use an XP boost item

**Server -> Client:**
- `world_map_state` - Full map state
- `area_bosses` - List of bosses in area
- `adventure_state` - Current battle state
- `adventure_result` - Battle result with rewards
- `xp_gained` - XP earned notification
- `level_up` - Level up notification
- `rare_drop_obtained` - Special drop notification

---

## 📁 Key File Locations

### Server
```
poker-server/
├── src/
│   ├── server.js              # Entry point
│   ├── database/
│   │   ├── Database.js        # MySQL connection + migrations
│   │   └── UserRepository.js  # All user DB operations
│   ├── adventure/
│   │   ├── AdventureManager.js # Session management
│   │   ├── Boss.js            # All 12 bosses defined
│   │   └── WorldMap.js        # XP levels & map areas
│   ├── game/
│   │   ├── Table.js           # Poker table logic
│   │   ├── Deck.js            # Card deck
│   │   ├── HandEvaluator.js   # Hand rankings
│   │   └── SidePot.js         # Item gambling
│   ├── models/
│   │   ├── User.js            # User model
│   │   ├── Item.js            # Item templates & rarities
│   │   └── HouseRules.js      # Game rules
│   └── sockets/
│       ├── SocketHandler.js   # All socket events
│       └── Events.js          # Event constants
```

### Unity Client
```
poker-client-unity/
├── Assets/Scripts/
│   ├── Networking/
│   │   ├── NetworkModels.cs   # All data models
│   │   ├── PokerEvents.cs     # Event constants
│   │   └── PokerNetworkManager.cs
│   ├── Game/
│   │   ├── GameController.cs
│   │   └── TableController.cs
│   └── Adventure/
│       └── AdventureController.cs
```

---

## 🎯 Next Steps

1. **Build World Map UI in Unity** - Tile-based map showing areas
2. **Boss Battle Scene** - The actual poker game against AI
3. **XP Bar & Level Display** - Show progression
4. **Adventure AI** - Boss decision-making
5. **Item Inventory UI** - View and use items

---

## 💡 Game Design Notes

### Item Economy
- All items tradeable/gambleable (NO account bound)
- Location keys are ultra-rare (1 in 500-2000)
- Some drops require defeating a boss many times (minDefeats)
- Items can be put in side pot in multiplayer

### Progression Flow
1. Start at Poker Academy (Level 1)
2. Beat bosses to earn XP and chips
3. Level up to unlock new areas
4. Find rare location keys to access secret areas
5. Beat The House to complete the game
6. Find Mystery Token for secret final challenge

### Drop Rate Examples
- Common XP chip: 20-30% per boss
- Rare avatar: 5-10% per boss
- Yacht Invitation: 0.1% after 500 defeats
- Mystery Token: 0.01% after 1000 defeats
