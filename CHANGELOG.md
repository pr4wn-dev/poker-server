## [Feb 13, 2026] - Fix: Connection Issues After Improper Unity Close

**Issue**: When Unity was closed improperly (kill/crash/debugger stop), the client couldn't
reconnect to the server afterwards. Connection timeouts or stale state prevented re-login.

**Root Causes (Client)**: Disconnect() never awaited/disposed old socket. Connect() created
new SocketIOUnity without cleaning up the old one (zombie socket). No auto-reconnect logic.

**Root Causes (Server)**: authenticateSocket() didn't check for stale sessions on different
sockets. Disconnect handler had race condition with re-login. deauthenticateSocket() didn't
clean up GameManager.socketToPlayer. UnityLogHandler require pointed to deleted monitoring/.

**Fixes (Client)**: Added DisposeOldSocket() with proper cleanup. Auto-reconnect with
exponential backoff (2s to 30s, 5 attempts). OnApplicationQuit/Pause lifecycle handlers.
Named event handlers for clean unsubscribe.

**Fixes (Server)**: Stale session detection and force-disconnect in authenticateSocket().
Race guard in disconnect handler. Conditional auth removal in deauthenticateSocket().
Stubbed out UnityLogHandler.

---
## [Feb 13, 2026] - Session Fixes: Theme Restoration, DB Migration, Compile Errors

### Dark Theme Restoration (FINAL - commit 028b9a3)
**Issue**: Commit 524cd54 ("Massive Unity UI") overwrote the GUI overhaul (Phases 1-7) by
regenerating MainMenuScene.cs from an old pre-theme base. Multiple restoration attempts
failed because the editor's stale buffer kept overwriting the git-restored file before commits.

**Root Causes**:
1. Agent regenerated MainMenuScene.cs using old version as base
2. Editor tool (search_replace) had stale buffer that overwrote git checkout before commit
3. PowerShell injection script matched `_itemAnteEnabled.*command-line` in TWO places
   (field declaration AND a variable assignment inside a method), causing duplicate
   `private` field declarations inside a method body → CS0106 errors
4. String interpolation `$"...{expr ?? \"default\"}"` used `\"` escapes inside interpolation
   holes which is invalid C# syntax

**Fix** (multiple commits: 260f72b → 9e115c2 → 028b9a3):
- Restored MainMenuScene.cs from git history (524cd54^) using ONLY PowerShell terminal commands
  (no editor tools) to avoid stale buffer overwrites
- Merged 4 new features: BuildEventBanner, LoadActiveEvents, CheckDailyRewards, ShowDailyRewardsPopup
- Removed duplicate field declarations (lines 330-338) injected inside method body
- Replaced `\"` in string interpolation with concatenation: `"EVENT: " + (expr ?? "EVENT")`
- Fixed `using System.Collections.Generic;` missing
- Fixed `PlayerCharacter.HasSelectedCharacter` → `string.IsNullOrEmpty(PlayerCharacter.ActiveCharacterId)`
- Restored theme refs in TableScene (22), CharacterSelectScene (3), SpectatorPanel (4),
  RobberyScene (6), PlayerProfilePopup (1), PokerTableView (3), ToastNotification (5),
  LoadingOverlay (1)

### Database Migration Fix (commit 90ff09a)
**Issue**: Server started but login returned "Database offline". Server logs showed
"Connecting to database..." with no "Connected" confirmation.

**Root Cause**: `events` table migration had `end_date TIMESTAMP NOT NULL` without a default
value. MySQL strict mode rejects this, causing `db.initialize()` to silently return `false`.
All subsequent `db.isConnected` checks failed, blocking login/register.

**Fix**: Added `DEFAULT CURRENT_TIMESTAMP` to both `start_date` and `end_date` columns in
the events table CREATE statement.

### Lessons Learned
1. NEVER use editor tools (search_replace) on files restored via git checkout — use terminal only
2. PowerShell regex matches in injection scripts can match in unexpected places — use exact line matching
3. `\"` escape sequences are NOT valid inside C# string interpolation `{...}` holes — use concatenation
4. When `db.initialize()` fails, the error is caught silently — always check for "Database connected" in logs
# Changelog - Issues & Solutions

This file tracks all issues encountered and their solutions. **Search this file first** before debugging.

---

## Karma / Heart System (Feb 13, 2026)

### Core Concept
Every player starts with a **Pure White Heart** (karma = 100). Committing crimes (robbery) darkens the heart progressively: white â†’ light gray â†’ gray â†’ dark gray â†’ charcoal â†’ black. Players with a Pure Heart (karma â‰¥ 95) are **completely invisible** to criminals and cannot be targeted for robbery. The darker your heart, the easier you are to find and rob.

### Server
- **Database.js**: Added `karma INT DEFAULT 100` column to `users` table, new `karma_history` table tracking every karma change with reason/details
- **UserRepository.js**: `getKarma()`, `modifyKarma(userId, delta, reason, details)` with logging, `getKarmaHistory()`, `applyKarmaDecay()` (daily +1 regeneration), `applyBulkKarmaDecay()` for all users
- **UserRepository.js**: Static helpers â€” `getHeartColor(karma)`, `getHeartTier(karma)` (6 tiers from "Pure Heart" to "Black Heart"), `getRobberyVisibility(karma)` (0.0 at pure to 2.0 at black)
- **RobberyManager.js**: 
  - Karma gate: victims with karma â‰¥ 95 are **untargetable** (returns error "Pure Heart")
  - Attempting robbery costs -5 karma (always, even if failed)
  - Successful robbery costs additional -10 karma
  - Victim's dark heart boosts attacker success rate by up to +20%
  - New `getRobberyTargets()` â€” returns karma-filtered player list sorted by darkness (excludes pure hearts)
  - All robbery results include `karma` and `heartColor` in response
- **SocketHandler.js**: New endpoints â€” `get_karma`, `get_karma_history`, `get_robbery_targets`
- **SocketHandler.js**: Karma loaded on `join_table` alongside crewTag/activeTitle/character
- **SocketHandler.js**: Karma included in `get_player_profile` response with heartColor and heartTier
- **Table.js getState()**: Seat data includes `karma` and `heartColor`
- **server.js**: Daily karma decay timer (runs every 24h, applies +1 karma to all users below 100)
- **Reset progress**: Karma reset to 100 + karma_history cleared

### Unity Client
- **NetworkModels.cs**: `HeartTier`, `KarmaResponse`, `KarmaHistoryEntry`, `KarmaHistoryResponse`, `RobberyTarget`, `RobberyTargetsResponse` models; `karma`/`heartColor` added to `SeatInfo` and `UserProfile`
- **PokerEvents.cs**: `GetKarma`, `GetKarmaHistory`, `GetRobberyTargets` events
- **GameService.cs**: `GetKarma()`, `GetKarmaHistory()`, `GetRobberyTargets()` methods; static helpers `GetHeartColor()`, `GetHeartUnityColor()`, `GetHeartTierName()` (color gradient from white through grays to near-black)
- **PokerTableView/PlayerSeatView**: Heart icon (â™¥) rendered top-right of each seat with karma-colored tint (12-14px, larger for dark hearts)
- **RobberyScene**: Complete overhaul â€” shows player's own heart status, "Available Targets" list loaded from server (karma-filtered, darkest first), each target card shows â™¥ color + tier name + stealable items + SELECT button; warning about heart darkening; results update karma display
- **PlayerProfilePopup**: Heart tier name and color displayed in profile header for ShowFromSeat, ShowCurrentUser, and Show
- **StatisticsScene**: Heart stat card added to Overview tab, shows current tier name with colored text

---

## Settings & Account Management (Feb 13, 2026)

### Reset Progress Confirmation Dialog
- **Server**: Added `resetProgress(userId)` to `UserRepository.js` â€” wipes chips/XP/stats/inventory/adventure/achievements/crew/titles/hand history/daily rewards/spectator bets/saved hands. Keeps account credentials and friends list.
- **Server**: Added `reset_progress` socket handler in `SocketHandler.js` with auth check and full logging
- **Client**: Added `ResetProgressResponse` model, `ResetProgress` method in `GameService.cs`, `ResetProgress` event in `PokerEvents.cs`
- **Client**: `SettingsScene.cs` uses `ConfirmDialog.ShowDanger` with detailed warning listing all data that will be erased, followed by `GameService.ResetProgress` call with toast notifications for success/failure

---

## Character System (Feb 12, 2026)

### Server
- **CharacterSystem.js**: 25+ character definitions with rarity tiers (Common â†’ Mythic), sound sets, sprite sets, personality types
- **Database**: `characters` + `player_characters` tables with migrations, `active_character` column on `users`
- **Socket Endpoints**: `get_characters`, `get_player_characters`, `set_active_character`, `get_character_sounds`
- **Drop Logic**: Characters drop from adventure victories, boss defeats, tournaments; integrated into `adventure_action` and `SocketHandler`
- **Table Integration**: Active character sent with seat state via `Table.getState()`

### Unity Client
- **NetworkModels**: `CharacterInfo`, `OwnedCharacterInfo`, `CharacterSoundSet`, `CharacterDropData`, etc.
- **GameService**: `GetCharacters`, `GetPlayerCharacters`, `SetActiveCharacter`, `GetCharacterSounds`, `OnCharacterDrop` event
- **CharacterSelectScene**: Full overhaul â€” server-driven character gallery with rarity-colored cards, owned/locked states, set-active button
- **SpriteManager**: `GetCharacterSprite()` with Resources loading + procedural placeholder generation
- **PlayerSeatView**: Character avatar rendered at table seats (small portrait), prefers character sprite over default avatar
- **PlayerSeat.cs**: Updated to show character sprites when available
- **CharacterSoundManager**: Singleton that caches sound sets per character, plays character-specific audio on fold/all-in/win/lose, falls back to default AudioManager sounds
- **TableScene**: Preloads character sound sets when players join, plays character sounds during gameplay events

---

## Unity UI Feature Build (Feb 12, 2026)

### Player Seat Enhancements
- **Fire/Cold Visuals**: PlayerSeatView shows color-coded glow (cyan warm â†’ magenta hot â†’ purple on-fire, dull red cold/frozen) with pulse/wobble animations
- **Title Display**: Active title shown below player name at table (e.g., "ðŸ… Bluff Master")
- **Tap-to-Profile**: Tapping any occupied seat opens PlayerProfilePopup with stats, title, crew, fire status

### Statistics Scene Overhaul
- 7-tab system: Overview, Skill, Luck, Pockets, Hand Types, Trends, Rare Hands, Titles
- **Titles Tab**: View earned titles, set active title with server callback

### New Scenes Created
- **CrewScene**: Full crew management â€” create crew (name/tag/desc), member list, invite players, crew chat, crew leaderboard
- **RobberyScene**: Target selection, 5 tool types (lockpick, RFID cloner, hotwire kit, burner phone, fake ID), result popup, robbery history log
- **HandReplayScene**: Saved hands browser, Hand of the Day showcase, replay viewer with player cards + action timeline

### Main Menu
- **Event Banner**: Shows active server events with name, description, and multiplier badges (XP/Chips/Drops), loads on menu show

### Table Scene
- **SpectatorPanel**: Auto-shows for spectators â€” live win probability bars (refreshing every 5s), side bet placement, bet feed
- **Profile popup** wired through seat taps

### Networking
- Added `GetHandReplay(tableId, handNumber)` to GameService
- All models in NetworkModels.cs verified and complete

---

## Feature Completion Pass (Feb 12, 2026)

### Advanced Hand Detection in Table.js
All 6 TODO placeholders in `_collectAndSendStatsData()` are now real detection algorithms:

1. **C-bet Detection** â€” Detects when preflop raiser bets the flop. Tracks success (won pot or everyone folded).
2. **Steal Attempt Detection** â€” Detects late position (button/cutoff/SB) raises when no one raised before. Tracks success.
3. **Bluff Detection** â€” Detects aggressive action with weak hands (pair or worse). Tracks bluff success + opponent bluff detection + correct bluff calls.
4. **Draw Detection** â€” Checks for flush draws (4 same suit on flop) and straight draws (4-card sequences, including wheel). Tracks draw completion.
5. **Behind-on-Flop / Suckout Detection** â€” Evaluates each player's hand at the flop, compares vs opponents. Tracks if player was behind and won from behind.

Fire tracker now receives real draw/suckout data instead of `false` placeholders.

### SpectatorOdds.js â€” Monte Carlo Win Probability
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
- `save_hand` â€” Save a hand from history as a bookmark
- `get_saved_hands` â€” Retrieve saved hands with full hand_history join
- `get_hand_of_the_day` â€” Biggest pot winner in last 24 hours

### Crew Stats Integration
- After each hand, `CrewManager.updateCrewStats()` is called for every non-bot player
- Tracks hands played, hands won, chips won per crew

### Collusion Detector Auto-Trigger
- Every 50 hands, all human player pairs at the table are analyzed automatically
- Runs asynchronously, doesn't block game flow

### Player Session Tracking
- Session created when player joins a table (`player_sessions` table)
- Session ended when player leaves â€” records end time, chips, profit/loss
- Updates `sessions_played` and `total_play_time_seconds` in `player_stats`

---

## Project Completion Status (Feb 13, 2026)

### âœ… All Systems Implemented

| System | Server | Client | Wired |
|--------|--------|--------|-------|
| Core Poker (Table, Hands, Betting) | âœ… | âœ… | âœ… |
| Bot System (AI + Socket Bots) | âœ… | âœ… | âœ… |
| Item Ante / Power Score | âœ… | âœ… | âœ… |
| Adventure Mode (Map, Bosses, Battle) | âœ… | âœ… | âœ… |
| Tournament System | âœ… | âœ… | âœ… |
| Character System (25+ chars, drops) | âœ… | âœ… | âœ… |
| Character Sounds + Sprites at Table | âœ… | âœ… | âœ… |
| Stats Engine (40+ lifetime metrics) | âœ… | âœ… | âœ… |
| Stats Calculator (VPIP, PFR, luck) | âœ… | âœ… | âœ… |
| Fire/Cold System (NBA Jam style) | âœ… | âœ… | âœ… |
| Title Engine (25+ dynamic titles) | âœ… | âœ… | âœ… |
| Crew System (create, roles, perks, XP) | âœ… | âœ… | âœ… |
| Robbery System (tools, defense, cooldowns) | âœ… | âœ… | âœ… |
| Friends System (add, accept, decline, remove) | âœ… | âœ… | âœ… |
| Event System (seasonal/weekly, multipliers) | âœ… | âœ… | âœ… |
| Daily Rewards (7-day streak) | âœ… | âœ… | âœ… |
| Spectator Odds (Monte Carlo sim) | âœ… | âœ… | âœ… |
| Spectator Side Betting | âœ… | âœ… | âœ… |
| Hand Replay / Saved Hands | âœ… | âœ… | âœ… |
| Collusion Detection (auto-trigger) | âœ… | â€” | âœ… |
| Achievements (auto-unlock) | âœ… | âœ… | âœ… |
| Inventory (equip/unequip/use) | âœ… | âœ… | âœ… |
| Leaderboards (chips, wins, level, pots) | âœ… | âœ… | âœ… |
| Settings + Reset Progress | âœ… | âœ… | âœ… |
| Player Profile Popup (tap seat) | â€” | âœ… | âœ… |
| Chat + Invite Popups | âœ… | âœ… | âœ… |

### Unity Client Scenes (All Built)
`MainMenuScene` Â· `LobbyScene` Â· `TableScene` Â· `StatisticsScene` Â· `CharacterSelectScene` Â· `TournamentScene` Â· `AdventureMapScene` Â· `AdventureBattleScene` Â· `InventoryScene` Â· `CrewScene` Â· `RobberyScene` Â· `HandReplayScene` Â· `LeaderboardScene` Â· `ShopScene` Â· `SettingsScene`

### Server Modules (All Built)
`Table.js` Â· `GameManager.js` Â· `BotManager.js` Â· `HandEvaluator.js` Â· `ItemAnte.js` Â· `Tournament.js` Â· `TournamentManager.js` Â· `AdventureManager.js` Â· `AdventurePokerGame.js` Â· `Boss.js` Â· `BossAI.js` Â· `WorldMap.js` Â· `StatsEngine.js` Â· `StatsCalculator.js` Â· `FireTracker.js` Â· `TitleEngine.js` Â· `CharacterSystem.js` Â· `CrewManager.js` Â· `FriendsManager.js` Â· `RobberyManager.js` Â· `EventManager.js` Â· `CollusionDetector.js` Â· `SpectatorOdds.js`

### ðŸ”® Deferred (Not Blocking)
- Audio assets (AI-generated character sounds)
- Image assets (AI-generated sprites, boss art, item icons)
- Store UI / chip purchasing / ads / premium membership

---

## Massive Feature Build (Feb 12, 2026)

### New Server Modules Built
All new systems implemented on the server side in a single session:

1. **Database Foundation** â€” 16 new tables added to `Database.js` migrations:
   - `hand_history` (full hand data per player â€” replaces old minimal schema)
   - `player_stats` (aggregated lifetime stats â€” 40+ tracked metrics)
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

2. **StatsEngine.js** (`src/stats/StatsEngine.js`) â€” Processes every completed hand:
   - Writes full hand_history record per player
   - Updates aggregated player_stats via UPSERT
   - Tracks hand type stats and pocket stats
   - Categorizes starting hands (AA, AKs, AKo format)
   - Hooked into Table.js `showdown()` and `awardPot()` via `_collectAndSendStatsData()`

3. **FireTracker.js** (`src/game/FireTracker.js`) â€” NBA Jam "On Fire" system:
   - Rolling window of last 12 hands per player per table
   - Weighted scoring (recent hands count more)
   - 4 fire levels: None â†’ Warm â†’ Hot â†’ On Fire
   - 4 cold levels: None â†’ Chilly â†’ Cold â†’ Frozen
   - Fold decay (consecutive folds cool you down)
   - Fire status included in table state broadcasts (fireLevel, coldLevel per seat)
   - Fire status change events broadcast to table

4. **TitleEngine.js** (`src/stats/TitleEngine.js`) â€” Dynamic player titles:
   - 25+ titles across 7 categories (luck, skill, style, hands, achievement, crew, rare)
   - Evaluated every 5 hands automatically
   - Non-achievement titles can be revoked when stats drop
   - Players choose which title to display
   - Title displayed at table, profile, leaderboard

5. **CrewManager.js** (`src/social/CrewManager.js`) â€” Crew/gang system:
   - Create/join/leave/disband crews
   - Roles: Leader, Officer (max 3), Member (max 20)
   - Crew stats, crew XP, crew levels (1-25+)
   - 6 crew perks unlocked by level
   - Crew tag displayed at tables `[TAG] PlayerName`
   - Crew leaderboard

6. **RobberyManager.js** (`src/game/RobberyManager.js`) â€” PvP item theft:
   - 6 tool types with different success rates
   - 4 defense item types (kevlar, alarm, bodyguard, safe)
   - Cooldowns (4h robber, 8h victim protection)
   - Chip penalty on failure
   - 24h recovery window for victims
   - Event multipliers applied (robbery spree event)

7. **EventManager.js** (`src/events/EventManager.js`) â€” Seasonal events:
   - 9 built-in event types
   - Multiplier stacking for XP, drops, chips, robbery
   - Loaded on server start
   - Active events API for client display

8. **CollusionDetector.js** (`src/security/CollusionDetector.js`) â€” Anti-cheat:
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
- âŒ Mixing files: `git checkout backup-commit -- file1.cs; git checkout remote -- file2.cs`
- âŒ Using local backup commits instead of actual pushed commits
- âŒ Patching individual files to "fix" errors
- âŒ Force pushing wrong commits to overwrite correct ones

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

**Solution:** Add `SOCKET_IO_AVAILABLE` to Standalone platform in Project Settings â†’ Player â†’ Scripting Define Symbols.

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

## Detailed Bug Fixes (February 2026)

These fixes were documented during development and moved here from README during cleanup.

### ✅ Double-Action Race Condition (Feb 12)
**Severity:** HIGH — After clicking Fold (or any action), queued state updates re-showed action panel via `ShowActionButtons()`, re-enabling buttons. Second click caused "Already folded" errors. Panel stuck permanently.
**Root Cause:** Socket.IO state broadcasts arrived in Unity main thread between action sent and server processing. Stale updates showed `currentPlayerId == myId`.
**Fix:** Added `_actionPanelLocked` flag, set true on any action click, cleared only when `currentPlayerId` changes. `shouldShowActionPanel` requires `!_actionPanelLocked`. Files: `TableScene.cs`

### ✅ Item Ante FK Error for Bots (Feb 12)
**Severity:** MEDIUM — Bots winning item ante caused `ER_NO_REFERENCED_ROW_2` (bot IDs not in users table).
**Fix:** Check if winner is bot before DB transfer. Bots: log award, skip DB. Files: `Table.js`

### ✅ Practice Mode Item Ante Risk-Free (Feb 12)
**Severity:** FEATURE — Practice mode was transferring real items. Added `practiceMode` check to skip `addItem()` calls. Files: `Table.js`

### ✅ Bot Betting Dead Streets After All-In (Feb 12)
**Severity:** MEDIUM — Bot kept betting through flop/turn/river after opponent all-in.
**Fix:** EXIT POINT 0b skips all phases to showdown. Bot AI checks if all opponents all-in/folded. Bot fallback: call → check → fold. Files: `Table.js`, `BotManager.js`

### ✅ Pot Amount Display Bug (Feb 11)
**Severity:** CRITICAL — `hand_result` sent total pot instead of individual award. Split pots showed wrong amounts.
**Fix:** Calculate winner's individual award across all side pots. Added `totalPot` as separate field. Files: `Table.js`

### ✅ Missing totalBet in State (Feb 11)
**Severity:** MEDIUM — Only `currentBet` (resets each round) was sent. Added `totalBet` (cumulative across hand) to seat data. Files: `Table.js`

### ✅ Spectator Item Ante Prompt (Feb 12)
**Severity:** MEDIUM — Spectators prompted to submit items. Added `!isSpectator(forPlayerId)` check. Files: `Table.js`

### ✅ Item Ante Missing Fields for Unity (Feb 12)
**Severity:** HIGH — Unity couldn't display item sprites because `templateId`, `description`, `isGambleable` etc. were missing from state.
**Fix:** Added all fields to `ItemAnte.getState()`, `side_pot_started`, `side_pot_submission` events. Files: `ItemAnte.js`, `SocketHandler.js`

### ✅ Unity Item Ante Filtering (Feb 12)
**Severity:** MEDIUM — InventoryPanel showed all items instead of filtering `isGambleable: true`. Added filtering, dim/disable for low-value items, red/green value text. Files: `InventoryPanel.cs`, `TableScene.cs`

### ✅ Bot Item Ante Submission (Feb 12)
**Severity:** HIGH — Bots not submitting items. `Cannot find module './Item'` — wrong require path.
**Fix:** Changed `'./Item'` to `'../models/Item'`. Added `itemAnteHandled` flag. Files: `BotManager.js`

### ✅ Practice Mode Bot Auto-Approval (Feb 12)
**Severity:** HIGH — Socket bots blocked regular bot approval in practice mode.
**Fix:** Auto-approve all bots in practice mode (only creator can invite). Files: `BotManager.js`

### ✅ Socket Bot Invitation & Item Ante (Feb 12)
**Severity:** MEDIUM — Socket bot username truncation, missing item ante submission.
**Fix:** Username 20-char limit, explicit `checkBotsItemAnte` after join, always emit response events. Files: `SocketHandler.js`, `SocketBot.js`

### ✅ InventoryPanel Off-Screen (Feb 12)
**Severity:** HIGH — Panel detected as off-screen. RectTransform not properly positioned on activation.
**Fix:** Reset anchors/position/sizeDelta after activation, `LayoutRebuilder.ForceRebuildLayoutImmediate()`, fixed ScreenSpaceOverlay visibility check. Files: `InventoryPanel.cs`

### ✅ Canvas Sorting Order Restoration (Feb 12)
**Severity:** MEDIUM — InventoryPanel sorting order (300) not restored on close, covering other elements.
**Fix:** Save/restore `_originalCanvasSortingOrder`. Files: `InventoryPanel.cs`

### ✅ Items Not Awarded After Game (Feb 12)
**Severity:** HIGH — `ItemAnte.award()` returned items but didn't call `userRepo.addItem()`.
**Fix:** Loop through awarded items and call `addItem()` with error handling. Files: `Table.js`

### ✅ Item Ante Award Duplicate ID (Feb 12)
**Severity:** HIGH — Duplicate key error when re-adding items with same IDs.
**Fix:** Create new `Item` instances with fresh IDs on award. Files: `Table.js`

### ✅ Action Bar Not Visible (Feb 12)
**Severity:** CRITICAL — Betting controls hidden. Spectator logic also hid seated players.
**Fix:** Added `isInSeat` check, Canvas sorting order 350, forced layout rebuild. Files: `TableScene.cs`

### ✅ Turns Getting Skipped — 3 Bugs (Feb 12)
**Severity:** CRITICAL — Betting rounds advanced instantly (flop → turn → river) skipping players.
**Bug 1:** `lastRaiserIndex` initialized to `currentPlayerIndex` caused immediate false positive.
**Bug 2:** Pre-flop UTG→BB shortcut prevented BB from acting.
**Bug 3:** Post-flop fallback ended round after one player.
**Fix:** Added `playersActedThisRound` Set, guard against premature completion, alternative completion condition. Files: `Table.js`

### ✅ MyChipsPanel Not Visible (Feb 12)
**Severity:** MEDIUM — Hidden behind other elements. Set Canvas sortingOrder 400, `SetAsLastSibling()`. Files: `TableScene.cs`

### ✅ Blind Round Timer Not Visible (Feb 12)
**Severity:** MEDIUM — Behind other layers. Created `_blindTimerContainer` with own Canvas (sortingOrder 450). Files: `TableScene.cs`

### ✅ Bot Item Ante Value Mismatch (Feb 12)
**Severity:** HIGH — Bots couldn't submit items when minimum > 500. Expanded test items to all rarity tiers, dynamic item creation for any minimum. Files: `BotManager.js`

### ✅ All-In Excess Chips Not Returned (Feb 12)
**Severity:** CRITICAL — 100M all-in vs 20K opponent showed pot as 100M. Excess 99.98M should be returned immediately.
**Fix:** Added `returnExcessBets()` method (calculates max matchable, returns excess), called at EXIT POINT 1 and start of showdown. Files: `Table.js`

### ✅ InventoryPanel Item Visibility — Complete Fix (Feb 11)
**Severity:** CRITICAL — 5 combined issues: low Canvas sorting, bad RectTransform positioning, Content width reset, Mask clipping, GridLayoutGroup overflow.
**Fix:** Canvas sorting 300, RectTransform reset after activation, Content width pre-set before items, `Mask` → `RectMask2D`, `maskable=true`, GridLayoutGroup optimization, window resize handler. Files: `InventoryPanel.cs`

### ✅ InventoryPanel Missing in MainMenuScene (Feb 11)
**Severity:** MEDIUM — `OnInventoryClick()` was a TODO. Implemented panel creation/reuse. Files: `MainMenuScene.cs`

---

### Known Issues (as of Feb 12, 2026)

#### Missing Chips / Money Loss
**Status:** Under investigation
- Pot not cleared at hand start (40+ instances) — chips carry over
- Chips lost during betting (pot < sum of totalBets) — chips subtracted but not added to pot
- Cumulative chip loss across hands (21K → 35K → 38K)

#### Item Ante Edge Cases
- Item not found in inventory (if traded/consumed between selection and submission)

---

**Note:** For full details on any issue, search this file for the issue number or symptom.


