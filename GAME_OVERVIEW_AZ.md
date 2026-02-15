# 🎮 The Game — A-to-Z

**One-liner:** GTA meets poker. An Android multiplayer Texas Hold'em game wrapped in a crime/cyber/RPG world — think underground neon rooms, street hustlers, hacker terminals, and Wild West showdowns after heated card games.

**Tech stack:** Unity (C#) client → Socket.IO WebSockets → Node.js server → MySQL database.

**Repos:**
- Server: [github.com/pr4wn-dev/poker-server](https://github.com/pr4wn-dev/poker-server)
- Client: [github.com/pr4wn-dev/poker-client-unity](https://github.com/pr4wn-dev/poker-client-unity)

**Last updated:** Feb 13, 2026

---

## A — Adventure Mode

A single-player PvE campaign. A world map with **8 areas** and **13 bosses**, each with unique poker AI personalities. You play poker heads-up against the boss AI. Win → get items, XP, chips, and rare character drops. Areas unlock via level gates, item keys, or boss kills:

| Area | Bosses | Unlock |
|------|--------|--------|
| Poker Academy | Dealer Dan | Always open |
| Downtown Casino | Slick Sally, Iron Mike | Level 2 |
| The Highrise | The Countess, The Cipher | Level 5 + Iron Mike beat |
| The Underground | Shadow, Viper | Level 8 + 50K chips |
| The Golden Yacht | Captain Goldhand, The Heiress | Yacht Invitation item |
| Private Island | The Mogul, The Oracle | Island Key + Level 15 |
| The Penthouse | **The House** (final boss) | Level 20 + Oracle beat |
| ??? Lounge | **???** (secret boss) | Mystery Token item |

Bosses have distinct poker styles: passive, aggressive, tight, loose, tricky, balanced. They taunt you during play. Adventure is where you grind items and unlock characters that make you stronger in combat.

---

## B — Bots

AI-controlled players. Two types:
- **AI Bots** — join tables from the server, have personality types
- **Socket Bots** — connect via Socket.IO for testing
- **Simulation Mode** — spectate bot-only games for debugging/testing

---

## C — Characters (10 Playable)

Every player picks a character. Each has a portrait, sound set (win/lose/fold/all-in/taunt), personality, and rarity tier. Rarer = harder to obtain, but will also have better **combat stats** (ATK/DEF/SPD) for the combat system.

| Character | Rarity |
|-----------|--------|
| The Kid | Common (everyone starts with this) |
| Big Tex | Uncommon |
| Whiskers | Uncommon |
| Lil' Stinky | Rare |
| Bones | Rare |
| Deadbeat | Rare |
| Glitch | Epic |
| Nana | Epic |
| The Don | Legendary |
| Pixel God | Mythic |

Characters render at table seats. They're earned from adventure boss drops and displayed throughout the game (profiles, seats, combat).

---

## D — Daily Rewards

A **7-day login streak** system. Escalating chips/XP/gems each day. Auto-popup when you log in and a reward is available. Miss a day = reset the streak.

---

## E — Economy (Dual-Track, Legal)

The entire economy is designed so the game is **NOT legally classified as gambling**.

**Chips:**
- Earn free: win hands, daily login, challenges, level up, tournaments
- Buy optional: $5→10K, $20→50K, $50→150K
- **One-way only** — can't sell chips back (legal compliance)

**Items — two types:**

| | Gambleable Items | Store Items |
|--|-----------------|-------------|
| Source | Boss drops, tournaments | Real money |
| Item Ante | ✅ Can gamble | ❌ Never |
| Trading | ✅ Player-to-player | ❌ Account-bound |
| Cash value | Zero | N/A |

**Power Score system:** Items use Power Score instead of dollar values: `Power = (Rarity × Drop Rate × Demand)`. Examples: Flaming Ace (Legendary) = 9,500 power, Gold Chip (Epic) = 3,200, Silver Card (Rare) = 850, Wood Token (Common) = 120.

**Revenue model:** Ads (interstitial, rewarded video, banners), Premium Membership ($4.99/mo), Cosmetic Store, optional Chip Packs. Zero real-money gambling.

---

## F — Fire/Cold System (NBA Jam Style)

Win streaks = 🔥. Lose streaks = 🧊. Tracked via a rolling window of the last 12 hands, weighted toward recent hands.

| Fire Levels | Cold Levels |
|-------------|-------------|
| Warm (cyan glow) | Cool (dull blue) |
| Heating Up (magenta) | Chilly (blue glow) |
| On Fire (purple + pulse) | Freezing (frost overlay) |
| Blazing (full fire + wobble) | Ice Cold (full ice effect) |

Visual effects show at your table seat. Consecutive folds cool you down. Displayed in profiles and player popups.

---

## G — Gangs / Crews

Create or join a crew. Roles: Leader, Officer, Member. Features:
- Crew XP, levels, and perks
- Crew leaderboard
- Crew chat
- Invite/promote/kick members
- **Combat backup** — online crew members give you +2 combat score each (max +10) when you're in a fight
- Can't challenge your own crewmates (friendly fire protection)

---

## H — Hand Evaluation & History

Full 7-card Texas Hold'em hand evaluation. Tracks every hand you play with:
- Action log per hand
- Saved hands / bookmarks
- Hand of the Day (community highlight)
- Hand Replay scene — step through any saved hand move by move

---

## I — Items (44 Templates)

Items have rarity tiers (Common → Legendary) and a **Power Score**. Two categories:

### Combat Items (20) — at risk in fights, give combat bonuses

| Category | Count | Stat | Examples |
|----------|-------|------|---------|
| **Weapons** | 8 | +ATK | Pocket Knife, Rusty Revolver, Sawed-Off, Tommy Gun, Gold Desert Eagle, RPG, Tactical Nuke |
| **Armor** | 6 | +DEF | Leather Jacket, Kevlar Vest, Riot Shield, Military Armor, Titanium Plate, Juggernaut Suit |
| **Gear** | 6 | +SPD | Running Shoes, Smoke Bomb, Flash Grenade, Motorcycle Keys, Nitro Boost, Getaway Helicopter |

Combat items drop from **adventure bosses** (higher areas = rarer drops), **tournament prizes**, and **combat wins**. They are gambleable and at risk in fights. The **Tactical Nuke** (Legendary, +16 ATK) is the rarest item in the game.

### Cosmetic Items (24) — safe, zero combat bonus

| Category | Count | Examples |
|----------|-------|---------|
| Card Backs | 4 | Flame, Diamond, Golden, Holographic |
| Avatars | 4 | Lone Wolf, Card Shark, Dragon, The Legend |
| Trophies | 3 | Beginner's Trophy, Underground Champion, The House Trophy |
| Location Keys | 4 | Underground Pass, Yacht Invitation, Island Key, Mystery Token |
| Vehicles | 3 | Speedboat, Golden Mega Yacht, Private Jet |
| XP Boosts | 4 | Small (100 XP) → Mega (10,000 XP) |
| Table/Chip Cosmetics | 4 | Velvet Table, Golden Table, Casino Chips, Platinum Chips |

Cosmetic items are NEVER at risk in fights and give zero combat bonus. They're used in **Item Ante** poker mode and for visual customization.

### Equipment Slots (6)

| Slot | Type | Combat Effect |
|------|------|--------------|
| 1 | **Weapon** | +ATK |
| 2 | **Armor** | +DEF |
| 3 | **Gear** | +SPD |
| 4 | Card Back | Cosmetic only |
| 5 | Table Skin | Cosmetic only |
| 6 | Avatar | Cosmetic only |

---

## J — Join/Create Tables

From the Lobby, you can:
- Browse all public tables (auto-refreshes every 15s)
- Search/filter tables
- Create a table with full options: name, max players, blinds, buy-in, timer, privacy (password), bot fill, item ante toggle
- Join with one tap (password prompt for private tables)

---

## K — Kill or Be Killed (Combat Consequences)

When you win a fight:
- Take both wagered items (yours back + opponent's)
- Take half the loser's chip balance
- +1 Heat
- Crew XP (if in a crew)

When you lose a fight:
- Lose your wagered item
- Lose half your chips
- Get "Bruised" status (1 hour — can't be challenged again)
- Small XP consolation prize

When you flee:
- Lose 10% of your chips (coward tax)
- Keep all items
- Get "Coward" tag for 1 hour (cosmetic, visible at seats)
- Challenger gets the 10%

When you disconnect during a challenge:
- **Auto-LOSE** — full fight loss penalties (no dodging by closing the app)

---

## L — Leaderboards

Rankings by: chips, wins, level, biggest pot. Will add **"Most Dangerous"** (by heat / combat wins) when the combat system is built.

---

## M — Multiplayer (Real-Time)

Socket.IO WebSocket communication. Features:
- Multi-table support
- Per-player card visibility (no cheating)
- Auto-reconnect with exponential backoff
- Stale session cleanup
- Race condition guards
- 100+ socket events for every system

---

## N — Heat (Replacing Karma)

Your lifetime combat reputation. Goes up, never down.

| Heat | Title | Seat Visual |
|-----------|-------|-------------|
| 0–5 | Civilian | Nothing |
| 6–15 | Troublemaker | Small skull |
| 16–30 | Outlaw | Skull + crossbones |
| 31–50 | Gunslinger | Flaming skull |
| 51+ | Most Wanted | Animated skull + glow |

Earn: +1 per combat win, +0.5 per loss (showed up to fight), +0 for fleeing. Tiny combat bonus (+1 per 10 heat, max +5). Displayed at seats, profiles, and leaderboards.

---

## O — On-Fire System

(See **F — Fire/Cold System** above)

---

## P — Poker (Core Gameplay)

Full Texas Hold'em:
- Preflop → Flop → Turn → River
- Fold / Check / Call / Bet / Raise / All-In
- Quick-bet buttons + slider with text input
- Side pot logic for multi-way all-ins
- Showdown with hand name + winner animation
- Chip-to-pot animations (gold circles fly seat→pot and pot→winner)
- Dealing animation (partial — cards appear, arc animation TBD)
- Per-hand action log + hand history
- Table chat + emotes
- Player profile popup (tap any seat)
- Spectator mode with live Monte Carlo win odds + side betting
- Invite friends from table
- Rebuy / add chips with slider
- Sit out / sit back
- Reconnection mid-hand (auto-restore seat + state)

### Item Ante ("For Keeps")

A special table mode where you gamble inventory items in poker. Table creator sets a minimum Power Score. Before each hand, all players ante up items meeting the minimum. Winner takes all items. Practice mode available (virtual items, no risk). Store-purchased items can never be gambled (legal compliance).

---

## Q — Quick Play

From the Main Menu, tap "Multiplayer" to go straight to the Lobby and join a game fast. "Adventure" takes you to the world map.

---

## R — Combat System (PvP Showdowns)

**Replaces the old Robbery & Karma system.** Full spec in `COMBAT_SYSTEM_DESIGN.md`.

### Mark During a Game (Primary Path)
You're at the poker table, someone sucks out on you, you're fuming. Tap their seat → **"MARK FOR FIGHT"**. The mark is **silent** — they don't know. When the game ends, all marks are delivered as challenges.

**If both players marked each other → MUTUAL SHOWDOWN.** No flee option. You both wanted this. Fight resolves immediately.

```
During Poker Game → Mark opponent (silent)
    ↓
Poker Game Ends
    ↓
Mutual marks? → 🔥 INSTANT FIGHT (no flee)
One-way mark? → Target gets popup → FIGHT or FLEE (30 sec)
    ↓
📴 Disconnect = Auto-LOSE (no dodging)
```

### Challenge Outside a Game
You can also pick fights outside of poker:
- **Friends list** — challenge any friend, anytime
- **Recent Opponents** — anyone you played with in the last 24 hours
- **Leaderboard** — call out a top player (bold move)

Same stakes, same resolution, same rules. Outside challenges always give the target fight/flee choice (no mutual marks).

### Combat Resolution (auto, no mini-game)
```
Combat Score = Character Stats (ATK + DEF + SPD)
             + Combat Item Bonuses (Weapon ATK + Armor DEF + Gear SPD)
             + Crew Backup (+2 per online crewmate, max +10)
             + Heat Bonus (max +5)
             + Random Roll (±20%)
```

Higher score wins. The ±20% random roll means upsets happen — a weaker player can still win ~30% of the time.

**Rules:**
- 1 challenge per target per 24 hours
- Bruised = can't be challenged for 1 hour after losing
- Minimum 1,000 chips to be challenged (poverty protection)
- Crew immunity — can't fight your own crewmates
- Marks cancelled if you leave the table before the game ends

---

## S — Statistics (40+ Metrics)

Eight tabs of stats:
1. **Overview** — hands played, wins, profit/loss, biggest pot
2. **Skill** — VPIP, PFR, 3-bet%, aggression factor, c-bet%, steal%
3. **Luck** — draw completion, suckout rate, river luck index
4. **Pockets** — per starting hand combo (AA, AKs, etc.) — times dealt, win rate
5. **Hand Types** — frequency + win rate per hand (high card → royal flush)
6. **Trends** — session-over-session charts
7. **Rare Hands** — special hand milestones
8. **Titles** — your earned dynamic titles

---

## T — Titles (26 Dynamic Titles)

Auto-evaluated from your stats, revocable if stats drop. 7 categories:

| Category | Titles |
|----------|--------|
| Luck | River Rat, Lucky Draw, Blessed, Cursed |
| Skill | Bluff Master, Human Lie Detector, Stone Cold, The Shark, The Rock |
| Style | Maniac, Calling Station, Nit, LAG, TAG |
| Hands | Flush Royalty, Straight Shooter, Full House, Quad God |
| Achievement | Royal, Untouchable, Comeback Kid, High Roller, Veteran, Grinder |
| Rare | Ghost, Marathon |

Displayed at table seats and profiles.

---

## U — UI System (Programmatic)

**Zero prefabs.** Every panel, button, text element is created in C# via `UIFactory`. This makes the entire UI:
- Portable (no Unity editor dependencies)
- Themeable (one `GameTheme` ScriptableObject controls all colors, sizes, spacing, timing)
- Consistent (dark cyberpunk across all 16 scenes)

Visual identity: neon cyan, deep crimson, electric purple, neon green. HUD-style framed panels with corner brackets and scan-line overlays. Rarity glow effects (gray → green → blue → purple → gold → rainbow holographic).

3 area presets: Dirty Downtown, High Roller Penthouse, Underground Bunker.

---

## V — Visual Effects & Animations

- BounceIn, FadeIn, SlideIn, Pulse, Wobble, ScaleBounce
- Chip movement animations (seat→pot, pot→winner)
- Fire glow / frost overlay at seats
- Card flip animations
- Scene transitions (fade)
- Rarity glow borders on items
- Toast notifications (success/error/warning/info)
- Winner celebration animation
- Combat face-off animation (3-second dramatic sequence — TBD)

---

## W — World Map

(See **A — Adventure Mode** above. 8 areas, 13 bosses, level/item gates, XP rewards.)

---

## X — XP & Leveling

25-level progression curve:

| Level | Total XP |
|-------|----------|
| 1 | 0 |
| 2 | 100 |
| 3 | 250 |
| 5 | 1,000 |
| 10 | 12,000 |
| 15 | 52,000 |
| 20 | 170,000 |
| 25 (max) | 550,000 |

XP from: winning hands, boss defeats, tournaments, daily rewards, level-up bonuses. XP Boost items exist (consumable).

---

## Y — Your Profile

Tap any player's seat at the table to see their full profile popup:
- Character portrait + name
- Level, XP, chips
- Active title
- Crew name + role
- Fire/cold status
- Heat rank (replacing karma heart)
- Key stats (VPIP, win rate, hands played)

---

## Z — Zones (16 Scenes)

| # | Scene | What It Does |
|---|-------|-------------|
| 1 | **MainMenu** | Login/register, mode selection, daily rewards, event banner, nav hub |
| 2 | **CharacterSelect** | Gallery of 10 characters, set active |
| 3 | **Lobby** | Browse/create/join poker tables |
| 4 | **Table** | Core poker gameplay — the heart of the game |
| 5 | **Tournament** | Browse/register tournaments, active tournament HUD |
| 6 | **AdventureMap** | World map with 8 areas |
| 7 | **Adventure** | Area detail + boss list |
| 8 | **AdventureBattle** | Poker vs AI boss |
| 9 | **Inventory** | RPG-style equip screen with 6 slots |
| 10 | **Statistics** | 40+ stats in 8 tabs |
| 11 | **Leaderboard** | Rankings by chips/wins/level |
| 12 | **Combat** | Post-game PvP stats, fight history, heat (replacing Robbery) |
| 13 | **Crew** | Gang management, chat, leaderboard |
| 14 | **Friends** | Friend list, requests, search, invite |
| 15 | **HandReplay** | Replay saved hands step-by-step |
| 16 | **Shop** | Cosmetic store (scaffold, needs catalog) |
| — | **Settings** | Audio, graphics, gameplay, reset, logout |

---

## Additional Systems

### Collusion Detection
Auto-trigger analysis every 50 hands. Detects: soft play, win trading, chip dumping.

### Events
Seasonal/weekly events with XP/chip multipliers. 9 event types. Banners displayed on Main Menu.

### Spectator Mode
Watch live games. See Monte Carlo win probability bars for each player. Place side bets on who wins.

### Achievements
Auto-unlock system with progress tracking. Milestone-based (hands played, chips won, etc.).

---

## What's Built vs What's Left

| Category | Status |
|----------|--------|
| Core poker engine | ✅ Done |
| All 16+ scenes | ✅ Built |
| Adventure mode | ✅ Done (needs art) |
| Characters (10) | ✅ Done (needs art + audio) |
| Items (44: 20 combat + 24 cosmetic) + Item Ante | ✅ Done (needs art + combat items in code) |
| Tournaments | ✅ Done |
| Crews | ✅ Done |
| Statistics + Titles | ✅ Done |
| Fire/Cold | ✅ Done |
| Friends + Social | ✅ Done |
| Leaderboard | ✅ Done |
| Per-scene music + SFX | ✅ Done |
| **Combat system** | 📋 Designed (20 combat items + 10 char stats + full spec), not coded (~12-14 hrs) |
| **Art assets** | 🎨 All placeholder — need AI generation |
| **Audio assets** | 🔊 Character voice lines + royal flush SFX missing |
| **Monetization** | 💰 Not started (ads, IAP, premium) |
| **Android release** | 📱 Not started (build, Play Store) |

**Overall: ~76% code-complete.** The biggest remaining code work is the combat system (9 items). After that it's art, audio, monetization, and platform polish.

---

## Technical Stats

**Server:** 23+ modules, ~22,000 lines of JavaScript
- Table.js alone is ~10,000 lines (full poker engine)
- SocketHandler.js: 4,300 lines, 100+ event handlers
- 20+ auto-migrating MySQL tables

**Client:** 16 scenes + 11 UI components, ~25,000 lines of C#
- TableScene: 3,500 lines
- MainMenuScene: 2,400 lines
- TournamentScene: 1,048 lines
- 80+ GameService API methods

**Database:** 24 tables with automatic migrations. Stores users, hand history, stats (40+ metrics per player), items, characters, crews, friends, events, achievements, combat logs, and more.
