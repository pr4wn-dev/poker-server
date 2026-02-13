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
| [AGENT_RULES.md](AGENT_RULES.md) | Rules for AI agents working on this project |
| [UI_BEST_PRACTICES.md](UI_BEST_PRACTICES.md) | UI component best practices: position locking, animations, layout |
| [ART_ASSET_PROMPTS.md](ART_ASSET_PROMPTS.md) | AI image generation prompts for all game art |
| [ITEM_ECONOMY_DESIGN.md](ITEM_ECONOMY_DESIGN.md) | Full item economy design (Power Score, rarity, legal compliance) |

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
25+ collectible characters with rarity tiers (Common → Mythic). Each has a sprite set, sound set (win/lose/fold/all-in/taunt), and drop logic. Characters render at table seats.

### Crew/Gang System
Create crews with roles (Leader/Officer/Member). Crew XP, levels, perks, and leaderboard. Invite players, promote, kick, crew chat.

### Robbery System (PvP)
Steal items from other players using 6 tool types. 4 defense items. Cooldowns, chip penalties, karma consequences.

### Karma/Heart System
Every player starts with a **Pure White Heart** (karma = 100). Committing crimes darkens it:
- **Pure Heart** (95-100): Invisible to criminals, can't be robbed
- **Light Gray** (75-94): Slightly visible
- **Gray** (50-74): Moderately visible
- **Dark Gray** (25-49): Easily found
- **Charcoal** (1-24): Very easily found
- **Black Heart** (0): Maximum visibility, 2× robbery success rate against you

Players can always change characters, but their heart status persists. Karma regenerates +1/day toward pure.

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
│   │   ├── CharacterSystem.js # 25+ collectible characters, drops, sounds
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
- `robbery_attempt` / `robbery_recovery` / `get_recoverable_robberies` — Robbery
- `get_karma` / `get_karma_history` / `get_robbery_targets` — Karma
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

## 🖥️ Unity Client (15 Scenes)

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
| Robbery | PvP robbery, target browsing (karma-filtered), tools |
| HandReplay | Replay saved hands step by step |
| Leaderboard | Top players by chips/wins/level |
| Shop | Cosmetic store (planned) |
| Settings | Audio, controls, reset progress |

---

## 📊 Current Status (Feb 13, 2026)

**All gameplay systems are implemented end-to-end (server + client + wired).**

### ✅ What's Done
- 23+ server modules, 15 Unity scenes, 20+ UI components
- 100+ socket events, 20+ database tables
- Stats, fire/cold, titles, characters, crews, robbery, karma, events, spectator odds, hand replay, achievements, daily rewards, inventory, friends, tournaments, adventure mode
- Dark cyberpunk theme applied across all scenes
- Item economy with Power Score system

### ⏳ What's Left
- **Assets**: AI-generated audio (character sounds) and images (character sprites, boss art, item icons)
- **Monetization**: Ad integration (AdMob/Unity Ads), chip purchasing, premium membership, store UI
- **Polish**: Animations, transitions, sound effects, particle effects

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
