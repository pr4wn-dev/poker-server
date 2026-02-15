# GAME COMPLETION PLAN — Mafia Wars Poker

> Master checklist for completing the dark narrative poker RPG  
> Story: A child's family is kidnapped. A mafioso teaches them poker. They climb the criminal underworld to find the killer.  
> Status as of Feb 14, 2026

---

## 🎮 GAME OVERVIEW

**Genre:** Dark narrative poker RPG with mafia themes  
**Core Loop:** Win poker → climb criminal underworld → find the killer → rescue victims from drawer dungeon  
**Starting chips:** 20 million (gift from the mafioso mentor)  
**Endgame:** Defeat THE KILLER, search drawers for kidnapped family members

**Read GAME_STORY.md for full narrative details.**

---

## Phase 1: App Launch & Auth — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1.1 | App opens, MainMenuScene loads | DONE | SceneBootstrap creates scene programmatically |
| 1.2 | Socket.IO connection to server | DONE | Auto-connect, retry button after 10s, 15s timeout |
| 1.3 | Login panel (username + password) | DONE | Show/hide password toggle, saved credentials |
| 1.4 | Register panel | DONE | Auto-login after registration |
| 1.5 | Connection error handling | DONE | Exponential backoff, manual server URL settings |
| 1.6 | Server settings panel | DONE | Manual URL, network scanning, tunnel support |
| 1.7 | Update starting chips to 20M | **TODO** | UserRepository default chips = 20,000,000 |

---

## Phase 2: Opening Cinematic — NEW FEATURE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 2.1 | Database flag: has_seen_intro | **TODO** | Add column to users table |
| 2.2 | IntroScene.cs (Unity) | **TODO** | Static images + text, skippable |
| 2.3 | Cutscene images (AI-generated) | **ART** | Kid in bed, family abducted, storm, mafioso, poker den |
| 2.4 | Hook into login flow | **TODO** | Login → Intro (first time only) → Character Select |
| 2.5 | Skip button | **TODO** | Can skip after 3 seconds |

**Cutscene Sequence:**
1. Kid asleep, teddy bear, storm outside
2. Scream, family dragged away
3. Kid wakes, searches empty house
4. Kid wanders rainy streets alone
5. Mafioso appears in shadows
6. Underground poker den, mafioso teaches kid
7. Mafioso hands kid 20M chips: "Go find them."

---

## Phase 3: Character Select — DONE (needs narrative update)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 3.1 | Character catalog grid | DONE | 3-column scrollable grid |
| 3.2 | Owned vs locked display | DONE | Silhouette for locked characters |
| 3.3 | Detail panel | DONE | Portrait, name, rarity, description, sounds |
| 3.4 | Set active character | DONE | Server updates DB, client caches |
| 3.5 | Default character: The Kid | **TODO** | Rename "Shadow Hacker" → "The Kid" |
| 3.6 | Update scene title | **TODO** | "Character Roster" → "The Rescued" |
| 3.7 | Character descriptions | **TODO** | All characters are kidnap victims you rescue |
| 3.8 | Character portrait sprites | **ART** | Need story-appropriate art (victims, not cyber characters) |

---

## Phase 4: Main Menu — DONE (needs theme update)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 4.1 | Player info bar | DONE | Avatar, name, level, XP, chips |
| 4.2 | Adventure mode card | DONE | → AdventureScene |
| 4.3 | Multiplayer mode card | DONE | → LobbyScene |
| 4.4 | Bottom nav (Shop, Inventory, Friends, Settings) | DONE | |
| 4.5 | Daily rewards popup | DONE | 7-day streak system |
| 4.6 | Event banner | DONE | Shows active server events |
| 4.7 | Combat navigation | DONE | Bottom nav bar |
| 4.8 | Statistics navigation | DONE | Bottom nav bar |
| 4.9 | Leaderboard navigation | DONE | Bottom nav bar |
| 4.10 | Update subtitle text | **TODO** | "Find them. Win it all. Save your family." |
| 4.11 | Update Adventure button text | **TODO** | "Search for the Killer" |
| 4.12 | Background image | **ART** | Dark noir city street, rain, noir aesthetic |

---

## Phase 5: Theme System — PARTIAL (needs mafia noir reskin)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 5.1 | GameTheme.cs color palette | **TODO** | Change from neon cyber to dark mafia noir |
| 5.2 | Remove neon colors | **TODO** | No cyan/electric purple |
| 5.3 | Add noir palette | **TODO** | Muted grays, dark browns, shadowy blues, blood reds |
| 5.4 | Update button colors | **TODO** | Less vibrant, more subdued |
| 5.5 | Update panel backgrounds | **TODO** | Darker, grittier |
| 5.6 | Update rarity colors | DONE | Can keep current rarity glow system |
| 5.7 | Sprite support system | DONE | Already supports sprite assets with tinting |

**New Color Palette:**
- **Primary:** Dark steel blue (subdued, not neon)
- **Secondary:** Charcoal gray
- **Danger:** Blood red (darker, more ominous)
- **Success:** Muted green
- **Accent:** Gold (for wealth/chips)
- **Background:** Near-black with blue undertones
- **Text:** Off-white, high contrast

---

## Phase 6: Lobby & Multiplayer — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 6.1 | Table list (scrollable, auto-refresh) | DONE | 15s auto-refresh |
| 6.2 | Table row info | DONE | Name, players, blinds, buy-in |
| 6.3 | Create table form | DONE | Full options including item ante |
| 6.4 | Join table | DONE | Password dialog for private tables |
| 6.5 | Search/filter tables | DONE | |
| 6.6 | Back button → Main Menu | DONE | |

---

## Phase 7: At the Table (Core Poker) — MOSTLY DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 7.1 | Seat selection | DONE | |
| 7.2 | Ready up / countdown | DONE | Host starts, players ready, countdown to deal |
| 7.3 | Hole cards display | DONE | Full 52-card sprite deck |
| 7.4 | Betting rounds (preflop→river) | DONE | Full Texas Hold'em |
| 7.5 | Action buttons | DONE | Fold/check/call/raise/all-in + quick bet buttons |
| 7.6 | Bet slider | DONE | Min/max range with text input |
| 7.7 | Pot display | DONE | Center of table |
| 7.8 | Community cards | DONE | 5-card horizontal layout |
| 7.9 | Showdown / winner announcement | DONE | Hand name, amount, animation |
| 7.10 | Hand history panel | DONE | Per-hand action log |
| 7.11 | Chat panel | DONE | Messages + input + emotes |
| 7.12 | Player profile popup | DONE | Stats, title, crew, heat |
| 7.13 | Bot management | DONE | Invite, approve, remove |
| 7.14 | Rebuy / add chips | DONE | Slider for amount |
| 7.15 | Sit out / sit back | DONE | |
| 7.16 | Spectator mode | DONE | Odds, side bets |
| 7.17 | Leave table | DONE | |
| 7.18 | Reconnection mid-hand | DONE | Auto-restore seat |
| 7.19 | Dealing animation | PARTIAL | Cards appear in place, no arc animation yet |
| 7.20 | Chip-to-pot animation | PARTIAL | Basic animation works, needs polish |
| 7.21 | Table felt texture | **ART** | Needs dark, worn texture (not bright green) |
| 7.22 | Chip sprites | **ART** | Dirty poker chips, not clean casino style |
| 7.23 | Card back image | **ART** | Worn, noir-style card back |

---

## Phase 8: Adventure Mode — DONE (needs full narrative reskin)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 8.1 | World map with 8 areas | DONE | Area progression with level gates |
| 8.2 | Boss list per area | DONE | 13 total bosses |
| 8.3 | Boss battle (poker vs AI) | DONE | Heads-up poker |
| 8.4 | Boss taunts during play | DONE | Server emits taunts |
| 8.5 | Rewards (items, XP, character drops) | DONE | |
| 8.6 | Update area names | **TODO** | See new 8-area structure below |
| 8.7 | Update boss identities | **TODO** | Criminal figures, not cyber bosses |
| 8.8 | Update boss dialogue | **TODO** | Story-driven, not just poker trash talk |
| 8.9 | Area background art | **ART** | Dark streets, poker dens, docks, mafia HQ, wastelands, estate |
| 8.10 | Boss portrait art | **ART** | Mafia figures, criminals, THE KILLER |

### New 8-Area Structure (WorldMap.js)

**Area 1: The Empty Streets** (Tutorial)  
- Boss: The Stranger (your mafioso teacher, practice match)

**Area 2: The Back Alley** (Beginner)  
- Boss: Scarface Eddie (small-time thug)  
- Boss: Louie the Lip (fast-talking hustler)

**Area 3: Underground Poker Circuit** (Intermediate)  
- Boss: The Dealer (runs underground games)  
- Boss: Rosie "The Viper" (cold, ruthless)

**Area 4: The Docks** (Advanced)  
- Boss: Captain Dimitri (smuggler)  
- Boss: The Butcher (enforcer)

**Area 5: Mafia Headquarters** (Expert)  
- Boss: The Consigliere (Don's advisor)  
- Boss: Don Vittorio (mafia boss, your ally)

**Area 6: The Wastelands** (Master)  
- Boss: Mad Dog Marcus (psychotic killer)  
- Boss: The Chemist (poison dealer)

**Area 7: The Killer's Estate** (Legendary)  
- Boss: The Collector (killer's right hand)  
- Boss: The Twin Shadows (twin assassins)

**Area 8: The Drawer Dungeon** (Final)  
- Boss: THE KILLER (final boss)  
- Special mechanic: Drawer selection after victory

---

## Phase 9: Drawer Dungeon — NEW FEATURE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 9.1 | DrawerDungeonScene.cs (Unity) | **TODO** | Grid of clickable drawer buttons |
| 9.2 | Server logic: roll character drop | **TODO** | Which drawer has the character |
| 9.3 | Drawer open animation | **TODO** | Drawer slides open, reveal contents |
| 9.4 | Empty drawer visual | **ART** | Empty drawer image |
| 9.5 | Character reveal visual | **ART** | Character portrait appears from drawer |
| 9.6 | Hook to final boss victory | **TODO** | Defeat THE KILLER → trigger drawer scene |
| 9.7 | First-win guarantee | **TODO** | First time: 1 drawer glows (guaranteed character) |
| 9.8 | Repeat-win RNG | **TODO** | Random chance for character drops |
| 9.9 | Family member legendary drops | **TODO** | Mother, Father, Sibling(s) - ultra rare |
| 9.10 | Emotional text on family find | **TODO** | Special dialogue when you find family |

**UI Layout:**
- 10x10 grid of drawer icons (100 drawers visible)
- Click a drawer → animation → reveal
- "Search the drawers. Maybe they're here..."
- Counter: "Drawers searched: X / 100"

---

## Phase 10: Inventory & Equipment — DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 10.1 | Item grid (scrollable) | DONE | |
| 10.2 | Equipment slots (6 around portrait) | DONE | 3 combat, 3 cosmetic |
| 10.3 | Equip/unequip with server calls | DONE | |
| 10.4 | Item detail panel | DONE | |
| 10.5 | Equipped indicator on grid | DONE | |
| 10.6 | Item icon sprites | **ART** | Update combat items to mafia theme (guns, knives, brass knuckles) |

---

## Phase 11: Character System — DONE (needs narrative update)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 11.1 | Character catalog UI | DONE | |
| 11.2 | Owned/locked display | DONE | |
| 11.3 | Switch active character | DONE | |
| 11.4 | Character sound system | DONE | Code + server wired |
| 11.5 | Update default character | **TODO** | "Shadow Hacker" → "The Kid" |
| 11.6 | Update character descriptions | **TODO** | All are kidnap victims/rescued souls |
| 11.7 | Add family member characters | **TODO** | Mother, Father, Sibling(s) - legendary rarity |
| 11.8 | Character portraits (10 total) | **ART** | Kidnap victims, not cyber characters |
| 11.9 | Character voice audio clips | **ART** | Appropriate to mafia/noir theme |

**Character Roster (needs full redesign):**
- The Kid (default, common)
- 7 rescued victims (uncommon to epic)
- Mother (legendary)
- Father (legendary)
- [Sibling name] (legendary or epic)

---

## Phase 12: Combat System (Mafia Enforcers) — DONE (needs narrative context)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 12.1 | CombatManager.js (server) | DONE | Mark, challenge, resolve, rewards |
| 12.2 | Character combat stats (ATK/DEF/SPD) | DONE | Rarity-scaled stats |
| 12.3 | Combat item templates (20 items) | DONE | Weapons, armor, gear |
| 12.4 | Combat events (socket wiring) | DONE | All events wired |
| 12.5 | CombatScene.cs (client) | DONE | Stats, history, challenges |
| 12.6 | Mark UI in TableScene | DONE | "MARK FOR FIGHT" button |
| 12.7 | Heat system | DONE | Combat reputation system |
| 12.8 | Combat database tables | DONE | combat_log, recent_opponents, heat |
| 12.9 | Outside-game challenges | DONE | From friends/leaderboard |
| 12.10 | Rename "Notoriety" → "Heat" | **DONE** | ✅ All code + docs updated |
| 12.11 | Update combat UI text | **TODO** | Frame as mafia enforcers, not generic PvP |
| 12.12 | Mafia enforcer NPC logic | **TODO** | Auto-challenge for unpaid loans |

---

## Phase 13: Mafia Loan System — NEW FEATURE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 13.1 | Database table: mafia_loans | **TODO** | user_id, amount, interest, due_date, paid |
| 13.2 | MafiaLoanManager.js (server) | **TODO** | Offer, track, enforce loans |
| 13.3 | Loan offer popup (client) | **TODO** | Trigger when chips < threshold (e.g., 1000) |
| 13.4 | Loan terms display | **TODO** | Amount, interest rate, due date |
| 13.5 | Accept/decline loan | **TODO** | Socket event: request_loan |
| 13.6 | Loan repayment UI | **TODO** | Button to pay back loan early |
| 13.7 | Overdue loan check (cron) | **TODO** | Server checks every hour for overdue loans |
| 13.8 | Auto-create enforcer challenge | **TODO** | Overdue → mafia enforcer challenges you |
| 13.9 | Combat integration | **TODO** | Use existing CombatManager for enforcer fights |
| 13.10 | Win = debt forgiven | **TODO** | Beat enforcer → loan cleared |
| 13.11 | Lose = debt doubles + items lost | **TODO** | Lose → debt ×2, lose equipped items, +Heat |
| 13.12 | Heat increase on unpaid debt | **TODO** | More enforcers come after you if Heat is high |

**Loan Mechanics:**
- Trigger: Player has < 1000 chips
- Popup: "Out of chips? The Family can help... for a price."
- Offer: Borrow 1M, pay back 1.2M (20% interest)
- Due: 7 real-world days
- Overdue: Enforcer NPC challenges you to combat
- Multiple loans allowed (but risky)

---

## Phase 14: Statistics — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 14.1-14.8 | All stats tabs | DONE | Overview, skill, luck, pockets, hands, trends, rare, titles |

---

## Phase 15: Crew System — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 15.1-15.6 | Full crew system | DONE | Create, join, chat, leaderboard, perks |

---

## Phase 16: Shop — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 16.1-16.3 | Shop catalog (3 tabs) | DONE | Chips, Items, Cosmetics |

---

## Phase 17: Settings — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 17.1-17.5 | All settings | DONE | Audio, graphics, gameplay, reset, logout |

---

## Phase 18: Tournaments — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 18.1-18.5 | Full tournament system | DONE | List, register, bracket, play, elimination |

---

## Phase 19: Social / Friends — ALL DONE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 19.1-19.6 | Full social system | DONE | Friends, requests, search, invite, leaderboard |

---

## Phase 20: Art & Audio Assets

### Audio Assets Needed

| # | Asset | Status | Notes |
|---|-------|--------|-------|
| 20.1 | Character voice lines (10 chars × 7 categories) | **MISSING** | ~70 clips, noir/mafia theme |
| 20.2 | Royal flush SFX | **MISSING** | Referenced but no file |
| 20.3 | Noir background music | **TODO** | Jazzy noir for early areas, tense orchestral for late areas |
| 20.4 | Drawer open SFX | **TODO** | Creaking metal drawer sound |
| 20.5 | Character rescue SFX | **TODO** | Emotional swell when finding family |
| 20.6 | All other audio | DONE | Music, card SFX, chip SFX, UI SFX present |

### Art Assets Needed (AI-Generated)

| # | Asset | Priority | Notes |
|---|-------|----------|-------|
| 20.7 | Opening cinematic images (7 scenes) | **HIGH** | Kid, family, storm, mafioso, poker den |
| 20.8 | Character portraits (10 characters) | **HIGH** | Kidnap victims + family members, noir style |
| 20.9 | Boss portraits (13 bosses) | **HIGH** | Criminal figures, mafia members, THE KILLER |
| 20.10 | Area backgrounds (8 areas) | **HIGH** | Streets, alleys, docks, HQ, wastelands, estate, dungeon |
| 20.11 | Drawer dungeon UI | **HIGH** | Drawer grid, empty drawer, character reveal |
| 20.12 | Table felt texture | MEDIUM | Dark, worn felt (not bright casino green) |
| 20.13 | Chip sprites | MEDIUM | Dirty poker chips with noir aesthetic |
| 20.14 | Card back | MEDIUM | Worn, vintage card back design |
| 20.15 | Combat item icons (20 weapons/armor/gear) | MEDIUM | Guns, knives, brass knuckles, armor, gear |
| 20.16 | Cosmetic item icons (~25 items) | LOW | Mafia-themed cosmetics |
| 20.17 | Main menu background | HIGH | Dark city street, rain, noir lighting |
| 20.18 | App logo / splash screen | LOW | "Mafia Wars Poker" logo |

> **AI Art Prompts:** Generate all prompts with noir/mafia aesthetic — dark, gritty, rain-soaked streets, shadowy figures, 1940s-50s crime drama style

---

## Work Order (Recommended Sequence)

### Round 1: Documentation & Planning ✅ IN PROGRESS
1. ✅ Create GAME_STORY.md (full narrative document)
2. ✅ Update GAME_COMPLETION_PLAN.md (this file)
3. 🔄 Update PROJECT_STATUS.md (next)
4. 🔄 Update CHANGELOG.md (document the pivot)

### Round 2: Core Narrative Changes
5. Update GameTheme.cs (cyber → noir color palette)
6. Update CharacterSystem.js (rename characters, update descriptions)
7. Update WorldMap.js (rename 8 areas to match story)
8. Update Boss.js (rename 13 bosses, update dialogue/taunts)
9. Update all UI text (MainMenuScene, AdventureScene, CombatScene)
10. Update database: starting chips = 20M

### Round 3: New Features (Opening Cinematic)
11. Add has_seen_intro column to database
12. Build IntroScene.cs (Unity) — static images + text
13. Generate opening cinematic images (AI art)
14. Hook intro into login flow
15. Test full flow: Login → Intro → Character Select → Main Menu

### Round 4: New Features (Drawer Dungeon)
16. Build DrawerDungeonScene.cs (Unity) — grid of drawers
17. Server logic: roll character drops for drawers
18. Drawer open animation + reveal
19. Hook to final boss victory
20. Add family member characters (legendary drops)
21. Generate drawer dungeon art assets

### Round 5: New Features (Mafia Loan System)
22. Database table: mafia_loans
23. Build MafiaLoanManager.js (server)
24. Loan offer popup UI (client)
25. Loan repayment UI
26. Cron job: check overdue loans
27. Auto-create enforcer combat challenge on overdue
28. Test full cycle: borrow → don't pay → enforcer fight → consequences

### Round 6: Art Assets (Priority Order)
29. Generate opening cinematic images (7 scenes)
30. Generate main menu background (dark city street)
31. Generate area backgrounds (8 areas)
32. Generate boss portraits (13 bosses)
33. Generate character portraits (10 characters)
34. Generate drawer dungeon UI assets
35. Generate table felt, chips, card back
36. Generate combat item icons

### Round 7: Audio Assets
37. Generate character voice lines (noir/mafia theme)
38. Add royal flush SFX
39. Add drawer open/character rescue SFX
40. Update background music (jazzy noir, tense orchestral)

### Round 8: Polish & Testing
41. Full playthrough: Login → Intro → Adventure → Defeat THE KILLER → Drawer search
42. Test loan system: Go broke → take loan → don't pay → enforcer fight
43. Test all 8 areas and 13 bosses
44. Test character unlocks and switching
45. Test multiplayer (lobby, tables, tournaments)
46. Test combat system (mark during game, outside challenges)
47. Edge cases: disconnect during intro, drawer dungeon bugs, loan edge cases

---

## Status Summary

| Category | Done | Partial | Missing/TODO | Art Needed |
|----------|------|---------|--------------|------------|
| Auth & Connection | 6/7 | 0 | 1 (20M chips) | 0 |
| Opening Cinematic | 0/5 | 0 | 5 | 1 (images) |
| Character Select | 5/8 | 0 | 3 (narrative) | 1 (portraits) |
| Main Menu | 9/12 | 0 | 3 (text updates) | 1 (background) |
| Theme System | 1/8 | 0 | 7 (color reskin) | 0 |
| Lobby & Multiplayer | 6/6 | 0 | 0 | 0 |
| Core Poker | 18/23 | 2 | 0 | 3 |
| Adventure Mode | 5/10 | 0 | 5 (narrative) | 2 (art) |
| Drawer Dungeon | 0/10 | 0 | 10 (NEW) | 2 (art) |
| Inventory | 5/6 | 0 | 0 | 1 (icons) |
| Characters | 4/9 | 0 | 5 (narrative) | 2 (art/audio) |
| Combat System | 10/12 | 0 | 2 (rename Heat) | 0 |
| Mafia Loan System | 0/12 | 0 | 12 (NEW) | 0 |
| Statistics | 8/8 | 0 | 0 | 0 |
| Crews | 6/6 | 0 | 0 | 0 |
| Shop | 3/3 | 0 | 0 | 0 |
| Settings | 5/5 | 0 | 0 | 0 |
| Tournaments | 5/5 | 0 | 0 | 0 |
| Social | 6/6 | 0 | 0 | 0 |
| Art & Audio | 1/18 | 0 | 5 (audio) | 12 (art) |
| **TOTAL** | **107/171** | **2** | **62** | **25** |

**Progress:**  
- **Code:** ~63% complete (107/171 features done, 62 todo)
- **Art:** ~4% complete (1/25 art assets)
- **Core systems:** 83% functional (from previous build)
- **New features:** 3 major systems to add (Intro, Drawer Dungeon, Loans)
- **Narrative reskin:** ~40 items (text, colors, names)

**The pivot is feasible.** Most code stays intact. Focus: narrative reskin + 3 new features + art generation.

---

## Notes

- **Starting chips = 20M** fits story (gift from mafioso)
- **Drawer dungeon** is the emotional hook (searching for family)
- **Loan system** adds real stakes (mafia enforcers come after you)
- **Combat = mafia world violence** (not random PvP, but thematic)
- **Character unlocks = rescues** (saving victims, not random drops)

**Read GAME_STORY.md for full narrative.**
