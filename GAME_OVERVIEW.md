# 🎮 THE FULL GAME OVERVIEW

## What It Is
An **Android multiplayer poker game** with a **crime/cyber/RPG hybrid** identity. Think **GTA meets poker** — neon-lit underground rooms, hacker terminals, street hustlers, and high-stakes Texas Hold'em all merged into one. Built with **Unity** (client) and **Node.js + Socket.IO** (server), using **MySQL** for persistence.

**Repos:**
- Server: `github.com/pr4wn-dev/poker-server`
- Client: `github.com/pr4wn-dev/poker-client-unity`

---

## Visual Identity
- **Dark urban cyberpunk** — no gold/casino vibes. The palette is **neon cyan, deep crimson, electric purple, neon green** for money
- **HUD-style framed panels** with corner brackets, scan-line overlays, rarity glow effects
- **Theme-driven** — `GameTheme.cs` ScriptableObject controls every color, size, spacing, timing across the entire app. Change one file = reskin everything
- **3 area presets**: Dirty Lew (muted cyan/crimson), The Docks (steel blue/rust), The Strip (pink/bright cyan)
- **100% programmatic UI** — no prefabs, no drag-and-drop. Everything built in C# via `UIFactory`

---

## Core Gameplay — Texas Hold'em Poker
- Full hand evaluation with side pot logic
- Real-time WebSocket (Socket.IO) communication
- Multi-table support with configurable house rules (blinds, timers, max players)
- Per-player card visibility (no cheating — server-authoritative)
- Configurable blind increase timers and turn timers (5-60s, pulsing red < 10s)
- Bot system (AI bots + socket bots for testing/simulation)

---

## 23 Server Modules

| Module | Purpose |
|--------|---------|
| `Table.js` | Core poker logic, betting, showdown |
| `GameManager.js` | Manages all tables & players |
| `BotManager.js` | Bot AI, personalities, item ante handling |
| `HandEvaluator.js` | 7-card hand ranking |
| `ItemAnte.js` | "For Keeps" item gambling system |
| `Tournament.js` / `TournamentManager.js` | Tournament brackets, registration, elimination |
| `AdventureManager.js` / `AdventurePokerGame.js` / `Boss.js` / `BossAI.js` / `WorldMap.js` | PvE adventure mode |
| `StatsEngine.js` | Processes every hand → 40+ lifetime metrics |
| `StatsCalculator.js` | Derived stats (VPIP, PFR, luck %, bluff rate) |
| `FireTracker.js` | NBA Jam "On Fire" / Cold streak detection |
| `TitleEngine.js` | 25+ dynamic player titles across 7 categories |
| `CharacterSystem.js` | 25+ collectible characters with rarity, sounds, sprites |
| `CrewManager.js` | Crew/gang system with roles, perks, XP |
| `FriendsManager.js` | Friends system |
| `RobberyManager.js` | PvP item theft with tools, defense, cooldowns |
| `EventManager.js` | Seasonal/weekly events with multipliers |
| `CollusionDetector.js` | Anti-cheat (soft play, win trading, chip dumping) |
| `SpectatorOdds.js` | Monte Carlo win probability for spectators |

---

## 15 Unity Client Scenes

`MainMenu` · `Lobby` · `Table` · `Statistics` · `CharacterSelect` · `Tournament` · `AdventureMap` · `AdventureBattle` · `Inventory` · `Crew` · `Robbery` · `HandReplay` · `Leaderboard` · `Shop` · `Settings`

All scenes built programmatically via `SceneBootstrap.cs` — `.unity` files contain only a bootstrap GameObject, camera, and EventSystem.

---

## Game Systems (All Implemented End-to-End)

### 🃏 Item Ante ("For Keeps")
- Dual economy: **gambleable items** (earned, zero cash value) vs. **store items** (purchased, can't be gambled)
- **Power Score** system: `Power = Rarity × Drop Rate × Demand`
- Table creator sets minimum Power Score that locks for the session
- Practice mode = virtual betting (no item transfer), Real mode = winner takes all
- Legal compliance: no real-money gambling

### 🗺️ Adventure Mode
- World map with themed areas (Dirty Lew, The Docks, The Strip, etc.)
- Boss battles = poker vs AI with unique personalities
- Item/XP drops from victories

### 🏆 Tournament System
- Brackets, registration, elimination, side pots

### 🎭 Character System
- 25+ collectible characters with rarity tiers (Common → Mythic)
- Sound sets, sprite sets, drop logic
- Characters drop from adventures, boss defeats, tournaments
- Character avatar displayed at table seats

### 📊 Deep Stats System (40+ Metrics)
- **Luck stats**: River luck %, turn luck %, flop connect rate, suckout rate, bad beat rate, premium hand frequency, lucky draw rate
- **Skill stats**: Bluff success/detection rate, fold equity, aggression factor, VPIP, PFR, c-bet success, showdown win rate, steal success
- **Made hands breakdown**: Frequency per type, compared to average, best/worst hand type, profit/loss per type
- **Starting hand performance**: Best/worst pockets, win rate per category, most profitable pockets
- **Session tracking**: Hands played, wins, biggest pot, best/worst session, streaks

### 🔥 "On Fire" System (NBA Jam Style)
- Rolling window of last 12 hands per player per table
- 4 fire levels: None → Warm → Hot → On Fire
- 4 cold levels: None → Chilly → Cold → Frozen
- Visual effects: color-coded glow, pulse/wobble animations
- Fold decay — consecutive folds cool you down

### 🏷️ Dynamic Player Titles (25+)
- 7 categories: Luck, Skill, Style, Hands, Achievement, Crew, Rare
- Auto-evaluated every 5 hands, non-achievement titles can be revoked
- Players choose which to display — shown at table, profile, leaderboards

### ♥️ Karma/Heart System
- Every player starts with Pure White Heart (karma = 100)
- Committing crimes darkens the heart: white → gray → charcoal → black
- **Pure hearts (karma ≥ 95) are invisible to criminals** — can't be robbed
- The darker your heart, the easier you are to find and rob
- Daily karma decay: +1 regeneration per day back toward neutral
- Heart icon displayed at table seats, profiles, statistics
- Robbery targets filtered by karma

### 🔫 Robbery System (PvP)
- 6 tool types: lockpick, RFID cloner, hotwire kit, burner phone, fake ID, getaway car
- 4 defense items: kevlar vest, alarm system, bodyguard, safe
- Cooldowns: 4h for robber, 8h victim protection
- Chip penalty on failure, 24h recovery window for victims
- Karma-gated targeting

### 👥 Crew/Gang System
- Create crews with name, tag (3-5 chars), description
- Roles: Leader (1), Officers (up to 3), Members (up to 20)
- Crew stats, XP, levels (1-25+)
- 6 crew perks unlocked by level (tag colors, XP bonus, drop rate bonus, emblem, exclusive tables, robbery bonus)
- Crew leaderboard, crew chat
- `[TAG]` displayed before player name at tables

### 📅 Events System
- 9+ built-in event types: Flush Week, High Roller Weekend, Boss Rush, Lucky River, Bluff Masters, Crew Clash, Robbery Spree, Double XP, Rare Drop
- Multiplier stacking for XP, drops, chips, robbery
- Event banner on main menu with countdown

### 👁️ Spectator System
- Live win probability (500 Monte Carlo simulations per request)
- Side betting: spectators wager fake chips on who wins each hand
- 2x payout for correct predictions
- Spectator reactions

### 🎬 Hand Replay
- Auto-save highlights: royal flush, quads, huge pots, bad beats, suckouts, all-in showdowns
- Manual save from hand history
- Replay viewer with step-through controls
- Hand of the Day: biggest pot in last 24h, featured on main menu

### 🛡️ Anti-Collusion
- Soft play detection, win trading, chip dumping, item transfer schemes
- Auto-triggers every 50 hands at a table
- Flagged with severity for review

### Other Implemented Features
- **Friends**: add, accept, decline, remove, invite to table
- **Chat + emotes** at table
- **Daily rewards**: 7-day streak with escalating chips/XP/gems
- **Achievements**: auto-unlock with progress tracking
- **Inventory**: equip/unequip items to 6 slots (Head, Weapon, Armor, Accessory, Boots, Special)
- **Leaderboards**: chips, wins, level, biggest pot
- **Settings + Reset Progress**: full data wipe with confirmation dialog
- **Player Profile Popup**: tap any seat to see "baseball card" — stats, title, crew, fire status, karma

---

## Economy & Monetization (Designed, Not Yet Implemented)

### Revenue Streams
1. **Ads** — interstitial, rewarded video, banners
2. **Premium membership** — $4.99/mo (ad-free, exclusive cosmetics, 2× daily chips)
3. **Cosmetic store** — avatars, card backs, emotes, table themes, profile frames
4. **Chip packs** — $5 / $20 / $50 (one-way, can't cash out)

### Legal Compliance
- Gambleable items = zero cash value, can't be cashed out
- Store items = can't be gambled (account-bound)
- Chips = one-way purchase + earnable free = not gambling

---

## Technical Architecture

| Decision | Rationale |
|----------|-----------|
| **Programmatic UI, no prefabs** | No scene file conflicts, easy theming, single-file reskin |
| **ScriptableObject theme** | `Theme.Current` everywhere — change one file, change everything |
| **Scene-per-feature** | Self-contained, memory-friendly on mobile |
| **Server-authoritative** | Client never evaluates hands or manages state — just display + input |
| **Stats from raw data** | All stats computed from `hand_history` records — accurate, recalculable |
| **Fire/robbery/perks server-side** | Prevents client-side manipulation |
| **100+ socket events** | Full real-time communication |
| **20+ database tables** | Full persistence for all systems |

---

## What's Left To Do

### Done ✅
- All 23 server modules built and wired
- All 15 Unity scenes built and wired
- All gameplay systems functional end-to-end
- Dark theme applied across entire app

### Remaining 🔮
1. **AI-generated assets** — character sprites, boss portraits, item icons, backgrounds, card backs, UI frames (prompts ready in `ART_ASSET_PROMPTS.md` and `IMAGE_GENERATION_PROMPTS.md`)
2. **AI-generated audio** — character sound effects for win/lose/fold/taunt
3. **Monetization** — ad integration (AdMob/Unity Ads), chip purchasing, premium membership, store UI
4. **Android build optimization** — texture compression, touch testing, 60fps target, splash screen, Play Store listing
5. **Known bug**: Potential chips/money loss (under investigation, cumulative across hands)
