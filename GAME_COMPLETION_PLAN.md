# GAME COMPLETION PLAN — Scene-by-Scene Walkthrough

> Master checklist for completing every player experience from app launch to endgame.  
> Status as of Feb 13, 2026. Work through top-to-bottom at home.

---

## How to Use This Document

Go through each phase in order. For each item:
- **DONE** = fully working server + client, skip unless testing
- **PARTIAL** = works but has gaps, needs finishing
- **STUB** = code shell exists but doesn't do anything real
- **MISSING** = not built yet
- **ART** = needs AI-generated image/audio asset

---

## Phase 1: App Launch & Auth — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1.1 | App opens, MainMenuScene loads | DONE | SceneBootstrap creates scene programmatically |
| 1.2 | Socket.IO connection to server | DONE | Auto-connect, retry button after 10s, 15s timeout |
| 1.3 | Login panel (username + password) | DONE | Show/hide password toggle, saved credentials |
| 1.4 | Register panel (username, password, confirm, email) | DONE | Auto-login after registration |
| 1.5 | Connection error handling | DONE | Exponential backoff, manual server URL settings |
| 1.6 | Server settings panel | DONE | Manual URL, network scanning, tunnel support |

---

## Phase 2: Character Select — ALL DONE (needs art)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 2.1 | New player detection → redirect to CharacterSelect | DONE | Checks ActiveCharacterId |
| 2.2 | Character catalog grid from server | DONE | 3-column scrollable grid |
| 2.3 | Owned vs locked display (silhouette for locked) | DONE | |
| 2.4 | Detail panel (portrait, name, rarity, description, sounds) | DONE | |
| 2.5 | Set active character button | DONE | Server updates DB, client caches |
| 2.6 | Default character: Shadow Hacker | DONE | Everyone starts with this |
| 2.7 | Character portrait sprites | **ART** | No images yet — colored rectangles as placeholder |

---

## Phase 3: Main Menu — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 3.1 | Player info bar (avatar, name, level, XP, chips) | DONE | |
| 3.2 | Adventure mode card | DONE | → AdventureScene |
| 3.3 | Multiplayer mode card | DONE | → LobbyScene |
| 3.4 | Bottom nav (Shop, Inventory, Friends, Settings) | DONE | |
| 3.5 | Daily rewards popup | DONE | 7-day streak system |
| 3.6 | Event banner | DONE | Shows active server events |
| 3.7 | Friends button | DONE | Navigates to FriendsScene |
| 3.8 | Robbery navigation | DONE | Bottom nav bar, top row |
| 3.9 | Statistics navigation | DONE | Bottom nav bar, top row |
| 3.10 | Leaderboard navigation | DONE | Bottom nav bar, top row |

---

## Phase 4: Lobby & Table Creation — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 4.1 | Table list (scrollable, auto-refresh) | DONE | 15s auto-refresh |
| 4.2 | Table row info (name, players, blinds, buy-in) | DONE | |
| 4.3 | Create table form (full options) | DONE | Name, players, blinds, buy-in, timer, privacy, bots, item ante |
| 4.4 | Join table (click row) | DONE | Password dialog for private tables |
| 4.5 | Search/filter tables | DONE | |
| 4.6 | Back button → Main Menu | DONE | |

---

## Phase 5: At the Table (Core Poker) — MOSTLY DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 5.1 | Seat selection | DONE | |
| 5.2 | Ready up / countdown | DONE | Host starts, players ready, countdown to deal |
| 5.3 | Hole cards display | DONE | Full 52-card sprite deck |
| 5.4 | Betting rounds (preflop→river) | DONE | Full Texas Hold'em |
| 5.5 | Action buttons (fold/check/call/raise/all-in) | DONE | Quick bet buttons too |
| 5.6 | Bet slider | DONE | Min/max range with text input |
| 5.7 | Pot display | DONE | Center of table |
| 5.8 | Community cards | DONE | 5-card horizontal layout |
| 5.9 | Showdown / winner announcement | DONE | Hand name, amount, animation |
| 5.10 | Hand history panel | DONE | Per-hand action log |
| 5.11 | Chat panel | DONE | Messages + input + emotes |
| 5.12 | Player profile popup (tap seat) | DONE | Stats, title, crew, karma |
| 5.13 | Bot management | DONE | Invite, approve, remove |
| 5.14 | Rebuy / add chips | DONE | Slider for amount |
| 5.15 | Sit out / sit back | DONE | |
| 5.16 | Spectator mode | DONE | Odds, side bets |
| 5.17 | Leave table | DONE | |
| 5.18 | Reconnection mid-hand | DONE | Auto-restore seat |
| 5.19 | Dealing animation (cards fly from deck) | **PARTIAL** | Cards appear in place, no arc animation |
| 5.20 | Chip-to-pot animation | **PARTIAL** | Gold circles fly seat→pot and pot→winner — needs chip sprite art (see 16.8) |
| 5.21 | Table felt texture | **ART** | Green rectangle — needs textured felt image |
| 5.22 | Chip sprites | **ART** | Colored circles — needs chip images |
| 5.23 | Default card back image | **ART** | No card_back.png in Cards folder |
| 5.24 | Invite friends from table | DONE | |

---

## Phase 6: Adventure Mode — DONE (needs art)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 6.1 | World map with areas | DONE | 8 areas with level gates |
| 6.2 | Area boss list | DONE | Bosses per area with difficulty/rewards |
| 6.3 | Boss battle (poker vs AI) | DONE | Heads-up with BossAI |
| 6.4 | Boss taunts | DONE | Server emits taunts during play |
| 6.5 | Rewards (items, XP, character drops) | DONE | |
| 6.6 | Boss portrait art | **ART** | No boss images — text-only |
| 6.7 | Area background art | **ART** | No area backgrounds |

---

## Phase 7: Inventory & Equipment — DONE (needs art)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 7.1 | Item grid (scrollable) | DONE | |
| 7.2 | Equipment slots (6 around portrait) | DONE | |
| 7.3 | Equip/unequip with server calls | DONE | |
| 7.4 | Item detail panel | DONE | |
| 7.5 | Equipped indicator on grid | DONE | |
| 7.6 | Item icon sprites | **ART** | ~25 placeholders, many items need icons |

---

## Phase 8: Character System — DONE (needs art + audio)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 8.1 | Character catalog UI | DONE | |
| 8.2 | Owned/locked display | DONE | |
| 8.3 | Switch active character | DONE | |
| 8.4 | Character sound system | DONE | Code + server wired |
| 8.5 | Character portrait sprites (10 chars) | **ART** | No images — need SNES-style pixel art |
| 8.6 | Character voice audio clips | **ART** | No audio files — system expects clip names |

---

## Phase 9: Statistics — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 9.1 | Overview stats tab | DONE | |
| 9.2 | Skill stats tab | DONE | |
| 9.3 | Luck stats tab | DONE | |
| 9.4 | Pocket breakdown tab | DONE | |
| 9.5 | Hand type comparison tab | DONE | |
| 9.6 | Trends tab | DONE | |
| 9.7 | Rare hands tab | DONE | |
| 9.8 | Titles tab | DONE | |

---

## Phase 10: Crew System — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 10.1 | Create crew | DONE | |
| 10.2 | Join crew (invites) | DONE | |
| 10.3 | Crew info + members | DONE | |
| 10.4 | Crew chat | DONE | |
| 10.5 | Crew leaderboard | DONE | |
| 10.6 | Crew perks (level unlocks) | DONE | |

---

## Phase 11: Combat System (Post-Game PvP) — REDESIGN PENDING

> Replaces old Robbery & Karma system. See `COMBAT_SYSTEM_DESIGN.md` for full spec.

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 11.1 | CombatManager.js (server) | **PENDING** | Mark, challenge, mutual detection, auto-match items, resolve, rewards |
| 11.2 | Character combat stats (ATK/DEF/SPD) | **PENDING** | Add to CharacterSystem.js, rarity-scaled |
| 11.3 | Item combat bonuses | **PENDING** | Add ATK/DEF/SPD bonuses to item templates |
| 11.4 | Combat events (socket wiring) | **PENDING** | mark_player, challenge_player, mutual_showdown, combat_result |
| 11.5 | CombatScene.cs (client) | **PENDING** | Replace RobberyScene — stats, history, recent opponents, challenge-from-friends/leaderboard |
| 11.6 | Mark UI in TableScene | **PENDING** | "MARK FOR FIGHT" in seat popup, crosshair indicator, post-game delivery queue, mutual showdown |
| 11.7 | Notoriety system (replace karma) | **PENDING** | Lifetime combat rep, cosmetic titles, seat icons |
| 11.8 | Strip karma from all code | **PENDING** | Remove from Table, seats, profiles, stats, 5+ scenes |
| 11.9 | Combat database tables | **PENDING** | combat_log, recent_opponents, notoriety columns, drop karma tables |
| 11.10 | Outside-game challenges | **PENDING** | Challenge from Friends, Recent Opponents, and Leaderboard scenes |
| 11.11 | Navigation to CombatScene | DONE | Button on main menu bottom nav (reuses Robbery slot) |

**Old system status:** RobberyManager.js (server) and RobberyScene.cs (client) exist and work but will be replaced. Karma system works but will be stripped.

---

## Phase 12: Shop — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 12.1 | Shop catalog (3 tabs) | DONE | Chips, Items, Cosmetics |
| 12.2 | Buy items | DONE | |
| 12.3 | Currency display (chips + gems) | DONE | |

---

## Phase 13: Settings — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 13.1 | Audio volume sliders | DONE | Master, Music, SFX, UI |
| 13.2 | Graphics settings | DONE | |
| 13.3 | Gameplay settings | DONE | |
| 13.4 | Reset progress | DONE | |
| 13.5 | Logout | DONE | |

---

## Phase 14: Tournaments — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 14.1 | Tournament list | DONE | Server handler + client method |
| 14.2 | Register/unregister | DONE | |
| 14.3 | Tournament bracket visualization | DONE | TournamentBracket component |
| 14.4 | Tournament play scene | DONE | TournamentScene has lobby + active mode; events wired through GameService/SocketManager |
| 14.5 | Tournament state/elimination events | DONE | Server handles full bracket lifecycle |

---

## Phase 15: Social / Friends — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 15.1 | Friends list (server) | DONE | |
| 15.2 | Friend requests (server) | DONE | |
| 15.3 | Search users (server) | DONE | |
| 15.4 | Invite to table (server + client) | DONE | |
| 15.5 | Friends scene (client) | DONE | FriendsScene.cs — 3 tabs (Friends, Requests, Search), wired to GameService |
| 15.6 | Leaderboard scene | DONE | LeaderboardScene with 5 categories |

---

## Phase 16: Art & Audio Assets

### Audio Assets Needed

| # | Asset | Status | Notes |
|---|-------|--------|-------|
| 16.1 | Character voice lines (10 chars x 7 categories) | **MISSING** | ~70 clips needed |
| 16.2 | Royal flush SFX | **MISSING** | Referenced but no file |
| 16.3 | All other audio | DONE | Music, card SFX, chip SFX, UI SFX all present |

### Art Assets Needed (AI-generated)

| # | Asset | Priority | Notes |
|---|-------|----------|-------|
| 16.4 | Character portraits (10 characters, seat + portrait + idle) | HIGH | SNES pixel art style |
| 16.5 | Boss portraits (13 bosses) | HIGH | For adventure battles |
| 16.6 | Area backgrounds (8 areas) | MEDIUM | For adventure map |
| 16.7 | Table felt texture | MEDIUM | Replace green rectangle |
| 16.8 | Chip sprites (denominations) | MEDIUM | Replace colored circles |
| 16.9 | Default card back | MEDIUM | For opponent hand display |
| 16.10 | Item icons (full set) | LOW | ~25 exist, need more for all templates |
| 16.11 | App logo / splash screen | LOW | For launch |
| 16.12 | Main menu background | LOW | Currently solid color |

> Full AI prompts for all art assets are in `poker-client-unity/Assets/Art/IMAGE_GENERATION_PROMPTS.md`

---

## Work Order (Recommended Sequence)

### Round 1: Fix Remaining Code Gaps
1. ~~Add navigation buttons on main menu for Statistics, Leaderboard, Robbery~~ ✅ DONE
2. ~~Build FriendsScene.cs wired to GameService~~ ✅ DONE
3. ~~Build TournamentScene.cs (reuse table with tournament context)~~ ✅ DONE
4. Test the complete multiplayer flow end-to-end

### Round 2: Combat System (Replaces Robbery/Karma)
5. Build CombatManager.js — mark, challenge, mutual detection, match items, resolve, rewards
6. Add combat stats to characters + combat bonuses to items
7. Build CombatScene.cs — replace RobberyScene (stats, history, recent opponents, challenge friends/leaderboard)
8. Add mark UI to TableScene (seat popup "MARK FOR FIGHT", crosshair, post-game delivery, mutual showdown)
9. Wire combat socket events (client + server) — mark_player, challenge_player, mutual_showdown, combat_result
10. Build Notoriety system (replace karma)
11. Strip karma from all server + client code
12. Add combat_log + recent_opponents + notoriety DB tables, drop karma tables
13. Add CHALLENGE buttons to FriendsScene + LeaderboardScene for outside-game fights

### Round 3: Polish Core Experience
14. ~~Per-scene music, global button click SFX, success/error SFX~~ ✅ DONE
15. ~~Image loading infrastructure (backgrounds, logo, mode cards)~~ ✅ DONE
16. ~~Gear icon fix, character card click SFX, mode card click SFX~~ ✅ DONE
17. ~~FriendsScene.unity file + build settings registration~~ ✅ DONE
18. Add dealing animation (card arc from deck to seats)
19. Improve chip-to-pot animation (needs chip sprite art)
20. Test and fix side pots, all-in scenarios, edge cases
21. Test reconnection mid-hand thoroughly

### Round 4: Art Assets
22. Generate all character portraits (10 chars x 3 variants)
23. Generate boss portraits (13)
24. Generate table felt, chip sprites, card back
25. Generate area backgrounds (8)
26. Generate remaining item icons

### Round 5: Audio Assets
27. Generate character voice lines
28. Add royal flush SFX

### Round 6: Final Testing
29. Full playthrough: launch → login → character select → lobby → create table → play 10 hands → leave
30. Full adventure run: map → boss → win → rewards → character drop
31. Inventory: equip items, switch characters
32. Social: add friend, invite to table, crew create/chat
33. Combat: mark player during game → mutual showdown test → one-way challenge test → flee test → verify item/chip transfer
34. Outside-game combat: challenge from friends list, recent opponents, leaderboard
35. Edge cases: disconnect/reconnect, empty table, all bots, maximum players, disconnect during combat

---

## Status Summary

| Category | Done | Partial | Missing | Art Needed |
|----------|------|---------|---------|------------|
| Auth & Connection | 6/6 | 0 | 0 | 0 |
| Character Select | 6/7 | 0 | 0 | 1 |
| Main Menu | 10/10 | 0 | 0 | 0 |
| Lobby | 6/6 | 0 | 0 | 0 |
| Core Poker | 19/24 | 2 | 0 | 3 |
| Adventure | 5/7 | 0 | 0 | 2 |
| Inventory | 5/6 | 0 | 0 | 1 |
| Characters | 4/6 | 0 | 0 | 2 |
| Statistics | 8/8 | 0 | 0 | 0 |
| Crews | 6/6 | 0 | 0 | 0 |
| Combat (was Robbery) | 1/11 | 0 | 10 | 0 |
| Shop | 3/3 | 0 | 0 | 0 |
| Settings | 5/5 | 0 | 0 | 0 |
| Tournaments | 5/5 | 0 | 0 | 0 |
| Social | 6/6 | 0 | 0 | 0 |
| Art & Audio | 1/12 | 0 | 2 | 9 |
| **TOTAL** | **96/128** | **2** | **12** | **18** |

**The game is ~75% code-complete.** All 16 scenes are built and functional. Core poker, adventure, stats, crews, shop, settings, inventory, friends, leaderboards, and tournaments are all wired end-to-end. Per-scene music, button click SFX, and success/error audio are wired globally. The remaining code work is: 10 combat system items (mark-during-game, mutual showdowns, outside-game challenges), 2 animation polish items, 2 missing audio files, and 9 art asset batches.
