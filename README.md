# 🎮 Poker Server — GTA Meets Poker

An **Android multiplayer poker game** with a **crime/cyber/RPG hybrid** identity. Think **GTA meets poker** — neon-lit underground rooms, hacker terminals, street hustlers, and high-stakes Texas Hold'em all merged into one.

Built with **Unity** (client) and **Node.js + Socket.IO** (server), using **MySQL** for persistence.

**Repos:**
- Server: [github.com/pr4wn-dev/poker-server](https://github.com/pr4wn-dev/poker-server)
- Client: [github.com/pr4wn-dev/poker-client-unity](https://github.com/pr4wn-dev/poker-client-unity)

---

## 📚 Documentation

| Doc | Purpose |
|-----|---------|
| [INSTALL.md](INSTALL.md) | Setup and installation guide |
| [SETUP_NEW_PC.md](SETUP_NEW_PC.md) | Fresh machine setup (Node, MySQL, XAMPP, Unity) |
| [TESTING.md](TESTING.md) | Testing guide: unit tests, simulation comparison, state snapshots |
| [CHANGELOG.md](CHANGELOG.md) | All bugs, fixes, and issue history — **search here first!** |
| [GAME_OVERVIEW_AZ.md](GAME_OVERVIEW_AZ.md) | Complete A-to-Z overview of every game feature |
| [COMBAT_SYSTEM_DESIGN.md](COMBAT_SYSTEM_DESIGN.md) | Full combat/PvP system design (replaces robbery) |
| [AGENT_RULES.md](AGENT_RULES.md) | Rules for AI agents working on this project |
| [UI_BEST_PRACTICES.md](UI_BEST_PRACTICES.md) | UI component best practices: position locking, animations, layout |
| [ART_ASSET_PROMPTS.md](ART_ASSET_PROMPTS.md) | AI image generation prompts for all game art |
| [ITEM_ECONOMY_DESIGN.md](ITEM_ECONOMY_DESIGN.md) | Full item economy design (Power Score, rarity, legal compliance) |
| [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md) | Complete inventory of every character, boss, item, area, title, stat |

**Unity Client:** See [poker-client-unity](https://github.com/pr4wn-dev/poker-client-unity) for the full client with `PROJECT_STATUS.md` covering current state, roadmap, and what's left.

---

## 🎨 Visual Identity

- **Dark urban cyberpunk** — no gold/casino vibes
- Palette: **neon cyan, deep crimson, electric purple, neon green** for money
- **HUD-style framed panels** with corner brackets, scan-line overlays, rarity glow effects
- **Theme-driven** via `GameTheme.cs` ScriptableObject — one file controls every color, size, spacing, timing
- **3 area presets**: Dirty Downtown (gritty neon), High Roller Penthouse (frosted glass), Underground Bunker (military)
- **Rarity glows**: Common (gray), Uncommon (green pulse), Rare (blue shimmer), Epic (purple flame), Legendary (gold particle burst), Mythic (rainbow holographic)

---

## 🃏 Core Gameplay

- Full Texas Hold'em with hand evaluation and side pot logic
- Real-time WebSocket communication (Socket.IO)
- Multi-table support with configurable house rules
- Per-player card visibility (no cheating)
- Bot system (AI bots + socket bots for testing)
- Simulation mode for spectating bot-only games
- Configurable blind increase timers and turn timers

---

## 🎰 Game Systems

### Item Ante ("For Keeps")
Gamble inventory items in poker. Creator sets minimum Power Score. Winner takes all. Practice mode is risk-free (virtual items only). Store items can't be gambled (legal compliance).

### Adventure Mode
World map with 4+ areas, each with bosses. Fight bosses in poker-vs-AI matches. Win items, XP, and chips. Progress tracked per-area with boss difficulty scaling.

### Tournament System
Brackets, registration, elimination, side pots. Multiple tournament types with configurable buy-ins.

### Character System
10 playable characters with rarity tiers (Common → Mythic). Each has a sprite set, sound set (win/lose/fold/all-in/taunt), and drop logic. Characters render at table seats. Combined with 13 adventure bosses = 23 total named characters. See [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md) for full list.

### Crew/Gang System
Create crews with roles (Leader/Officer/Member). Crew XP, levels, perks, and leaderboard. Invite players, promote, kick, crew chat.

### Combat System (Post-Game PvP)
After a poker game, challenge someone you played with to a fight. System auto-picks matched items from both players (by Power Score) and puts half the loser's chips on the line. Target can fight back or flee. Combat resolves automatically based on character stats + equipped item bonuses + crew backup + random roll. Going offline during a challenge = auto-lose (no dodging). See `COMBAT_SYSTEM_DESIGN.md` for full spec.

### Notoriety System
Lifetime combat reputation. Win fights → gain notoriety → earn titles (Civilian → Troublemaker → Outlaw → Gunslinger → Most Wanted). Cosmetic skull icons at table seats + tiny combat bonus. Replaces the old Karma/Heart system.

---

## 📊 Player Progression

### Stats Engine (40+ Metrics)
VPIP, PFR, 3-bet%, bluff success rate, river luck index, pocket pair performance, hand type breakdown (straights, flushes, etc.), position win rates, showdown frequency, and more. All tracked per-hand across a player's lifetime.

### Fire/Cold System (NBA Jam Style)
4 fire levels (Warm → Heating Up → On Fire → Blazing) and 4 cold levels (Cool → Chilly → Freezing → Ice Cold). Triggered by win/loss streaks and hand strength. Visual effects at table seats (fire glow, frost overlay).

### Title Engine
25+ dynamic titles across 7 categories (Shark, Fish, Bluffer, Lucky, Grinder, Whale, Legend). Auto-evaluated from stats, revocable if stats drop. Displayed at table seats and profiles.

### Achievements
Auto-unlock system with progress tracking. Milestone-based (hands played, chips won, etc.).

### Daily Rewards
7-day streak with escalating chips/XP/gems. Auto-popup on login when reward is available.

---

## 👥 Social Features

- **Friends**: Add, accept, decline, remove, invite to table
- **Chat & Emotes**: At-table messaging
- **Spectator System**: Watch games with live Monte Carlo win odds + side betting
- **Collusion Detection**: Auto-trigger analysis every 50 hands (soft play, win trading, chip dumping)
- **Event System**: Seasonal/weekly events with XP/chip multipliers, banners
- **Hand Replay**: Save hands, bookmark highlights, Hand of the Day
- **Leaderboards**: Chips, wins, level, biggest pot

---

## 💰 Economy

### Dual Item System (Legal Compliance)
| | Gambleable Items | Store Items |
|--|-----------------|-------------|
| **Source** | Boss drops, tournaments, challenges | Real money purchase |
| **Item Ante** | ✅ Can be gambled | ❌ Cannot be gambled |
| **Trading** | ✅ Player-to-player | ❌ Account-bound |
| **Cash Value** | None (zero real-money value) | N/A |
| **Purpose** | Prestige, collection, risk/reward | Cosmetic only |

### Power Score System
Items use Power Score instead of dollar values: `Power = (Rarity × Drop Rate × Demand)`

| Item | Rarity | Drop Rate | Demand | Power |
|------|--------|-----------|--------|-------|
| Flaming Ace | Legendary | 0.1% | High | 9,500 |
| Gold Chip | Epic | 2% | Medium | 3,200 |
| Silver Card | Rare | 8% | Low | 850 |
| Wood Token | Common | 40% | Low | 120 |

### Chip Economy
- **Earn free**: Win hands, daily login, challenges, level up, tournament prizes
- **Buy optional**: $5 → 10K chips, $20 → 50K, $50 → 150K
- **One-way only**: Can't sell chips back (legal compliance — not gambling)

### Revenue Model
1. **Ads** — Interstitial, rewarded video (watch ad → bonus chips), banners
2. **Premium Membership** — $4.99/mo (ad-free, exclusive cosmetics, 2× daily chips)
3. **Cosmetic Store** — Avatars, card backs, emotes, table themes
4. **Chip Packs** — Optional boost (still earnable free)

**No real-money gambling** — all revenue from ads, cosmetics, and optional chip purchases.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MySQL (XAMPP recommended for local dev)
- npm

### Installation
```bash
npm install
copy env.example .env
# Edit .env with your MySQL credentials
npm run dev
```

### Production
```bash
npm start
```

See [INSTALL.md](INSTALL.md) for detailed setup and [SETUP_NEW_PC.md](SETUP_NEW_PC.md) for fresh machine setup.

---

## 📁 Project Structure

```
poker-server/
├── src/
│   ├── server.js              # Entry point (Express + Socket.IO)
│   ├── setup.js               # Database schema setup
│   ├── game/
│   │   ├── GameManager.js     # Manages tables & players
│   │   ├── Table.js           # Table logic, betting, showdown (~9000 lines)
│   │   ├── BotManager.js      # Bot AI, item ante handling
│   │   ├── BotPlayer.js       # Bot personality & behavior
│   │   ├── ItemAnte.js        # Item ante ("For Keeps") logic
│   │   ├── Deck.js            # Card deck
│   │   ├── HandEvaluator.js   # Hand ranking (7-card eval)
│   │   ├── Tournament.js      # Tournament logic
│   │   ├── TournamentManager.js # Tournament lifecycle
│   │   ├── CharacterSystem.js # 10 playable characters, drops, sounds
│   │   ├── FireTracker.js     # NBA Jam fire/cold streak system
│   │   ├── RobberyManager.js  # PvP item theft, tools, defense, karma
│   │   └── SpectatorOdds.js   # Monte Carlo win probability
│   ├── adventure/
│   │   ├── AdventureManager.js # Adventure mode coordination
│   │   ├── AdventurePokerGame.js # Poker vs AI boss
│   │   ├── Boss.js            # Boss definitions
│   │   ├── BossAI.js          # Boss poker AI
│   │   └── WorldMap.js        # Area/world map data
│   ├── stats/
│   │   ├── StatsEngine.js     # Per-hand stats processing (40+ metrics)
│   │   ├── StatsCalculator.js # Derived stats (VPIP, PFR, luck, etc.)
│   │   └── TitleEngine.js     # 25+ dynamic player titles
│   ├── social/
│   │   ├── FriendsManager.js  # Friends system
│   │   └── CrewManager.js     # Crew/gang system (roles, perks, XP)
│   ├── events/
│   │   └── EventManager.js    # Seasonal/weekly events & multipliers
│   ├── security/
│   │   └── CollusionDetector.js # Anti-cheat (soft play, win trading, chip dumping)
│   ├── models/
│   │   ├── Item.js            # Item model, templates, Power Score
│   │   ├── User.js            # User model
│   │   └── HouseRules.js      # Table rule presets
│   ├── database/
│   │   ├── Database.js        # MySQL connection pool + 20+ table migrations
│   │   └── UserRepository.js  # User, inventory, friends, stats persistence
│   ├── testing/
│   │   ├── SimulationManager.js # Bot simulation mode
│   │   ├── SocketBot.js       # Socket bot for testing
│   │   ├── StateAnalyzer.js   # Game state analysis
│   │   ├── StateComparator.js # State diff comparison
│   │   └── StateSnapshot.js   # State capture
│   ├── sockets/
│   │   ├── SocketHandler.js   # All WebSocket event handlers (100+ events)
│   │   └── Events.js          # Event documentation
│   └── utils/
│       └── GameLogger.js      # Structured logging
├── env.example                # Environment template
├── package.json
└── *.md                       # Documentation files
```

---

## 🔌 API & WebSocket Events

### REST Endpoints
| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server health check |
| `GET /api/tables` | List public tables |

### WebSocket Events (Socket.IO)

See `src/sockets/Events.js` for complete documentation.

**Client → Server (Core):**
- `register` / `login` / `logout` / `reset_progress` — Auth & account
- `get_tables` / `create_table` / `join_table` / `leave_table` — Lobby
- `action` — Game action (fold/check/call/bet/raise/allin)
- `start_game` / `player_ready` / `rebuy` / `add_chips` — Table management
- `chat` — Send message
- `start_side_pot` / `submit_to_side_pot` — Item ante
- `invite_bot` / `invite_socket_bot` / `start_simulation` — Bots

**Client → Server (Features):**
- `get_player_stats` / `get_hand_type_stats` / `get_pocket_stats` / `get_hand_history` — Stats
- `get_titles` / `set_active_title` — Titles
- `get_characters` / `get_player_characters` / `set_active_character` / `get_character_sounds` — Characters
- `create_crew` / `get_crew` / `invite_to_crew` / `join_crew` / `leave_crew` / `crew_promote` / `crew_kick` / `get_crew_leaderboard` — Crews
- `challenge_player` / `respond_to_challenge` / `get_combat_stats` / `get_combat_history` — Combat (replacing robbery/karma events)
- `get_spectator_odds` / `spectator_bet` / `spectator_reaction` — Spectator
- `save_hand` / `get_saved_hands` / `get_hand_of_the_day` / `get_hand_replay` — Replays
- `get_active_events` / `get_daily_reward_status` / `claim_daily_reward` — Events & rewards
- `equip_item` / `unequip_item` — Equipment
- `get_friends` / `send_friend_request` / `accept_friend_request` / `decline_friend_request` — Friends
- `get_player_profile` — Full player card

**Server → Client:**
- `table_state` — Game state (includes fire/cold, titles, crew tags, karma, character data)
- `player_action` / `player_joined` / `player_left` — Player events
- `hand_result` / `game_over` — Hand/game completion
- `fire_status_change` — Fire/cold level change broadcast
- `character_drop` — Character unlocked notification

---

## ⚙️ Configuration

See `env.example` for all options:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `DEFAULT_STARTING_CHIPS` | 10000 | Starting chips |
| `DEFAULT_SMALL_BLIND` | 50 | Small blind |
| `DEFAULT_BIG_BLIND` | 100 | Big blind |
| `MAX_PLAYERS` | 9 | Max players per table |

---

## 🖥️ Unity Client (16 Scenes)

All UI is built **programmatically** via `SceneBootstrap.cs` — no drag-and-drop. Each `.unity` scene file is minimal (camera + event system + bootstrap script). `GameTheme.cs` controls all styling.

| Scene | Purpose |
|-------|---------|
| MainMenu | Login/register, quick play, navigation hub |
| Lobby | Browse/create/join tables |
| Table | Core poker gameplay, action bar, chat, spectator |
| Statistics | 40+ stats, fire status, karma tier, hand breakdown |
| CharacterSelect | Character collection, card-style display, set active |
| Tournament | Browse/register/unregister tournaments |
| AdventureMap | World map, area selection, boss battles |
| AdventureBattle | Poker-vs-AI boss gameplay |
| Inventory | View/equip/unequip/use items |
| Crew | Create/manage crew, members, chat, leaderboard |
| Combat | Post-game PvP challenges, fight/flee, combat stats, notoriety |
| HandReplay | Replay saved hands step by step |
| Leaderboard | Top players by chips/wins/level |
| Shop | Cosmetic store (planned) |
| Friends | Friends list, requests, search users, invite to table |
| Settings | Audio, controls, reset progress |

---

## Current Status (Feb 13, 2026)

**All gameplay systems are implemented end-to-end (server + client + wired).**

### What's Done

**Server:** 23+ modules totaling ~22,000 lines of JavaScript
- Core poker engine (Table.js - 10K lines): full Texas Hold'em, side pots, hand evaluation, item ante
- SocketHandler.js (4.3K lines): 100+ socket event handlers, auth, reconnection, stale session cleanup
- Database.js + UserRepository.js: 20+ auto-migrating MySQL tables, 1,700 lines
- StatsEngine (637) + StatsCalculator (416): 40+ metrics per player
- TitleEngine (311): 25+ dynamic titles across 7 categories
- FireTracker (290): NBA Jam-style fire/cold detection
- CharacterSystem (493): 10 playable characters (Common→Mythic) + 13 bosses = 23 named characters total
- RobberyManager (498): **→ Being replaced by CombatManager** (post-game PvP challenges)
- CrewManager (413): Crews with roles, perks, chat, XP, leaderboard
- TournamentManager (435): Brackets, registration, elimination
- AdventureManager (492): World map, areas, boss battles
- SpectatorOdds (185): Monte Carlo win probability
- EventManager (175): Seasonal/weekly events with multipliers
- CollusionDetector (215): Anti-cheat analysis

**Client:** 16 Unity scenes + 11 UI components totaling ~25,000 lines of C#
- TableScene (3.5K) + PokerTableView (1.3K): Full poker gameplay with character rendering, karma hearts, fire glow
- MainMenuScene (2.4K): Login/register, quick play, event banner, daily rewards popup
- LobbyScene (1.3K): Browse/create/join tables
- StatisticsScene (969): 40+ stats in tabs with karma tier display
- CrewScene (815), RobberyScene (674 → **being replaced by CombatScene**), InventoryScene (689): Full feature UIs
- AdventureMapScene (674) + AdventureBattleScene (838): Boss challenge flow
- HandReplayScene (501), TournamentScene (1048), CharacterSelectScene (488), FriendsScene (576)
- SettingsScene (589): With progress reset confirmation
- PlayerProfilePopup (414): Tap-to-view at table seats
- FriendsPanel (428), DailyRewardsPopup (342), AchievementsPanel (289), SpectatorPanel (340)
- SocketManager: Auto-reconnect with exponential backoff, stale socket disposal
- GameService: 80+ API methods wrapping all socket events
- Dark cyberpunk theme applied consistently via Theme.Current across all scenes

**Infrastructure:**
- 20+ database tables with automatic migrations
- 100+ socket events documented in Events.js
- Item economy with dual-track system (gambleable vs store items) and Power Score
- Connection resilience: auto-reconnect, stale session cleanup, race condition guards

### What's Left

**Art Assets (AI-generated - next priority):**
- Character sprites (10 playable characters x portrait/seat/idle)
- Boss art, item icons (24+), UI frames, backgrounds, card backs, game logo
- Fire/ice particle sprites, crew emblems, rarity glow variants

**Audio Assets (AI-generated):**
- Character sounds (win/lose/fold/all-in/taunt per character) - CharacterSoundManager already wired
- Royal flush SFX (referenced but no file)

**Monetization (not started):**
- Ad integration (AdMob/Unity Ads - interstitial, rewarded video, banners)
- Chip purchasing (IAP), premium membership, shop catalog + purchase flow

**Minor code gaps:**
- Shop scene - scaffold exists, needs catalog + purchase flow
- Tutorial overlay - scaffold exists, needs first-time player content
- Emote panel - scaffold exists, needs emote selection + display at table
- Adventure area rename (old casino names to crime theme names)

**Polish and animations:**
- Card dealing arc animation (cards appear in place, need fly-from-deck arc)
- Screen shake, fire/ice particles, robbery reveal, victory celebration
- Boss entrance, chip counting, XP popup, title earned

**Platform and release:**
- Android build optimization (texture compression, 60fps profiling)
- Touch input testing, splash screen, app icon, Play Store listing
- Push notifications (Firebase)
---

## 🛠️ Development

```bash
# Run with auto-reload
npm run dev

# Run tests
npm test
```

### Debugging Tips
- **Binary search debugging**: Comment out code chunks, test, narrow down to find the exact bug location
- **Grep both sides**: When client/server mismatch, grep event names on both sides to find the exact string difference
- **Check CHANGELOG.md first**: Most bugs have been encountered and documented with solutions

---

## License

MIT
