# Changelog - Issues & Solutions

This file tracks all issues encountered and their solutions. **Search this file first** before debugging.

---

## Unity UI Feature Build (Feb 12, 2026)

### Player Seat Enhancements
- **Fire/Cold Visuals**: PlayerSeatView shows color-coded glow (cyan warm → magenta hot → purple on-fire, dull red cold/frozen) with pulse/wobble animations
- **Title Display**: Active title shown below player name at table (e.g., "🏅 Bluff Master")
- **Tap-to-Profile**: Tapping any occupied seat opens PlayerProfilePopup with stats, title, crew, fire status

### Statistics Scene Overhaul
- 7-tab system: Overview, Skill, Luck, Pockets, Hand Types, Trends, Rare Hands, Titles
- **Titles Tab**: View earned titles, set active title with server callback

### New Scenes Created
- **CrewScene**: Full crew management — create crew (name/tag/desc), member list, invite players, crew chat, crew leaderboard
- **RobberyScene**: Target selection, 5 tool types (lockpick, RFID cloner, hotwire kit, burner phone, fake ID), result popup, robbery history log
- **HandReplayScene**: Saved hands browser, Hand of the Day showcase, replay viewer with player cards + action timeline

### Main Menu
- **Event Banner**: Shows active server events with name, description, and multiplier badges (XP/Chips/Drops), loads on menu show

### Table Scene
- **SpectatorPanel**: Auto-shows for spectators — live win probability bars (refreshing every 5s), side bet placement, bet feed
- **Profile popup** wired through seat taps

### Networking
- Added `GetHandReplay(tableId, handNumber)` to GameService
- All models in NetworkModels.cs verified and complete

---

## Feature Completion Pass (Feb 12, 2026)

### Advanced Hand Detection in Table.js
All 6 TODO placeholders in `_collectAndSendStatsData()` are now real detection algorithms:

1. **C-bet Detection** — Detects when preflop raiser bets the flop. Tracks success (won pot or everyone folded).
2. **Steal Attempt Detection** — Detects late position (button/cutoff/SB) raises when no one raised before. Tracks success.
3. **Bluff Detection** — Detects aggressive action with weak hands (pair or worse). Tracks bluff success + opponent bluff detection + correct bluff calls.
4. **Draw Detection** — Checks for flush draws (4 same suit on flop) and straight draws (4-card sequences, including wheel). Tracks draw completion.
5. **Behind-on-Flop / Suckout Detection** — Evaluates each player's hand at the flop, compares vs opponents. Tracks if player was behind and won from behind.

Fire tracker now receives real draw/suckout data instead of `false` placeholders.

### SpectatorOdds.js — Monte Carlo Win Probability
- New module (`src/game/SpectatorOdds.js`)
- 500 Monte Carlo simulations per request (fast enough for real-time)
- Calculates win % for each active player based on hole cards + community cards
- Handles all game phases (preflop through river)
- Socket endpoints: `get_spectator_odds`, `spectator_bet`, `spectator_reaction`

### Spectator Bet Resolution
- When a hand completes, all pending spectator bets are automatically resolved
- Winners get 2x payout, losers get nothing
- Chips credited directly to spectator's account

### Saved Hands / Hand Replay Endpoints
- `save_hand` — Save a hand from history as a bookmark
- `get_saved_hands` — Retrieve saved hands with full hand_history join
- `get_hand_of_the_day` — Biggest pot winner in last 24 hours

### Crew Stats Integration
- After each hand, `CrewManager.updateCrewStats()` is called for every non-bot player
- Tracks hands played, hands won, chips won per crew

### Collusion Detector Auto-Trigger
- Every 50 hands, all human player pairs at the table are analyzed automatically
- Runs asynchronously, doesn't block game flow

### Player Session Tracking
- Session created when player joins a table (`player_sessions` table)
- Session ended when player leaves — records end time, chips, profit/loss
- Updates `sessions_played` and `total_play_time_seconds` in `player_stats`

---

## Massive Feature Build (Feb 12, 2026)

### New Server Modules Built
All new systems implemented on the server side in a single session:

1. **Database Foundation** — 16 new tables added to `Database.js` migrations:
   - `hand_history` (full hand data per player — replaces old minimal schema)
   - `player_stats` (aggregated lifetime stats — 40+ tracked metrics)
   - `player_hand_type_stats` (per hand type: high card through royal flush)
   - `player_pocket_stats` (per starting hand combo: AA, AKs, 72o, etc.)
   - `player_sessions` (session tracking)
   - `fire_events` (fire streak log)
   - `player_titles` (earned dynamic titles)
   - `achievements` (progress tracking)
   - `crews`, `crew_members`, `crew_stats` (crew/gang system)
   - `robbery_log` (PvP robbery system)
   - `events` (seasonal/weekly events)
   - `daily_rewards` (server-side reward timer)
   - `spectator_bets` (side betting for spectators)
   - `saved_hands` (hand replay bookmarks)
   - `collusion_flags` (anti-cheat flagging)

2. **StatsEngine.js** (`src/stats/StatsEngine.js`) — Processes every completed hand:
   - Writes full hand_history record per player
   - Updates aggregated player_stats via UPSERT
   - Tracks hand type stats and pocket stats
   - Categorizes starting hands (AA, AKs, AKo format)
   - Hooked into Table.js `showdown()` and `awardPot()` via `_collectAndSendStatsData()`

3. **FireTracker.js** (`src/game/FireTracker.js`) — NBA Jam "On Fire" system:
   - Rolling window of last 12 hands per player per table
   - Weighted scoring (recent hands count more)
   - 4 fire levels: None → Warm → Hot → On Fire
   - 4 cold levels: None → Chilly → Cold → Frozen
   - Fold decay (consecutive folds cool you down)
   - Fire status included in table state broadcasts (fireLevel, coldLevel per seat)
   - Fire status change events broadcast to table

4. **TitleEngine.js** (`src/stats/TitleEngine.js`) — Dynamic player titles:
   - 25+ titles across 7 categories (luck, skill, style, hands, achievement, crew, rare)
   - Evaluated every 5 hands automatically
   - Non-achievement titles can be revoked when stats drop
   - Players choose which title to display
   - Title displayed at table, profile, leaderboard

5. **CrewManager.js** (`src/social/CrewManager.js`) — Crew/gang system:
   - Create/join/leave/disband crews
   - Roles: Leader, Officer (max 3), Member (max 20)
   - Crew stats, crew XP, crew levels (1-25+)
   - 6 crew perks unlocked by level
   - Crew tag displayed at tables `[TAG] PlayerName`
   - Crew leaderboard

6. **RobberyManager.js** (`src/game/RobberyManager.js`) — PvP item theft:
   - 6 tool types with different success rates
   - 4 defense item types (kevlar, alarm, bodyguard, safe)
   - Cooldowns (4h robber, 8h victim protection)
   - Chip penalty on failure
   - 24h recovery window for victims
   - Event multipliers applied (robbery spree event)

7. **EventManager.js** (`src/events/EventManager.js`) — Seasonal events:
   - 9 built-in event types
   - Multiplier stacking for XP, drops, chips, robbery
   - Loaded on server start
   - Active events API for client display

8. **CollusionDetector.js** (`src/security/CollusionDetector.js`) — Anti-cheat:
   - Soft play detection (fold rate analysis)
   - Win trading detection (alternating pattern)
   - Chip dumping detection (consistent large losses to specific player)
   - Flagged with severity levels for review

### Socket API Endpoints Added
All new events in `SocketHandler.js`:
- Stats: `get_player_stats`, `get_hand_type_stats`, `get_pocket_stats`, `get_hand_history`, `get_hand_replay`
- Titles: `get_titles`, `set_active_title`
- Profile: `get_player_profile` (full player card with stats + title + crew)
- Crews: `create_crew`, `get_crew`, `invite_to_crew`, `join_crew`, `leave_crew`, `crew_promote`, `crew_kick`, `get_crew_leaderboard`
- Robbery: `robbery_attempt`, `robbery_recovery`, `get_recoverable_robberies`
- Events: `get_active_events`
- Equipment: `equip_item`, `unequip_item`
- Fire: `fire_status_change` event broadcast to table

### Table.js Changes
- Added `handActions` and `handChipsBefore` tracking per hand
- Actions recorded in central success path of `handleAction()`
- `_collectAndSendStatsData()` method collects full hand data for StatsEngine
- Called from both `showdown()` and `awardPot()` (fold-win path)
- State broadcasts now include `fireLevel`, `coldLevel`, `activeTitle`, `crewTag` per seat
- Crew tag and active title loaded when player joins table

### IMPORTANT: Old hand_history table is auto-dropped
The migration checks if the old minimal `hand_history` table exists (no `table_id` column) and drops it, replacing with the full schema. Existing hand history data from the old schema will be lost (it was minimal and mostly empty anyway).

---

## GUI Overhaul Started (Feb 12, 2026)

### Full App Redesign - Theme, Layout, Animations
**Scope:** Every screen from connection to table play.

**Direction decided:** Stylized Urban / Dark Street aesthetic (GTA meets poker). Dark backgrounds, gold accents, area-specific color shifts for world progression. NOT clean casino, NOT cartoon.

**Key decisions:**
- All hardcoded `new Color(...)` calls across all scenes will be replaced with `Theme.Current.xxx`
- Android landscape thumb-zone layout enforced on all screens
- Minimum 48dp touch targets, 64-72dp for list items
- Animations are core (card deals, chip movements, pulses, transitions)
- Table scene action bar and label sizes are GOOD - keep as-is, only restyle colors
- 8dp spacing grid system throughout

**Plan:** See [GUI_REDESIGN_PLAN.md](GUI_REDESIGN_PLAN.md) for full phase-by-phase breakdown.

**Phases:** Theme System -> Login/Register -> Main Menu -> Lobby -> Table Scene -> Connection Flow -> Cleanup

---

## CRITICAL LESSON: Never Mix Files from Different Commits (Feb 3, 2026)

### Issue: File Mismatches After Pulling Boss House Changes
**Symptoms:** Unity compilation errors, missing methods/fields, files not matching what worked at boss house.

**Root Cause:** 
- Mixed files from different sources (local backup commit, remote commits, partial restores)
- Used incomplete backup commit (`928cc4c`) instead of actual pushed commit (`4556d54`)
- Tried to "fix" errors by patching individual files instead of using complete working state

**Solution:**
1. **ALWAYS use the complete commit that was pushed**, not local backups or partial commits
2. **NEVER mix files** from different commits/sources - use `git reset --hard <commit>` to get complete state
3. **If changes were pushed from another machine**, use that exact commit hash, not local backups
4. **Check commit messages** - "Final commit before leaving" = actual working state, "BACKUP" = incomplete local copy

**Correct Workflow:**
```powershell
# Find the actual pushed commit
git log --oneline --all --since="date" | grep "Final commit\|before leaving"

# Reset to that exact commit (complete state)
git reset --hard <actual-pushed-commit-hash>

# Verify it matches remote
git fetch origin
git reset --hard origin/master
```

**Wrong Approach (DON'T DO THIS):**
- ❌ Mixing files: `git checkout backup-commit -- file1.cs; git checkout remote -- file2.cs`
- ❌ Using local backup commits instead of actual pushed commits
- ❌ Patching individual files to "fix" errors
- ❌ Force pushing wrong commits to overwrite correct ones

**Key Principle:** One complete commit = one working state. Don't mix and match.

---

## Card Visibility & UI Issues

### Cards Disappearing (Fixed)
- **Issue**: Cards would disappear during hand transitions, especially in simulation mode
- **Root Cause**: Cards were being cleared before new ones were dealt, causing empty state in broadcasts
- **Fix**: Cards are now replaced atomically - old cards remain until new ones are ready
- **Files**: `src/game/Table.js` (startNewHand method)

### Cards Covering Names/Money (Unity Client Issue)
- **Issue**: Player cards are visually covering player names and chip amounts in Unity UI
- **Note**: This is a Unity client-side rendering/layout issue, not a server problem
- **Server Data**: Cards are sent correctly in the `cards` array within each seat object
- **Unity Fix Needed**: Adjust card UI positioning/z-order in Unity to ensure names/money render above cards

## Testing System

**State Comparison System** - Compare simulation vs real game states to find bugs automatically.

- Enable: `ENABLE_STATE_SNAPSHOTS=true npm start`
- Compare: `npm run compare-states <tableId>`
- See `TESTING.md` for full guide

**Unit Tests** - Jest tests for core game logic.

- Run: `npm test`
- Coverage: `npm run test:coverage`

## Quick Search Guide
- **Compilation errors**: Search error code (e.g., "CS0103", "CS1660")
- **Runtime errors**: Search symptom (e.g., "cards disappearing", "connection failed")
- **Features**: Search feature name (e.g., "simulation", "ready to rumble")
- **Socket.IO issues**: Search "socket" or "emit"

---

## Critical Issues (Read First)

### Issue #1: SocketIOUnity GetValue<T>() Returns Default Values (CRITICAL)
**Symptoms:** Server sends `{"success":true,...}` but Unity receives default values.

**Solution:** Use `JsonUtility.FromJson<T>()` instead:
```csharp
var obj = response.GetValue<object>();
string jsonStr = obj.ToString();
var result = JsonUtility.FromJson<T>(jsonStr);
```

### Issue #21: SOCKET_IO_AVAILABLE Only Defined for Android
**Symptoms:** Socket code works on Android but not in Editor.

**Solution:** Add `SOCKET_IO_AVAILABLE` to Standalone platform in Project Settings → Player → Scripting Define Symbols.

### Issue #26: Response Classes ONLY in NetworkModels.cs
**Symptoms:** CS0101 duplicate class definitions.

**Solution:** Keep all response classes in `NetworkModels.cs`, not in `GameService.cs`.

### Issue #33: Server MUST Emit BOTH Callback AND Response Event
**Symptoms:** Client never receives response.

**Solution:** Server must do both:
```javascript
if (callback) callback(response);
socket.emit('event_name_response', response);
```

---

## Compilation Errors

### CS1660: Cannot Convert Lambda to Type 'int'
**Symptoms:** `error CS1660: Cannot convert lambda expression to type 'int'`

**Solution:** Missing parameter in method call. Check method signature matches call.

### CS0103: Name Does Not Exist
**Symptoms:** Variable or method not found.

**Solution:** Check if feature exists in current commit. Use `git log` to find when it was added.

### CS0656: Dynamic Keyword Not Supported
**Symptoms:** CS0656 error when using `dynamic`.

**Solution:** Don't use `dynamic` in Unity. Use JSON parsing instead.

---

## Socket.IO Issues

### Client Never Receives Response
**Symptoms:** Server logs show success, client stuck on loading.

**Solution:** 
1. Server must emit `event_name_response` event (not just callback)
2. Client must listen for `event_name_response` before emitting
3. Check event names match exactly (case-sensitive)

### Connection Fails in Editor
**Symptoms:** Works on Android, fails in Unity Editor.

**Solution:** Add `SOCKET_IO_AVAILABLE` to Standalone platform scripting defines.

---

## Game Logic Issues

### Issue #76: Chips Replaced Instead of Added
**Symptoms:** Player loses account balance when leaving table.

**Solution:** Changed `player.chips = chips` to `player.chips += chips` in `GameManager.js`.

### Issue #83: Cards Disappearing
**Symptoms:** Cards vanish mid-game.

**Solution:** Preserve cards array structure, add null checks before mapping.

### Issue #91: Game Bugged After Hand Ended
**Symptoms:** Cards change, players can't bet.

**Solution:** Reset state flags before dealing cards, broadcast state before starting timer.

---

## UI Issues

### Issue #74: Slider Handles Stretched
**Symptoms:** Sliders appear as tall bars instead of circles.

**Solution:** Set handle anchor to center (0.5, 0.5) with fixed size.

### Issue #78: Seat Perspective Wrong
**Symptoms:** Player's seat not at bottom center.

**Solution:** Rotate visual positions based on player's seat index.

---

## Recent Fixes (January 2026)

### Simulation Mode
- Added simulation toggle to Create Table
- Socket bot ratio slider
- StartSimulation/StopSimulation methods
- SimulationResponse model

### Ready to Rumble Sound
- Added ready_to_rumble.mp3 audio file
- Plays when countdown phase starts

### Turn Timer
- Configurable 5-60 seconds
- Pulsing red when < 10 seconds
- Local countdown animation

---

**Note:** For full details on any issue, search this file for the issue number or symptom.

