# Feature Inventory — Complete Game Reference

**Last updated:** Feb 13, 2026  
**Purpose:** Full inventory of every character, boss, item, area, title, and system in the game. Use this to verify nothing was lost between machines.

---

## Playable Characters (10) — `src/game/CharacterSystem.js`

| # | ID | Name | Rarity |
|---|-----|------|--------|
| 1 | `shadow_hacker` | Shadow Hacker | Common |
| 2 | `big_tex` | Big Tex | Uncommon |
| 3 | `whiskers` | Whiskers | Uncommon |
| 4 | `lil_stinky` | Lil' Stinky | Rare |
| 5 | `bones` | Bones | Rare |
| 6 | `deadbeat` | Deadbeat | Rare |
| 7 | `glitch` | Glitch | Epic |
| 8 | `nana` | Nana | Epic |
| 9 | `the_don` | The Don | Legendary |
| 10 | `pixel_god` | Pixel God | Mythic |

Each character has: sprite set, sound set (win/lose/fold/all-in/taunt), personality type, and drop logic.

---

## Adventure Bosses (13) — `src/adventure/Boss.js`

### Area 1: Poker Academy (Starter)
| Boss | Difficulty | Level Req | Entry Fee | Chips | Skill | XP Reward |
|------|-----------|-----------|-----------|-------|-------|-----------|
| **Dealer Dan** (`boss_tutorial`) | Easy | 1 | 0 | 5,000 | 0.20 | 50 |

### Area 2: Downtown Casino
| Boss | Difficulty | Level Req | Entry Fee | Chips | Skill | XP Reward |
|------|-----------|-----------|-----------|-------|-------|-----------|
| **Slick Sally** (`boss_slick`) | Easy | 2 | 500 | 7,500 | 0.35 | 100 |
| **Iron Mike** (`boss_iron`) | Medium | 3 | 1,000 | 10,000 | 0.45 | 200 |

### Area 3: The Highrise
| Boss | Difficulty | Level Req | Entry Fee | Chips | Skill | XP Reward |
|------|-----------|-----------|-----------|-------|-------|-----------|
| **The Countess** (`boss_countess`) | Medium | 5 | 2,500 | 12,000 | 0.55 | 350 |
| **The Cipher** (`boss_cipher`) | Hard | 7 | 5,000 | 15,000 | 0.65 | 500 |

### Area 4: The Underground
| Boss | Difficulty | Level Req | Entry Fee | Chips | Skill | XP Reward |
|------|-----------|-----------|-----------|-------|-------|-----------|
| **Shadow** (`boss_shadow`) | Hard | 8 | 10,000 | 25,000 | 0.72 | 800 |
| **Viper** (`boss_viper`) | Expert | 10 | 20,000 | 40,000 | 0.78 | 1,200 |

### Area 5: The Golden Yacht (Special — requires Yacht Invitation item)
| Boss | Difficulty | Level Req | Entry Fee | Chips | Skill | XP Reward |
|------|-----------|-----------|-----------|-------|-------|-----------|
| **Captain Goldhand** (`boss_captain`) | Hard | 10 | 25,000 | 50,000 | 0.75 | 1,500 |
| **The Heiress** (`boss_heiress`) | Expert | 12 | 50,000 | 80,000 | 0.82 | 2,500 |

### Area 6: Private Island (Ultra Late — requires Island Key item + Level 15)
| Boss | Difficulty | Level Req | Entry Fee | Chips | Skill | XP Reward |
|------|-----------|-----------|-----------|-------|-------|-----------|
| **The Mogul** (`boss_mogul`) | Expert | 15 | 100,000 | 150,000 | 0.88 | 5,000 |
| **The Oracle** (`boss_oracle`) | Legendary | 18 | 200,000 | 250,000 | 0.92 | 10,000 |

### Area 7: The Penthouse (Final — requires Level 20 + Oracle defeated)
| Boss | Difficulty | Level Req | Entry Fee | Chips | Skill | XP Reward |
|------|-----------|-----------|-----------|-------|-------|-----------|
| **The House** (`boss_final`) | Legendary | 20 | 500,000 | 1,000,000 | 0.98 | 50,000 |

### Area 8: ??? Lounge (Secret — requires Mystery Token item)
| Boss | Difficulty | Level Req | Entry Fee | Chips | Skill | XP Reward |
|------|-----------|-----------|-----------|-------|-------|-----------|
| **???** (`boss_mystery`) | Legendary | 22 | 1,000,000 | 2,000,000 | 0.99 | 100,000 |

### Boss AI Play Styles
- **Passive** — Calls a lot, rarely raises (Dealer Dan)
- **Aggressive** — Bets and raises frequently (Iron Mike, Viper)
- **Tight** — Plays few hands, strong cards only (The Countess, The Mogul)
- **Loose** — Plays many hands (Captain Goldhand)
- **Tricky** — Lots of bluffs and traps (Slick Sally, Shadow, ???)
- **Balanced** — Mix of all styles (The Cipher, The Heiress, The Oracle, The House)

### Total Named Characters: 23 (10 playable + 13 bosses)

---

## World Map Areas (8) — `src/adventure/WorldMap.js`

| # | ID | Name | Type | Unlock Requirements | Bosses |
|---|-----|------|------|-------------------|--------|
| 1 | `area_tutorial` | Poker Academy | Starter | None (always open) | 1 |
| 2 | `area_downtown` | Downtown Casino | Casino | Level 2 | 2 |
| 3 | `area_highrise` | The Highrise | City | Level 5 + Iron Mike defeated | 2 |
| 4 | `area_underground` | The Underground | Underground | Level 8 + 50K chips | 2 |
| 5 | `area_yacht` | The Golden Yacht | Yacht | Yacht Invitation item | 2 |
| 6 | `area_island` | Private Island | Island | Island Key item + Level 15 | 2 |
| 7 | `area_penthouse` | The Penthouse | Penthouse | Level 20 + Oracle defeated | 1 |
| 8 | `area_secret_lounge` | ??? Lounge | Secret | Mystery Token item | 1 |

### XP Level Curve (25 levels)
| Level | Total XP Required |
|-------|-----------------|
| 1 | 0 |
| 2 | 100 |
| 3 | 250 |
| 5 | 1,000 |
| 10 | 12,000 |
| 15 | 52,000 |
| 20 | 170,000 |
| 25 (max) | 550,000 |

---

## Items (44 templates) — `src/models/Item.js`

### Equipment Slots (6 total — 3 combat + 3 cosmetic)

| Slot | Type | Combat Effect |
|------|------|--------------|
| 1 | **Weapon** | +ATK |
| 2 | **Armor** | +DEF |
| 3 | **Gear** | +SPD |
| 4 | Card Back | Cosmetic only |
| 5 | Table Skin | Cosmetic only |
| 6 | Avatar | Cosmetic only |

> Cosmetic items give ZERO combat bonus and are NEVER at risk in fights. Only combat items (weapons, armor, gear) can be wagered.

### Combat Items (20) — NEW

#### Weapons (8) — Weapon slot, +ATK
| Template ID | Name | Rarity | ATK | Drop Source |
|-------------|------|--------|-----|------------|
| `weapon_pocket_knife` | Pocket Knife | Common | +1 | Area 1-2 bosses |
| `weapon_rusty_revolver` | Rusty Revolver | Common | +2 | Area 1-2 bosses |
| `weapon_brass_knuckles` | Brass Knuckles | Uncommon | +3 | Area 2-3 bosses |
| `weapon_sawed_off` | Sawed-Off Shotgun | Uncommon | +4 | Area 3 bosses |
| `weapon_tommy_gun` | Tommy Gun | Rare | +7 | Area 4 bosses, tournaments |
| `weapon_gold_deagle` | Gold Desert Eagle | Epic | +10 | Area 5-6 bosses, combat wins |
| `weapon_rpg` | RPG Launcher | Legendary | +14 | Area 7 boss, rare combat drop |
| `weapon_tactical_nuke` | Tactical Nuke | Legendary | +16 | Area 8 boss only (1 in 1000) |

#### Armor (6) — Armor slot, +DEF
| Template ID | Name | Rarity | DEF | Drop Source |
|-------------|------|--------|-----|------------|
| `armor_leather_jacket` | Leather Jacket | Common | +2 | Area 1-2 bosses |
| `armor_kevlar_vest` | Kevlar Vest | Uncommon | +4 | Area 2-3 bosses |
| `armor_riot_shield` | Riot Shield | Uncommon | +3 | Area 3 bosses |
| `armor_military` | Military Body Armor | Rare | +7 | Area 4 bosses, tournaments |
| `armor_titanium` | Titanium Plate Carrier | Epic | +10 | Area 5-6 bosses |
| `armor_juggernaut` | Juggernaut Suit | Legendary | +14 | Area 7-8 bosses |

#### Gear (6) — Gear slot, +SPD
| Template ID | Name | Rarity | SPD | Drop Source |
|-------------|------|--------|-----|------------|
| `gear_running_shoes` | Running Shoes | Common | +2 | Area 1-2 bosses |
| `gear_smoke_bomb` | Smoke Bomb | Uncommon | +4 | Area 2-3 bosses |
| `gear_flash_grenade` | Flash Grenade | Rare | +6 | Area 4 bosses |
| `gear_motorcycle_keys` | Motorcycle Keys | Rare | +7 | Area 4 bosses, tournaments |
| `gear_nitro_boost` | Nitro Boost | Epic | +10 | Area 5-6 bosses |
| `gear_getaway_heli` | Getaway Helicopter | Legendary | +14 | Area 7-8 bosses |

### Cosmetic Items (24) — existing, zero combat bonus

#### Card Backs (4)
| Template ID | Name | Rarity |
|-------------|------|--------|
| `card_back_flame` | Flame Card Back | Uncommon |
| `card_back_diamond` | Diamond Card Back | Epic |
| `card_back_golden` | Golden Card Back | Legendary |
| `card_back_hologram` | Holographic Card Back | Legendary |

#### Avatars (4)
| Template ID | Name | Rarity |
|-------------|------|--------|
| `avatar_wolf` | Lone Wolf | Uncommon |
| `avatar_shark` | Card Shark | Rare |
| `avatar_dragon` | Dragon | Epic |
| `avatar_legend` | The Legend | Legendary |

#### Trophies (3)
| Template ID | Name | Rarity |
|-------------|------|--------|
| `trophy_first_boss` | Beginner's Trophy | Common |
| `trophy_underground` | Underground Champion | Rare |
| `trophy_final` | The House Trophy | Legendary |

#### Location Keys (4)
| Template ID | Name | Rarity | Unlocks |
|-------------|------|--------|---------|
| `UNDERGROUND_PASS` | Underground Pass | Epic | The Underground |
| `YACHT_INVITATION` | Golden Yacht Invitation | Legendary | The Golden Yacht |
| `ISLAND_KEY` | Private Island Key | Legendary | Private Island |
| `MYSTERY_TOKEN` | ??? Token | Legendary | ??? Lounge |

#### Vehicles (3)
| Template ID | Name | Rarity |
|-------------|------|--------|
| `VEHICLE_YACHT_SMALL` | Speedboat | Rare |
| `VEHICLE_YACHT_GOLD` | Golden Mega Yacht | Legendary |
| `VEHICLE_JET` | Private Jet | Legendary |

#### XP Boosts (4)
| Template ID | Name | Rarity | XP Amount |
|-------------|------|--------|-----------|
| `XP_BOOST_SMALL` | XP Chip (Small) | Common | 100 |
| `XP_BOOST_MEDIUM` | XP Chip (Medium) | Uncommon | 500 |
| `XP_BOOST_LARGE` | XP Chip (Large) | Rare | 2,000 |
| `XP_BOOST_MEGA` | XP Jackpot | Epic | 10,000 |

#### Table/Chip Cosmetics (4)
| Template ID | Name | Rarity |
|-------------|------|--------|
| `TABLE_SKIN_VELVET` | Velvet Table | Uncommon |
| `TABLE_SKIN_GOLD` | Golden Table | Legendary |
| `CHIP_STYLE_CASINO` | Casino Royale Chips | Rare |
| `CHIP_STYLE_PLATINUM` | Platinum Chips | Legendary |

### Item Rarity → Power Score Multipliers
| Rarity | Drop Rate | Multiplier |
|--------|-----------|------------|
| Common | 50% | 1x |
| Uncommon | 30% | 5x |
| Rare | 15% | 20x |
| Epic | 4% | 100x |
| Legendary | 1% | 500x |

---

## Player Titles (26) — `src/stats/TitleEngine.js`

### Luck Category (4)
| ID | Name | Trigger |
|----|------|---------|
| `RIVER_RAT` | River Rat | High river win rate |
| `LUCKY_DRAW` | Lucky Draw | High draw completion rate |
| `BLESSED` | Blessed | Overall high luck index |
| `CURSED` | Cursed | Overall low luck index |

### Skill Category (5)
| ID | Name | Trigger |
|----|------|---------|
| `BLUFF_MASTER` | Bluff Master | High bluff success rate |
| `HUMAN_LIE_DETECTOR` | Human Lie Detector | High bluff catch rate |
| `STONE_COLD` | Stone Cold | Very tight + winning |
| `THE_SHARK` | The Shark | High VPIP + high win rate |
| `THE_ROCK` | The Rock | Low VPIP + solid win rate |

### Style Category (5)
| ID | Name | Trigger |
|----|------|---------|
| `MANIAC` | Maniac | Very high aggression |
| `CALLING_STATION` | Calling Station | High call rate, low raise |
| `NIT` | Nit | Very low VPIP |
| `LAG` | LAG | Loose-Aggressive |
| `TAG` | TAG | Tight-Aggressive |

### Hands Category (4)
| ID | Name | Trigger |
|----|------|---------|
| `FLUSH_KING` | Flush Royalty | Many flushes won |
| `STRAIGHT_SHOOTER` | Straight Shooter | Many straights won |
| `FULL_HOUSE_BOSS` | Full House | Many full houses won |
| `QUAD_GOD` | Quad God | Multiple quads hit |

### Achievement Category (6)
| ID | Name | Trigger |
|----|------|---------|
| `ROYAL` | Royal | Hit a royal flush |
| `UNTOUCHABLE` | Untouchable | Long winning streak |
| `COMEBACK_KID` | Comeback Kid | Big comebacks from behind |
| `HIGH_ROLLER` | High Roller | Large average pot size |
| `VETERAN` | Veteran | Many hands played |
| `GRINDER` | Grinder | Many sessions played |

### Rare Category (2)
| ID | Name | Trigger |
|----|------|---------|
| `GHOST` | Ghost | Rarely goes to showdown |
| `MARATHON` | Marathon | Very long sessions |

---

## Notoriety System (replacing Karma) — See `COMBAT_SYSTEM_DESIGN.md`

| Notoriety Range | Title | Combat Bonus |
|-----------------|-------|-------------|
| 0–49 | Civilian | None |
| 50–149 | Troublemaker | Tiny |
| 150–299 | Outlaw | Small |
| 300–499 | Gunslinger | Moderate |
| 500+ | Most Wanted | Large |

- Starts at 0 for every player
- Win a fight → +25 notoriety
- Lose a fight → −10 notoriety (floor 0)
- Flee → −5 notoriety
- Cosmetic skull icon at table seats scales with tier
- **Old Karma/Heart system is being retired** — see `COMBAT_SYSTEM_DESIGN.md` for full spec

---

## Fire/Cold System — `src/game/FireTracker.js`

### Fire Levels (win streaks / strong hands)
| Level | Name | Visual |
|-------|------|--------|
| 0 | None | — |
| 1 | Warm | Cyan glow |
| 2 | Heating Up | Magenta glow |
| 3 | On Fire | Purple glow + pulse |
| 4 | Blazing | Full fire effect + wobble |

### Cold Levels (loss streaks / bad hands)
| Level | Name | Visual |
|-------|------|--------|
| 0 | None | — |
| 1 | Cool | Dull blue |
| 2 | Chilly | Blue glow |
| 3 | Freezing | Frost overlay |
| 4 | Ice Cold | Full ice effect |

- Rolling window of last 12 hands
- Recent hands weighted more heavily
- Consecutive folds cool you down

---

## Stats Tracked (40+) — `src/stats/StatsEngine.js` + `StatsCalculator.js`

### Core Stats
- Hands played, hands won, showdowns reached, showdowns won
- VPIP (Voluntarily Put $ In Pot), PFR (Pre-Flop Raise), 3-bet %
- Aggression factor, continuation bet %, steal attempt %
- Win rate, profit/loss, biggest pot won

### Advanced Stats
- Bluff attempt rate, bluff success rate, bluff catch rate
- Draw completion rate (flush draws, straight draws)
- Suckout rate (winning when behind on flop)
- River win rate, river fold rate
- Position win rates (UTG, MP, CO, BTN, SB, BB)

### Hand Type Stats
- Frequency and win rate per hand type (high card through royal flush)

### Pocket Stats
- Per starting hand combo (AA, AKs, AKo, etc.) — times dealt, win rate

---

## Server Modules — All Files

### Core Game (`src/game/`)
| File | Size | Description |
|------|------|-------------|
| `Table.js` | ~10K lines | Full Texas Hold'em engine, side pots, hand eval, item ante |
| `GameManager.js` | — | Table + player management |
| `BotManager.js` | — | Bot AI, item ante handling |
| `BotPlayer.js` | — | Bot personality + behavior |
| `Deck.js` | — | Card deck |
| `HandEvaluator.js` | — | 7-card hand ranking |
| `ItemAnte.js` | — | Item ante ("For Keeps") logic |
| `Tournament.js` | — | Single tournament logic |
| `TournamentManager.js` | — | Tournament lifecycle |
| `CharacterSystem.js` | 17K | 10 characters, drops, sounds, sprites |
| `FireTracker.js` | 10K | NBA Jam fire/cold streak system |
| `RobberyManager.js` | 20K | → Being replaced by CombatManager (post-game PvP) |
| `SpectatorOdds.js` | 7K | Monte Carlo win probability (500 sims) |

### Adventure (`src/adventure/`)
| File | Description |
|------|-------------|
| `AdventureManager.js` | Adventure mode coordination, session management |
| `AdventurePokerGame.js` | Poker vs AI boss gameplay |
| `Boss.js` | 13 boss definitions with drops, quotes, AI styles |
| `BossAI.js` | Boss poker AI decision engine |
| `WorldMap.js` | 8 areas, XP curve (25 levels), unlock requirements |

### Stats (`src/stats/`)
| File | Description |
|------|-------------|
| `StatsEngine.js` | Per-hand stats processing (40+ metrics) |
| `StatsCalculator.js` | Derived stats (VPIP, PFR, luck index) |
| `TitleEngine.js` | 26 dynamic player titles across 7 categories |

### Social (`src/social/`)
| File | Description |
|------|-------------|
| `FriendsManager.js` | Add, accept, decline, remove friends |
| `CrewManager.js` | Crews with roles, perks, chat, XP, leaderboard |

### Other
| File | Description |
|------|-------------|
| `src/events/EventManager.js` | 9 seasonal/weekly event types with multipliers |
| `src/security/CollusionDetector.js` | Anti-cheat: soft play, win trading, chip dumping |
| `src/sockets/SocketHandler.js` | 100+ socket event handlers |
| `src/database/Database.js` | MySQL connection pool + 20+ table migrations |
| `src/database/UserRepository.js` | User, inventory, friends, stats persistence |
| `src/models/Item.js` | Item model, 44 templates (20 combat + 24 cosmetic), Power Score |

---

## Unity Client Scenes (16) — All Built

| Scene | Key Features |
|-------|-------------|
| **MainMenuScene** | Login/register, quick play, event banner, daily rewards popup, nav hub |
| **LobbyScene** | Browse/create/join tables, item ante toggle, simulation toggle |
| **TableScene** | Poker gameplay, character avatars, fire/cold glow, hearts, chip animations, bet slider, spectator bar, chat, profile popups |
| **StatisticsScene** | 7-tab stats display (Overview, Skill, Luck, Pockets, Hand Types, Trends, Titles) |
| **CharacterSelectScene** | Server-driven gallery, rarity-colored cards, set active |
| **TournamentScene** | Browse/register/unregister tournaments |
| **AdventureMapScene** | World map, area selection |
| **AdventureBattleScene** | Poker vs AI boss, taunts, reward display |
| **InventoryScene** | View/equip/unequip/use items with rarity colors |
| **CrewScene** | Create/manage crew, member list, chat, leaderboard |
| **RobberyScene** | → Being replaced by CombatScene (post-game PvP challenges, fight/flee) |
| **HandReplayScene** | Saved hands browser, Hand of the Day, replay viewer |
| **LeaderboardScene** | Top players by chips/wins/level/biggest pot |
| **FriendsScene** | Friends list, requests, search users, invite to table |
| **ShopScene** | Cosmetic store (scaffold — needs catalog) |
| **SettingsScene** | Audio, controls, reset progress with confirmation |

---

## Unity Client Components

| Component | Description |
|-----------|-------------|
| **PokerTableView** | Table rendering, seat layout, card display, community cards |
| **PlayerSeat/PlayerSeatView** | Per-seat UI: avatar, name, chips, cards, fire/cold glow, notoriety skull, title |
| **CardVisual** | Card rendering with flip animation |
| **PlayerProfilePopup** | Tap-to-view popup with stats, title, crew, notoriety |
| **SpectatorPanel** | Win probability bars, side betting, bet feed |
| **FriendsPanel** | Friends list, add/accept/decline |
| **DailyRewardsPopup** | 7-day streak UI |
| **AchievementsPanel** | Achievement list with progress |
| **InventoryPanel** | In-table inventory for item ante |
| **ChatPanel** | At-table messaging |
| **ToastNotification** | Popup notifications |
| **ConfirmDialog** | Danger/confirmation dialogs |
| **WinnerAnimation** | Hand win celebration |

---

## Socket Events Summary (100+)

### Auth: `register`, `login`, `logout`, `reset_progress`
### Lobby: `get_tables`, `create_table`, `join_table`, `leave_table`
### Game: `action`, `start_game`, `player_ready`, `rebuy`, `add_chips`, `chat`
### Item Ante: `start_side_pot`, `submit_to_side_pot`
### Bots: `invite_bot`, `invite_socket_bot`, `start_simulation`
### Stats: `get_player_stats`, `get_hand_type_stats`, `get_pocket_stats`, `get_hand_history`, `get_hand_replay`
### Titles: `get_titles`, `set_active_title`
### Characters: `get_characters`, `get_player_characters`, `set_active_character`, `get_character_sounds`
### Crews: `create_crew`, `get_crew`, `invite_to_crew`, `join_crew`, `leave_crew`, `crew_promote`, `crew_kick`, `get_crew_leaderboard`
### Combat: `mark_player`, `challenge_player`, `respond_to_challenge`, `get_combat_stats`, `get_combat_history`, `get_recent_opponents`, `challenge_friend`, `challenge_leaderboard_player`
### Notoriety: `get_notoriety` (replacing old karma/robbery events)
### Spectator: `get_spectator_odds`, `spectator_bet`, `spectator_reaction`
### Replays: `save_hand`, `get_saved_hands`, `get_hand_of_the_day`
### Social: `get_friends`, `send_friend_request`, `accept_friend_request`, `decline_friend_request`
### Events/Rewards: `get_active_events`, `get_daily_reward_status`, `claim_daily_reward`
### Equipment: `equip_item`, `unequip_item`
### Profile: `get_player_profile`
### Adventure: `get_world_map`, `get_area_bosses`, `start_adventure`, `adventure_action`, `forfeit_adventure`
### Tournament: `get_all_tournaments`, `register_tournament`, `unregister_tournament`, `get_my_tournament`

---

## Database Tables (20+) — `src/database/Database.js`

1. `users` — Account data, chips, XP, active character, notoriety
2. `hand_history` — Full hand data per player (cards, actions, pot, result)
3. `player_stats` — 40+ aggregated lifetime stats
4. `player_hand_type_stats` — Per hand type (high card → royal flush)
5. `player_pocket_stats` — Per starting hand combo
6. `player_sessions` — Session tracking (start, end, profit)
7. `fire_events` — Fire/cold streak log
8. `player_titles` — Earned dynamic titles
9. `achievements` — Progress tracking
10. `inventory` — Player items
11. `bosses_defeated` — Boss defeat counts per player
12. `characters` — Character catalog
13. `player_characters` — Owned characters per player
14. `crews` — Crew definitions
15. `crew_members` — Crew membership + roles
16. `crew_stats` — Crew-level aggregated stats
17. `combat_log` — PvP combat history (replacing robbery_log)
18. `notoriety_history` — Notoriety change log (replacing karma_history)
19. `recent_opponents` — Recent poker opponents for outside-game challenges
19. `events` — Seasonal/weekly events
20. `daily_rewards` — Daily reward tracking
21. `spectator_bets` — Spectator side bets
22. `saved_hands` — Bookmarked hands
23. `collusion_flags` — Anti-cheat flags
24. `friends` / `friend_requests` — Social connections

---

## What's NOT Done Yet (Deferred)

### Combat System Redesign (PENDING — see `COMBAT_SYSTEM_DESIGN.md`)
- Replace RobberyManager with CombatManager (mutual wager, fight/flee/timeout)
- Add 20 combat item templates (8 weapons, 6 armor, 6 gear) to Item.js
- Add 3 new item types (WEAPON, ARMOR, GEAR) + combatBonus field
- Add combat stats (ATK/DEF/SPD) to all 10 characters in CharacterSystem.js
- In-game "Mark for Fight" button during poker hands
- Mutual marks → instant fight after game ends
- Outside-game challenges (Friends list, Recent Opponents, Leaderboard)
- Combat resolution (character stats + combat items + crew backup + random roll)
- 6 equipment slots: 3 combat (weapon/armor/gear) + 3 cosmetic (card back/table skin/avatar)
- Notoriety system (replaces karma), skull icons, combat bonus tiers
- Disconnect during fight = auto-lose
- Combat log, history, stats UI
- CombatScene replacing RobberyScene

### Art Assets (AI-generated — next priority)
- Character sprites (10 characters x portrait/seat/idle)
- Boss portraits (13 bosses)
- Combat item icons (20 items — weapons, armor, gear)
- Cosmetic item icons (24 items — existing)
- UI frames, backgrounds, card backs, game logo
- Fire/ice particle sprites, crew emblems, rarity glow variants

### Audio Assets
- Character sounds (win/lose/fold/all-in/taunt per character)
- Royal flush SFX (referenced but no file)

### Monetization
- Ad integration (AdMob/Unity Ads)
- Chip purchasing (IAP), premium membership
- Shop catalog + purchase flow

### Minor Code Gaps
- Shop — scaffold exists, needs catalog + purchase flow
- Tutorial overlay — scaffold exists, needs first-time content
- Emote panel — scaffold exists, needs emote selection
- Adventure area rename (old casino names to crime theme)

### Polish
- Card dealing arc animation (fly-from-deck)
- Screen shake, fire/ice particles, combat showdown, victory celebration
- Boss entrance animation, chip counting, XP popup, title earned

### Platform/Release
- Android build optimization
- Touch input testing
- Splash screen, app icon, Play Store listing
- Push notifications (Firebase)
