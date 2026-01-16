# Poker Game Project Status

> **Last Updated:** January 16, 2026
> **Session:** Initial Setup & Architecture

---

## 📋 Project Overview

Building a **Texas Hold'em Poker Game** with two modes:
1. **Multiplayer** - Real-time online poker with friends
2. **Adventure** - Single-player progression with poker bosses

**Tech Stack:**
- **Server:** Node.js + Socket.IO (WebSockets)
- **Client:** Unity C# (Android target)
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
| User model (accounts, chips, inventory) | ✅ Done | `src/models/User.js` |
| Item system (rarities, types) | ✅ Done | `src/models/Item.js` |
| House rules (betting types, variants) | ✅ Done | `src/models/HouseRules.js` |
| Friends system | ✅ Done | `src/social/FriendsManager.js` |
| Adventure bosses (6 defined) | ✅ Done | `src/adventure/Boss.js` |
| Adventure session manager | ✅ Done | `src/adventure/AdventureManager.js` |
| Table passwords & privacy | ✅ Done | Updated in `Table.js` |
| Spectator mode | ✅ Done | Updated in `Table.js` |
| Table invites | ✅ Done | Updated in `Table.js` |

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
- [ ] Database persistence (users, items, progress) - currently in-memory only
- [ ] User authentication (login/register with passwords)
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
├── poker-server\           # Node.js server
│   ├── src\
│   │   ├── server.js       # Entry point
│   │   ├── game\           # Poker game logic
│   │   ├── sockets\        # WebSocket handlers
│   │   ├── models\         # User, Item, HouseRules
│   │   ├── adventure\      # Boss, AdventureManager
│   │   └── social\         # FriendsManager
│   ├── package.json
│   └── PROJECT_STATUS.md   # This file
│
└── poker-client-unity\     # Unity client
    └── Assets\Scripts\
        ├── Networking\     # Socket.IO, models
        ├── Game\           # Table, Game controllers
        ├── Adventure\      # Adventure mode
        └── UI\             # Menu, Lobby, Friends
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

---

## 🎯 Next Steps (Priority Order)

1. **Add remaining bosses** (levels 6-19)
2. **Build Unity scenes** (main menu, lobby, game table)
3. **Add database** (SQLite or MongoDB for persistence)
4. **Implement boss AI** (decision making during adventure hands)
5. **Server PC setup** (when available)

---

## ⚙️ Configuration Notes

- Default server port: 3000
- Default starting chips: 10,000
- Default blinds: 50/100
- Max players per table: 9
- Max spectators: 20
- Turn time: 30 seconds

---

*This file should be read at the start of each session to understand project state.*

