# Poker Server

Real-time multiplayer Texas Hold'em poker server built with Node.js and Socket.IO. Backend for an Android poker game with a **crime/cyber/poker/RPG** hybrid aesthetic.

## Documentation

- **[INSTALL.md](INSTALL.md)** - Setup and installation guide
- **[AGENT_RULES.md](AGENT_RULES.md)** - Rules for AI agents working on this project
- **[CHANGELOG.md](CHANGELOG.md)** - Issues encountered and solutions (search this first!)
- **[TESTING.md](TESTING.md)** - Testing guide: unit tests, simulation comparison, state snapshots
- **[UI_BEST_PRACTICES.md](UI_BEST_PRACTICES.md)** - UI component best practices: position locking, animations, layout handling
- **[GUI_REDESIGN_PLAN.md](GUI_REDESIGN_PLAN.md)** - Full GUI/UX overhaul plan: theme system, layout, animations, phase-by-phase work plan
- **[ART_ASSET_PROMPTS.md](ART_ASSET_PROMPTS.md)** - Ready-to-use AI image generation prompts for all game art (backgrounds, bosses, items, UI)

**Unity Client:** See [poker-client-unity](https://github.com/pr4wn-dev/poker-client-unity) for the full client with `PROJECT_STATUS.md` covering current state, roadmap, and what's left to do.

## Features

- Full Texas Hold'em game logic with hand evaluation
- Real-time WebSocket communication (Socket.IO)
- Multi-table support with configurable rules
- Unity Android client with 12 scenes (login, lobby, poker, adventure, inventory, etc.)
- Per-player card visibility (no cheating)
- Bot system (regular AI bots + socket bots for testing)
- Item Ante ("For Keeps") mode — gamble inventory items (risk-free in practice mode)
- Adventure mode — world map, areas, boss battles (poker vs AI)
- Tournament system — brackets, registration, elimination
- Item economy — rarity tiers, Power Score system, dual economy (gambleable vs store items)
- Character archetype system — Hustler, Hacker, Shark, Hybrid
- Friends, chat, spectating, achievements
- Simulation mode for spectating bot-only games
- Configurable blind increase timers

## Item Economy System

### Overview
The game features a dual-economy system designed to be **legal, sustainable, and engaging** while supporting thousands of users. Revenue is generated through **ads, traffic, optional cosmetics, and chip sales** - NOT through gambling real money.

### Two Item Types

#### **Gambleable Items** (Earned Through Gameplay)
- Dropped from bosses, tournaments, and challenges
- Can be used in **Item Ante poker games** (risk vs. reward)
- Can be **traded** with other players (item-for-item swaps)
- Have **NO real-money value** (cannot be cashed out)
- Rarity tiers: Common → Uncommon → Rare → Epic → Legendary
- Purpose: **Prestige, collection, bragging rights**
- Marked with `isGambleable: true`

#### **Store Items** (Cosmetic/Premium Only)
- Purchased with **real money** (microtransactions)
- **CANNOT be gambled** in Item Ante (legal compliance)
- **CANNOT be traded** (account-bound)
- Examples: Custom avatars, card backs, emotes, table themes
- **Visual-only** - no gameplay advantage
- Marked with `isGambleable: false`

**Legal Compliance:** By separating gambleable items (zero cash value) from store items (cannot be gambled), Item Ante is **not classified as real-money gambling**.

### Chip Economy

#### Earning Chips (Free)
- Win poker hands
- Daily login bonuses
- Complete challenges
- Level up rewards
- Tournament prizes

#### Buying Chips (Optional)
- Small Pack: $5 → 10,000 chips
- Medium Pack: $20 → 50,000 chips
- Large Pack: $50 → 150,000 chips
- **One-way only** - chips cannot be sold back for real money (legal compliance)

#### Using Chips
- Table buy-ins
- Tournament entries
- Practice mode (free, unlimited)

**Legal Compliance:** Chips can be earned for free (skill-based) and cannot be cashed out (one-way = not gambling).

### Item Power Score System

Instead of dollar values, items use a **Power Score** based on rarity and scarcity:

```
Power = (Rarity × Drop Rate × Demand)

Examples:
┌────────────┬───────────┬───────────┬────────┬───────┐
│ Item       │ Rarity    │ Drop Rate │ Demand │ Power │
├────────────┼───────────┼───────────┼────────┼───────┤
│ Flaming Ace│ Legendary │ 0.1%      │ High   │ 9,500 │
│ Gold Chip  │ Epic      │ 2%        │ Medium │ 3,200 │
│ Silver Card│ Rare      │ 8%        │ Low    │   850 │
│ Wood Token │ Common    │ 40%       │ Low    │   120 │
└────────────┴───────────┴───────────┴────────┴───────┘
```

### Item Ante Flow

#### Table Creation (Creator's Side)
1. Creator enables Item Ante checkbox
2. Creator clicks **[SELECT ANTE ITEM]** button
3. Inventory panel opens (shows only `isGambleable: true` items)
4. Creator picks item → shows in preview square with Power Score
5. That item's **Power Score becomes the locked minimum** for the entire table session
6. Item is stored in table settings (NOT removed from inventory yet)

#### Lobby View (Other Players)
- Table list shows: `"Item Ante: 9,500 Power minimum (Legendary)"`
- Optional: Preview of creator's selected item
- Players know the stakes before joining

#### Before Each Hand
1. All players see: **"⚠️ MINIMUM REQUIRED: 9,500 Power (Legendary: Flaming Ace)"**
2. Players select item(s) from inventory:
   - Only `isGambleable: true` items are selectable
   - Store items are grayed out with tooltip: *"Store items cannot be gambled"*
   - Items below minimum show **red ✗**
   - Items at/above minimum show **green ✓**
3. Players can combine multiple items to reach minimum (e.g., 3× Rare = 1× Legendary)
4. Winner takes all items from the pot

#### Practice Mode vs. Real Mode
- **Practice**: Items are "virtually" bet, no actual transfer (risk-free learning)
- **Real**: Items are permanently transferred to winner's inventory

#### If Creator Leaves/Eliminated
- **Minimum stays locked** at the original Power Score
- Table continues with same rules
- No interruption to gameplay

### Revenue Model

#### Primary Revenue (Main Focus)
1. **Ads** - Interstitial, rewarded video (watch ad → bonus chips), banners
2. **Traffic** - Affiliate partnerships, sponsored tournaments, influencer collabs
3. **Premium Membership** - $4.99/month (ad-free, exclusive cosmetics, 2× daily chips, priority matchmaking)

#### Secondary Revenue (Optional Microtransactions)
4. **Cosmetic Store** - Avatars ($1.99-$4.99), card backs ($0.99-$2.99), emotes ($0.99), table themes ($1.99), profile frames ($1.99)
5. **Chip Packs** - Optional boost to skip grinding (still earnable free)

**No real-money gambling** - all revenue is from ads, cosmetics, and optional chip purchases (one-way).

### Implementation Status
- ✅ Item Ante system (gamble items, winner takes all, practice mode risk-free)
- ✅ Item rarity system (Common/Uncommon/Rare/Epic/Legendary)
- ✅ Power Score calculation (rarity x drop rate x demand)
- ✅ `isGambleable` flag enforcement (store items cannot be gambled)
- ✅ Table creation item selection UI (select ante item, Power Score display)
- ✅ Locked minimum display in lobby/game
- ✅ Practice mode (virtual betting, no transfer)
- ✅ Bot item ante submission (auto-submit, value matching)
- ⏳ **TODO**: Store item restrictions UI (shop interface with clear messaging)
- ⏳ **TODO**: Chip purchasing system (one-way buy with real money)
- ⏳ **TODO**: Ads integration (AdMob, Unity Ads)
- ⏳ **TODO**: Premium membership system ($4.99/mo)

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
copy env.example .env

# Start development server
npm run dev
```

### Production

```bash
npm start
```

## Project Structure

```
poker-server/
├── src/
│   ├── server.js              # Entry point (Express + Socket.IO)
│   ├── setup.js               # Database schema setup
│   ├── game/
│   │   ├── GameManager.js     # Manages tables & players
│   │   ├── Table.js           # Table logic, betting, showdown (~9000 lines)
│   │   ├── BotManager.js      # Bot AI, item ante handling, smart decisions
│   │   ├── BotPlayer.js       # Bot personality & behavior
│   │   ├── ItemAnte.js        # Item ante ("For Keeps") logic
│   │   ├── Deck.js            # Card deck
│   │   ├── HandEvaluator.js   # Hand ranking
│   │   ├── Tournament.js      # Tournament logic
│   │   └── TournamentManager.js # Tournament lifecycle
│   ├── adventure/
│   │   ├── AdventureManager.js # Adventure mode coordination
│   │   ├── AdventurePokerGame.js # Poker vs AI boss
│   │   ├── Boss.js            # Boss definitions
│   │   ├── BossAI.js          # Boss poker AI
│   │   └── WorldMap.js        # Area/world map data
│   ├── models/
│   │   ├── Item.js            # Item model, templates, Power Score
│   │   ├── User.js            # User model
│   │   └── HouseRules.js      # Table rule presets
│   ├── database/
│   │   ├── Database.js        # MySQL connection pool
│   │   └── UserRepository.js  # User, inventory, friends persistence
│   ├── social/
│   │   └── FriendsManager.js  # Friends system
│   ├── testing/
│   │   ├── SimulationManager.js # Bot simulation mode
│   │   ├── SocketBot.js       # Socket bot for testing
│   │   ├── StateAnalyzer.js   # Game state analysis
│   │   ├── StateComparator.js # State diff comparison
│   │   └── StateSnapshot.js   # State capture
│   ├── sockets/
│   │   ├── SocketHandler.js   # All WebSocket event handlers
│   │   └── Events.js          # Event documentation
│   └── utils/
│       └── GameLogger.js      # Structured logging
├── env.example                # Environment template
├── package.json
└── *.md                       # 15+ documentation files
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server health check |
| `GET /api/tables` | List public tables |

## WebSocket Events

See `src/sockets/Events.js` for complete event documentation.

### Quick Reference

**Client → Server:**
- `register` - Register player
- `get_tables` - List tables
- `create_table` - Create table
- `join_table` - Join table
- `leave_table` - Leave table
- `action` - Game action (fold/check/call/bet/raise/allin)
- `chat` - Send message
- `start_side_pot` - Start item ante with selected item
- `submit_to_side_pot` - Submit item to existing ante pot
- `invite_bot` - Invite AI bot to table
- `invite_socket_bot` - Invite socket bot to practice table
- `start_simulation` - Start bot-only simulation game
- `start_game` - Start game at table

**Server → Client:**
- `table_state` - Game state update
- `player_action` - Action notification
- `player_joined/left` - Player events
- `start_side_pot_response` - Item ante start result
- `submit_to_side_pot_response` - Item submission result
- `invite_socket_bot_response` - Socket bot invitation result
- `start_game_response` - Game start result
- `game_over` - Game ended notification

## Unity Integration

The server uses Socket.IO. For Unity, use:
- [socket.io-client-csharp](https://github.com/doghappy/socket.io-client-csharp)

### Connection Example (C#)

```csharp
using SocketIOClient;

var client = new SocketIO("http://your-server:3000");
await client.ConnectAsync();

// Register
await client.EmitAsync("register", new { playerName = "Player1" });

// Join table
await client.EmitAsync("join_table", new { tableId = "xxx" });

// Listen for state updates
client.On("table_state", response => {
    var state = response.GetValue<TableState>();
    // Update UI
});
```

## Configuration

See `env.example` for all configuration options:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `DEFAULT_STARTING_CHIPS` | 10000 | Starting chips |
| `DEFAULT_SMALL_BLIND` | 50 | Small blind |
| `DEFAULT_BIG_BLIND` | 100 | Big blind |
| `MAX_PLAYERS` | 9 | Max players per table |

## Development

```bash
# Run with auto-reload
npm run dev

# Run tests
npm test
```

## Debugging Techniques

### Systematic Code Commenting (Binary Search Debugging)

**When to use:** When you have a bug but don't know where it is in the code.

**How it works:**
1. Comment out a chunk of code (e.g., betting logic, pot calculation, pot award)
2. Test - does the problem go away?
3. If **YES** → The bug is in that chunk (narrow it down further)
4. If **NO** → Uncomment and try a different chunk
5. Repeat until you find the exact section causing the problem

**Example for missing chips:**
- Comment out betting logic → Test → Do chips still go missing?
- Comment out pot calculation → Test → Do chips still go missing?
- Comment out pot award → Test → Do chips still go missing?
- Comment out pot clearing → Test → Do chips still go missing?

Keep narrowing down until the problem disappears - the last chunk you commented out contains the bug.

**Why it works:** Instead of guessing where the bug is, you systematically eliminate sections until you find the one causing the problem.

## Recent Fixes (February 2026)

### ✅ Fixed: Double-Action Race Condition (Action Panel Re-showing)
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** HIGH  

**Problem:** After clicking Fold (or any action), queued state updates that arrived before the server processed the action would re-show the action panel via `ShowActionButtons()`, re-enabling all buttons. Clicking again sent a second action, causing "Already folded - cannot act" errors. The panel then became permanently stuck.

**Root Cause:** Socket.IO state broadcasts could arrive in the Unity main thread dispatcher between the action being sent and the server processing it. These stale updates still showed `currentPlayerId == myId`, causing `shouldShowActionPanel = true` → `ShowActionButtons()` → buttons re-enabled.

**Solution:**
- Added `_actionPanelLocked` flag in `TableScene.cs`
- Set to `true` in `DisableAllActionButtons()` (called immediately on any action click)
- Only cleared when `currentPlayerId` definitively changes to another player or the phase becomes non-game
- `shouldShowActionPanel` now requires `!_actionPanelLocked` to be true

**Files Changed:**
- `Assets/Scripts/UI/Scenes/TableScene.cs` (Unity client)

### ✅ Fixed: Item Ante Transfer Fails for Bots (FK Constraint Error)
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** MEDIUM  

**Problem:** When a bot won the item ante, the server tried to insert items into the `inventory` table using the bot's ID (e.g., `bot_tex_1770868684318`). Since bots aren't in the `users` table, the foreign key constraint (`inventory.user_id → users.id`) caused `ER_NO_REFERENCED_ROW_2`.

**Solution:**
- Before transferring items, check if the winner is a bot (`isBot` flag, or ID starts with `bot_`, or name starts with `NetPlayer_`/`SimBot_`)
- If bot: log the award but skip DB transfer (bots don't have real inventories)
- If real player: transfer items as before

**Files Changed:**
- `src/game/Table.js` (showdown item ante award logic)

### ✅ Fixed: Practice Mode Item Ante Now Risk-Free (Virtual Items Only)
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** FEATURE ENHANCEMENT

**Problem:** In practice mode, item ante was transferring real items from players' inventories to winners, even though practice mode is meant to be risk-free for testing and learning.

**Expected Behavior:**
- **Practice Mode**: Items are shown visually in the pot and winner displays, but NO actual inventory transfers occur
- **Real Games**: Items are transferred as before (winner receives copies, losers keep original items)

**Solution:**
- Added check for `this.practiceMode` before transferring items to winner's inventory in `showdown()`
- If practice mode: Log `PRACTICE_MODE_SKIP` and broadcast state, but skip all `addItem()` calls
- Items remain visible in UI but are purely virtual in practice games

**How It Works:**
1. **Item Selection**: Players select items from inventory (same in both modes)
2. **Visual Display**: Items show in pot and winner displays (same in both modes)  
3. **Database Transfer**: 
   - **Practice**: Skipped - no inventory changes
   - **Real Game**: Winner receives item copies via `addItem()`

**Files Changed:**
- `src/game/Table.js` (lines 6656-6714: added practice mode check before item transfer)

**Verification:** Practice games now have zero risk - all players keep their items regardless of win/loss.

### ✅ Fixed: Bot Betting into Dead Streets After Opponent All-In
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** MEDIUM  

**Problem:** When a player went all-in and the bot was the only one who could act, the bot continued betting/raising through flop, turn, and river phases. Each phase advanced via LOOP PREVENTION, but the bot still wasted time and inflated the pot (excess was eventually returned by `returnExcessBets`).

**Root Cause:** EXIT POINT 0b in `advanceGame()` only advanced ONE phase at a time, letting the bot act in each new phase. Also, the bot's AI didn't check if all opponents were inactive.

**Solution (3 parts):**
1. **EXIT POINT 0b**: Now skips ALL remaining phases directly to showdown — deals remaining community cards, returns excess bets, broadcasts state, then goes to showdown after a 1.5s delay
2. **Bot AI**: Before deciding, checks if all opponents are all-in/folded. If so, just calls or checks instead of raising
3. **Bot Fallback**: Changed order from `fold > check` to `call > check > fold` to prevent unnecessary folds when max raises are reached

**Files Changed:**
- `src/game/Table.js` (EXIT POINT 0b in `advanceGame()`)
- `src/game/BotManager.js` (`executeBotTurn()` decision logic and fallback)

### ✅ Fixed: Pot Amount Display Bug
**Status:** FIXED  
**Date:** February 11, 2026  
**Severity:** CRITICAL  

**Problem:** The `hand_result` event was sending the total pot amount (e.g., 15M) instead of the winner's individual award amount (e.g., 10.4M). This caused the client to display incorrect amounts, especially when pots were split between multiple winners.

**Solution:**
- Modified `showdown()` to calculate the winner's total award across all side pots they won
- Changed `potAmount` in `hand_result` event to send individual award instead of total pot
- Added `totalPot` as separate field for reference
- Added comprehensive logging to track pot values and awards

**Files Changed:**
- `src/game/Table.js` (line 6554, 8916)

**Verification:** All pot calculations now show `Discrepancy=0` and individual awards match actual amounts awarded.

### ✅ Fixed: Missing totalBet in State
**Status:** FIXED  
**Date:** February 11, 2026  
**Severity:** MEDIUM  

**Problem:** Only `currentBet` was sent in state updates, which resets to 0 each betting round. This made it difficult for clients to display total bet amounts across all rounds of a hand.

**Solution:**
- Added `totalBet` field to seat data in `getState()`
- `currentBet`: Bet in current round (resets each phase)
- `totalBet`: Total bet in entire hand (across all rounds)

**Files Changed:**
- `src/game/Table.js` (line 9522)

**Impact:** Clients can now correctly display total bet amounts throughout the hand.

### ✅ Added: Comprehensive Pot Tracking Logging
**Status:** ADDED  
**Date:** February 11, 2026  

**Added logging for:**
- Pot values sent to clients (`getState`)
- Showdown pot calculations
- Pot awards vs initial pot comparisons
- Hand complete events with award breakdowns
- Chip movements during betting operations

**Log Files:**
- `logs/pot-award-debug.log` - Detailed pot award tracking
- `logs/bet-raise-debug.log` - Betting operation tracking
- `logs/call-debug.log` - Call operation tracking

### ✅ Fixed: Spectator Item Ante Submission Prompt
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** MEDIUM  

**Problem:** Spectators were incorrectly prompted to submit items for the item ante, even though they cannot participate as players. The `needsItemAnteSubmission` flag was being set to `true` for spectators.

**Solution:**
- Modified `Table.js` to explicitly check `!this.isSpectator(forPlayerId)` when determining `needsItemAnteSubmission` in `getState()`.
- Added check to return `false` for `needsItemAnteSubmission` when `forPlayerId` is `null` (broadcast case).
- This ensures the prompt is only shown to actual players in seats.

**Files Changed:**
- `src/game/Table.js` (line 9459, 9534)

**Verification:** Spectators no longer see the item ante submission prompt.

### ✅ Fixed: Item Ante Missing Fields for Unity Display
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** HIGH  

**Problem:** The Unity client was unable to display item sprites/assets in the item ante pot and selection menu because critical fields like `templateId`, `description`, `isGambleable`, `isTradeable`, and `obtainedFrom` were missing from the item objects sent in `ItemAnte.getState()`, `side_pot_started`, and `side_pot_submission` events.

**Solution:**
- Added all necessary item fields to the item objects within `creatorItem`, `firstItem`, and `approvedItems` in `ItemAnte.getState()` in `src/game/ItemAnte.js`.
- Ensured `side_pot_started` and `side_pot_submission` events in `src/sockets/SocketHandler.js` send fully formatted item objects.
- Implemented null checks and default values for item properties to prevent client-side crashes.

**Files Changed:**
- `src/game/ItemAnte.js`
- `src/sockets/SocketHandler.js`

**Verification:** Unity client now receives complete item data for display.

### ✅ Fixed: Unity Item Ante Filtering and Highlighting
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** MEDIUM  

**Problem:** The Unity `InventoryPanel` was showing all items from a player's inventory in item ante mode, instead of filtering for `isGambleable: true` items. Additionally, there was no visual indication for items that met or did not meet the minimum value requirement.

**Solution:**
- Modified `Assets/Scripts/UI/Components/InventoryPanel.cs` to:
  - Filter items by `isGambleable: true` when `isItemAnteMode` is active.
  - Dim items (50% opacity) and disable their selection button if their `baseValue` is less than `_minimumValue`.
  - Display red text `"$100 < $200"` for items below minimum, and green text for eligible items.
  - Update button text to `"SELECT FOR ANTE"` or `"VALUE TOO LOW (Min: $200)"`.
- Modified `Assets/Scripts/UI/Scenes/TableScene.cs` to pass `isItemAnteMode: true` and `minimumValue` to `InventoryPanel.Show()`.

**Files Changed:**
- `Assets/Scripts/UI/Components/InventoryPanel.cs`
- `Assets/Scripts/UI/Scenes/TableScene.cs`

**Verification:** Unity now correctly filters and visually guides players in item ante selection.

### ✅ Cleaned Up: Verbose Logging Removed
**Status:** COMPLETED  
**Date:** February 12, 2026  
**Severity:** LOW (Code Quality Improvement)  

**Problem:** Logs were extremely verbose with routine operation logging, making it difficult to find actual errors and warnings. Logs were cluttered with informational messages about normal operations.

**Solution:**
- Removed verbose `Debug.Log` statements from Unity client:
  - `SocketManager.cs`: Removed connection/disconnection logs, JSON parsing logs, emit logs
  - `TableScene.cs`: Removed bot operation logs, item ante processing logs, countdown logs, button click logs, player join/leave logs
  - `InventoryPanel.cs`: Removed detailed position/size/visibility diagnostics (kept only critical errors)
- Removed verbose `gameLogger.gameEvent` statements from server:
  - `SocketHandler.js`: Removed routine operation logs for authentication, inventory requests, table operations, simulation controls, bot management, player actions
- Kept all error logs (`Debug.LogError`, `gameLogger.error`) and critical warnings

**Files Changed:**
- `Assets/Scripts/Networking/SocketManager.cs`
- `Assets/Scripts/UI/Scenes/TableScene.cs`
- `Assets/Scripts/UI/Components/InventoryPanel.cs`
- `src/sockets/SocketHandler.js`

**Impact:** Logs are now much cleaner and focused on actual problems. Routine operations no longer clutter the console.

### ✅ Fixed: Bot Item Ante Submission in Practice Mode
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** HIGH  

**Problem:** Regular bots in practice mode were not automatically submitting items for item ante. The `_handleBotItemAnte` method was failing with `Cannot find module './Item'` error because the require path was incorrect.

**Solution:**
- Fixed Item module require path in `BotManager.js` from `'./Item'` to `'../models/Item'` (correct path from `src/game/` to `src/models/`)
- Added proper error handling with async/await for bot item ante submission
- Added `itemAnteHandled` flag to prevent duplicate submissions
- Bots now automatically submit items after being confirmed in practice mode

**Files Changed:**
- `src/game/BotManager.js` (line 290)

**Verification:** Bots now successfully submit items for item ante in practice mode. Server logs show: `[BotManager] Bot submitted item successfully`.

### ✅ Fixed: Practice Mode Bot Auto-Approval with Socket Bots
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** HIGH  

**Problem:** When socket bots were present at a practice table, regular bots could not join because they required approval from all "human players" (including socket bots). Socket bots are real players (not marked as `isBot`), so they were counted in the approval requirement, but they cannot approve regular bots, causing regular bots to remain pending indefinitely.

**Solution:**
- Modified `BotManager.inviteBot()` to auto-approve all bots in practice mode
- In practice mode, only the table creator can invite bots, so no approval is needed
- Regular mode still requires approval from all human players

**Files Changed:**
- `src/game/BotManager.js` (lines 102-110)

**Verification:** Regular bots now auto-approve immediately in practice mode, regardless of socket bot presence.

### ✅ Fixed: Socket Bot Invitation and Item Ante
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** MEDIUM  

**Problem:** Socket bot invitation was not working correctly, and socket bots were not submitting items for item ante automatically.

**Solution:**
- Fixed socket bot username truncation to comply with database 20-character limit
- Added explicit `checkBotsItemAnte` call after socket bot joins table
- Fixed server response emission to always emit response events even if callback is missing
- Socket bots now automatically submit items for item ante when joining practice tables

**Files Changed:**
- `src/sockets/SocketHandler.js` (lines 1254-1366)
- `src/testing/SocketBot.js` (username truncation)

**Verification:** Socket bots join successfully and automatically submit items for item ante in practice mode.

### ✅ Cleaned Up: Bot Item Ante Verbose Logging
**Status:** COMPLETED  
**Date:** February 12, 2026  
**Severity:** LOW (Code Quality Improvement)  

**Problem:** Bot item ante logging was extremely verbose, with repeated logs for every check cycle, making it difficult to see actual errors.

**Solution:**
- Removed verbose informational logs from `checkBotsItemAnte` and `_handleBotItemAnte`
- Kept only error logs for failed submissions
- Removed repetitive status logs that were spamming the console

**Files Changed:**
- `src/game/BotManager.js`

**Impact:** Bot item ante logs are now clean and only show errors when something goes wrong.

### ✅ Fixed: Unity InventoryPanel Off-Screen Positioning
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** HIGH  

**Problem:** The Unity `InventoryPanel` was being detected as off-screen, preventing items from being visible. The panel's RectTransform was not being properly positioned when the panel was activated, and the visibility check was failing for ScreenSpaceOverlay Canvas mode.

**Solution:**
- Modified `Show()` method to activate GameObject first, then reset RectTransform properties (anchorMin, anchorMax, anchoredPosition, sizeDelta, pivot) to fill the screen
- Added `LayoutRebuilder.ForceRebuildLayoutImmediate()` and `Canvas.ForceUpdateCanvases()` to force layout recalculation after positioning
- Fixed visibility check to properly handle ScreenSpaceOverlay Canvas mode (where world coordinates = screen coordinates)
- Added tolerance to visibility check to account for edge cases

**Files Changed:**
- `Assets/Scripts/UI/Components/InventoryPanel.cs` (Unity client)

**Verification:** Panel is now correctly positioned on-screen and items should be visible.

### ✅ Fixed: Unity InventoryPanel Canvas Sorting Order Restoration
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** MEDIUM  

**Problem:** When the `InventoryPanel` was opened, it increased its Canvas sorting order to 300 to render above other UI elements (like `MyChipsPanel` with sortingOrder 200). However, when the panel was closed, the sorting order was not restored, causing the Canvas to remain at 300 and cover other UI elements (like the create table layout).

**Solution:**
- Added `_originalCanvasSortingOrder` field to store the original sorting order
- Save original sorting order when panel opens (in `Show()`)
- Restore original sorting order when panel closes (in `Hide()`)

**Files Changed:**
- `Assets/Scripts/UI/Components/InventoryPanel.cs` (Unity client)

**Verification:** Closing the inventory panel no longer covers other UI elements.

### ✅ Fixed: Item Ante Items Not Awarded After Game Ends
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** HIGH  

**Problem:** When a game ended with item ante enabled, the items were being "awarded" (status changed to AWARDED) but were not actually transferred to the winner's inventory in the database. The `ItemAnte.award()` method was only returning the items but not calling `userRepo.addItem()` to persist them.

**Solution:**
- After calling `itemAnte.award()`, loop through the returned items and call `userRepo.addItem()` for each item
- Added comprehensive logging for item transfers (success and failure cases)
- Broadcast table state after items are transferred so the client sees the updated item ante status
- Added error handling with try/catch to log any database errors

**Files Changed:**
- `src/game/Table.js` (server)

**Verification:** Items are now properly transferred to the winner's inventory after a game ends. Check server logs for `[ITEM_ANTE] TRANSFER_COMPLETE` messages.

### ✅ Fixed: Item Ante Award Duplicate ID Error
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** HIGH  

**Problem:** When items were awarded after winning item ante, the transfer failed with a duplicate key error: `Duplicate entry 'b7e3df66-78ec-4b5f-a425-546444948642' for key 'PRIMARY'`. This happened because items submitted for item ante were removed from inventory, but when awarded, we tried to add them back with the same IDs.

**Solution:**
- Create new `Item` instances with new IDs when awarding items (using `new Item({...})`)
- Preserve all item properties (name, rarity, value, icon, etc.) except the ID
- Set `obtainedFrom` to indicate the item came from an item ante win
- This ensures each awarded item has a unique database ID

**Files Changed:**
- `src/game/Table.js` (server)

**Verification:** Items are now successfully transferred to the winner's inventory without duplicate ID errors. Check server logs for `[ITEM_ANTE] TRANSFER_COMPLETE` messages.

### ✅ Fixed: Unity Action Bar Not Visible During Gameplay
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** CRITICAL  

**Problem:** After the game started and players began playing, the action bar (betting controls) was not visible. The action bar was being hidden for spectators, but the visibility logic was also incorrectly hiding it for players who were actually in seats.

**Solution:**
- Added `isInSeat` check to verify player is actually in a seat (not just spectating)
- Modified action bar visibility condition to require: `_isMyTurn && isGamePhase && !isEliminated && isInSeat`
- Increased Canvas sorting order to 350 (above ItemAntePanel's 300) to ensure action bar renders on top
- Added Image component check and creation if missing
- Set panel as last sibling to bring to front
- Added comprehensive visibility diagnostics and logging
- Fixed panel width by explicitly setting anchorMin/anchorMax and forcing layout rebuild

**Files Changed:**
- `Assets/Scripts/UI/Scenes/TableScene.cs` (Unity client)

**Verification:** Action bar now appears correctly when it's the player's turn during gameplay.

### ✅ Fixed: Turns Getting Skipped (3 Bugs in Betting Round Completion)
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** CRITICAL  

**Problem:** Betting rounds were advancing instantly (flop → turn → river) without all players getting a chance to act. Server logs showed "Passed last raiser" and "Betting round complete" messages appearing prematurely, causing some players' turns to be skipped entirely.

**Root Cause:** Three separate bugs in the `bettingRoundComplete` logic in `advanceGame()`:

1. **Bug 1 - `currentIndex === lastRaiser` false positive:** At the start of new post-flop rounds, `lastRaiserIndex` was initialized to `currentPlayerIndex`. The check `currentIndex === lastRaiser` would immediately pass, marking `hasPassedLastRaiser = true` before anyone actually acted.

2. **Bug 2 - Pre-flop UTG→BB shortcut:** A special case marked the pre-flop round complete when UTG acted and the next player was BB, assuming BB had "acted" by posting a blind. This prevented BB from ever getting to act pre-flop.

3. **Bug 3 - Post-flop fallback:** A condition marked the round complete whenever `currentPlayerIndex === firstToAct` and `nextPlayer !== firstToAct`, which was always true when the first player acted, ending the round after just one player.

**Solution:**
- Removed all three faulty conditions from `advanceGame()`
- Added `playersActedThisRound` Set (initialized in `startNewHand()` and `advancePhase()`) to accurately track which players have taken a turn
- Added critical guard: `if (bettingRoundComplete && !allPlayersActed) { bettingRoundComplete = false; }` to prevent premature round completion
- Added alternative condition: `if (!bettingRoundComplete && allPlayersActed && allBetsEqualized) { bettingRoundComplete = true; }` to correctly detect completion
- Enhanced logging with `allPlayersActed`, `playersActed`, and `playersWhoCanAct` diagnostics

**Files Changed:**
- `src/game/Table.js` (`advanceGame()`, `startNewHand()`, `advancePhase()`)

**Verification:** All players now get their full turn to act in every betting round. Rounds only advance after every active player has acted and all bets are equalized.

### ✅ Fixed: Unity MyChipsPanel Not Visible
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** MEDIUM  

**Problem:** The MyChipsPanel (gold rectangle showing player's chip count) was not visible during gameplay, hidden behind other UI elements.

**Solution:**
- Set Canvas `sortingOrder` to 400 (above other UI panels)
- Call `SetAsLastSibling()` on each update
- Set `worldCamera` and `renderMode = ScreenSpaceOverlay` explicitly

**Files Changed:**
- `Assets/Scripts/UI/Scenes/TableScene.cs` (Unity client)

**Verification:** MyChipsPanel now renders correctly above all other UI elements.

### ✅ Fixed: Blind Round Timer Not Visible
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** MEDIUM  

**Problem:** The blind round timer was not showing during gameplay even though turn timers were working. The timer text was being created but was behind other UI layers.

**Solution:**
- Created `_blindTimerContainer` with its own Canvas (`sortingOrder = 450`, `renderMode = ScreenSpaceOverlay`)
- Timer displays current blind level and countdown
- Visibility controlled by container `SetActive()` state

**Files Changed:**
- `Assets/Scripts/UI/Scenes/TableScene.cs` (Unity client)

**Verification:** Blind round timer now displays above all other UI elements during gameplay.

### ✅ Fixed: Bot Item Ante Value Mismatch
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** HIGH  

**Problem:** Bots could not submit items for ante when the minimum value was set higher than 500 (the max value of their test items). Error: `Item value (500) is less than minimum required (50000)`.

**Solution:**
- Expanded bot test items to include all rarity tiers: Common (100), Uncommon (500), Rare (2000), Epic (10000), Legendary (50000)
- If no test item meets the minimum value, a custom item is dynamically created with `baseValue` matching the `minimumValue`

**Files Changed:**
- `src/game/BotManager.js`

**Verification:** Bots can now submit items for any minimum value requirement.

### ✅ Fixed: Bot Manager Log Spam
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** LOW (Quality of Life)  

**Problem:** `[BotManager] checkBotTurn: Game not started` logged ~13 times per game start, and `Invalid phase showdown` logged ~3-4 times per hand, flooding the server console.

**Solution:**
- Removed `console.log` for "Game not started" condition (normal during setup)
- Removed `console.log` for "Invalid phase showdown" condition (expected during showdown)
- Kept error-level logging for actual failures

**Files Changed:**
- `src/game/BotManager.js`

**Verification:** Server console is significantly cleaner with only meaningful log entries.

### ✅ Fixed: All-In Excess Chips Not Returned (Incorrect Pot Display)
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** CRITICAL  

**Problem:** When a player with 100M chips went all-in against an opponent with 20K, the pot displayed 100.02M for the entire hand. In real poker, the excess 99.98M should be returned immediately since no opponent can match it. The "YOU WIN!" banner also displayed 100M instead of the actual 40K contested amount.

**Root Cause:** The `allIn()` method correctly puts all chips into the pot (since at all-in time, it's unknown who will call). However, after all players acted (all all-in or folded), the excess was never returned — it sat in the pot until showdown where the side pot math handled it as a "refund award." This was:
1. Visually misleading (pot showed 100M instead of 40K)
2. Conceptually wrong (excess should be returned, not enter a "side pot")

**Solution:**
- Added `returnExcessBets()` method that calculates the 2nd-highest `totalBet` among non-folded players (the max matchable amount) and returns any excess above that to the player
- Called at **EXIT POINT 1** (all players all-in/folded) so pot display updates immediately
- Called at start of **`showdown()`** as a safety net before calculating winners
- Broadcasts state update after returning excess so clients see correct chips/pot in real-time
- Added `isRefund` flag to side pot awards for any remaining edge cases
- Modified `onHandComplete` event to send only contested winnings (excluding refunds) as `potAmount`

**Algorithm:**
```
1. Sort non-folded players by totalBet ascending
2. maxMatchable = 2nd-highest totalBet
3. For each player with totalBet > maxMatchable:
   excess = totalBet - maxMatchable
   player.chips += excess
   player.totalBet -= excess
   pot -= excess
```

**Example (2-player):**
| Step | Your Chips | Pot | Opponent |
|------|-----------|-----|----------|
| Start | 100M | 0 | 20K |
| You all-in | 0 | 100M | 20K |
| Opponent calls | 0 | 100.02M | 0 |
| returnExcessBets() | **99.98M** | **40K** | 0 |
| You win | 100.02M | 0 | 0 |
| Display: "Won 40K" ✅ | | | |

**Files Changed:**
- `src/game/Table.js` (`returnExcessBets()`, `advanceGame()` EXIT POINT 1, `showdown()`, `calculateAndAwardSidePots()`, `awardPot()`)

**Verification:** Pot now shows the correct contested amount during gameplay. "You Won" banner shows only chips won from opponents, not returned excess.

### ✅ Fixed: Double-Action Bug / Action Bar Stuck After Fold
**Status:** FIXED  
**Date:** February 12, 2026  
**Severity:** HIGH  

**Problem:** If a player clicked "Fold" (or any action), the action bar remained visible. Clicking any button again while it was still up caused a second action to be sent, resulting in "Already folded - cannot act" errors. The action bar then became permanently stuck and non-functional, even on new turns.

**Root Cause:** Client-side race condition — after sending an action, the server response hadn't arrived yet to update state, so the action panel remained active. A boolean `_actionPending` flag was unreliable because state updates could reset it inconsistently.

**Solution:**
- Removed the `_actionPending` flag approach entirely
- Added `DisableAllActionButtons()` method that sets `interactable = false` on all buttons and hides the action panel immediately after any action click
- Modified all action click handlers (`OnFoldClick`, `OnCheckClick`, `OnCallClick`, `OnBetClick`, `OnRaiseClick`, `OnAllInClick`) to call `DisableAllActionButtons()` after sending the action
- Modified `ShowActionButtons()` to explicitly set `interactable = true` on all buttons when called for a new turn

**Files Changed:**
- `Assets/Scripts/UI/Scenes/TableScene.cs` (Unity client)

**Verification:** Action bar immediately disappears after clicking any action. Buttons are re-enabled when the next turn starts.

### ✅ Fixed: Unity InventoryPanel Item Visibility (Complete Fix)
**Status:** FIXED  
**Date:** February 11, 2026  
**Severity:** CRITICAL  

**Problem:** Inventory items were not visible in the Unity client's `InventoryPanel` despite logs showing correct item creation, positioning, and sprite loading. Multiple issues were preventing items from rendering:
1. Canvas sorting order was too low (0) compared to other UI elements (MyChipsPanel at 200)
2. Panel RectTransform positioning was incorrect when activated
3. Content width was being reset to 100px instead of matching viewport width (764.7px)
4. Mask component was clipping items because Image components didn't have `maskable=true`
5. GridLayoutGroup was calculating columns with wrong width, causing items to overflow horizontally

**Solution:**
1. **Canvas Sorting Order:** Set Canvas sorting order to 300 when panel opens, restore original on close
2. **Panel Positioning:** Reset RectTransform properties (anchorMin, anchorMax, anchoredPosition, sizeDelta, pivot) AFTER activating GameObject, then force layout rebuild
3. **Content Width Fix:** 
   - Set Content width BEFORE GridLayoutGroup calculates positions (in `Show()` before `RefreshInventory()`)
   - Use multiple methods to force width: `sizeDelta`, `SetSizeWithCurrentAnchors()`, `LayoutElement.preferredWidth`
   - Verify width is applied correctly with world corners check
4. **Mask Component:** Switched from `Mask` to `RectMask2D` (more reliable, doesn't require Image component)
5. **Maskable Images:** Set `maskable=true` on all Image components (slot images, icon images, test rectangle)
6. **GridLayoutGroup Optimization:** 
   - Calculate optimal cell width to fill available space perfectly
   - Force GridLayoutGroup recalculation by disabling/enabling and calling `SetLayoutHorizontal()`/`SetLayoutVertical()`
   - Formula: `optimalCellWidth = (availableWidth - (columns - 1) * spacing) / columns`
7. **Window Resize Handler:** 
   - Added `OnRectTransformDimensionsChange()` to handle window resizing
   - Updates container width to match viewport width on resize
   - Recalculates optimal cell width after container width update
   - Ensures grid maintains proper sizing after window resize

**Files Changed:**
- `Assets/Scripts/UI/Components/InventoryPanel.cs` (Unity client)

**Key Changes:**
- Canvas sorting order management with restoration
- RectTransform positioning fix with forced layout rebuilds
- Content width pre-set in `Show()` before item creation
- Content width verification and multiple enforcement methods
- Switch from `Mask` to `RectMask2D` component
- `maskable=true` on all Image components
- GridLayoutGroup cell size optimization to fill available width
- Window resize handler with container width update and grid recalculation
- Comprehensive diagnostics for Content/Viewport positioning

**Verification:** 
- Items are now visible in a proper grid layout
- Grid fills available width with optimal cell sizing
- Items wrap correctly to next row instead of overflowing horizontally
- No items are clipped by Mask component
- Grid maintains proper sizing after window resize

### ✅ Fixed: Unity InventoryPanel Missing in MainMenuScene
**Status:** FIXED  
**Date:** February 11, 2026  
**Severity:** MEDIUM  

**Problem:** The `InventoryPanel` button in `MainMenuScene` was not functional - clicking it did nothing because `OnInventoryClick()` was just a TODO comment.

**Solution:**
- Implemented `OnInventoryClick()` in `MainMenuScene.cs` to match the working implementation in `LobbyScene.cs`
- Added `_inventoryPanel` field to store the panel instance
- Creates panel on first click, reuses on subsequent clicks
- Cleans up reference when panel is closed

**Files Changed:**
- `Assets/Scripts/UI/Scenes/MainMenuScene.cs` (Unity client)

**Verification:** Inventory panel now opens and displays items correctly in MainMenuScene.

## Known Issues

### Critical: Missing Chips / Money Loss
**Status:** Active investigation  
**Severity:** CRITICAL  
**Affects:** All game modes (normal, practice, simulation)

**Issues:**
1. **Pot not cleared at hand start** (40+ instances)
   - Pot carries over between hands
   - Causes validation failures and chip accounting errors
   - Chips appear "missing" when actually in leftover pot

2. **Chips lost during betting** (CRITICAL)
   - Pot < sum of all totalBets
   - Chips subtracted from players but not added to pot
   - Example: Missing 38,012 chips (totalStartingChips: 294,400, actual: 256,388)

3. **Cumulative chip loss**
   - Missing chips accumulate across hands (21K → 35K → 38K)
   - Chips disappear from the system permanently

**See:** `ISSUES_FOUND.md` and `SIMULATION_ANALYSIS.md` for detailed analysis

### Item Ante ("For Keeps") System
**Status:** Mostly working (Feb 12, 2026)  
**Severity:** LOW  
**Affects:** Tables with item ante enabled

**Resolved Issues:**
- ✅ Spectator prompt suppression
- ✅ Missing item fields for Unity display
- ✅ Item filtering/highlighting by gambleable status and minimum value
- ✅ Bot item ante submission in practice mode
- ✅ Socket bot invitation and auto-submission
- ✅ Item ante award transfer to winner's inventory (with unique IDs)
- ✅ Item ante pot real-time display (including creator item)
- ✅ Bot value mismatch (bots can meet any minimum value)

**Remaining Edge Cases:**
- Item not found in inventory (if item was traded/consumed between selection and submission)

**See:** `src/game/ItemAnte.js` and `src/game/BotManager.js`

## Upcoming Changes (Planned)

### Item Economy Overhaul (In Planning - Feb 12, 2026)

**Goal:** Implement a complete legal, sustainable, and scalable item economy system to support thousands of users while generating revenue through ads and optional microtransactions.

**Key Changes:**
1. **Power Score System**
   - Replace dollar values with prestige-based "Power Score"
   - Formula: `Power = (Rarity × Drop Rate × Demand)`
   - Items valued by rarity/scarcity instead of real money

2. **Dual Item System**
   - **Gambleable Items** (earned only): Can be used in Item Ante, tradeable, no cash value
   - **Store Items** (purchased): Cannot be gambled, account-bound, cosmetic only
   - Add `isGambleable` flag to Item model

3. **Table Creator Sets Minimum**
   - Creator selects ante item at table creation
   - Item's Power Score becomes locked minimum for entire table session
   - Minimum persists even if creator leaves/eliminated
   - UI shows minimum in lobby and during game

4. **Chip Purchase System (One-Way)**
   - Players can buy chips with real money
   - Chips CANNOT be sold back (legal compliance)
   - Chips can be earned free through gameplay

5. **Store Items Cannot Be Gambled**
   - Enforce `isGambleable: false` for purchased items
   - Gray out store items in Item Ante selection
   - Clear messaging: "Store items cannot be gambled"

6. **Revenue Streams**
   - Primary: Ads (interstitial, rewarded video, banners)
   - Secondary: Premium membership ($4.99/mo)
   - Tertiary: Cosmetic store, optional chip packs

**Legal Compliance:**
- No real-money gambling (gambleable items have zero cash value)
- Store items cannot be gambled (separation of concerns)
- Chips one-way only (can buy, cannot sell = not gambling)

**Implementation Status:**
✅ **COMPLETED:**

**Server-Side (poker-server):**
1. Power Score calculation (`calculatePowerScore()`, `calculateDropRate()`, `calculateDemand()`)
2. `isGambleable` flag enforcement (store items automatically set to `false`)
3. Database schema updated (power_score, source, drop_rate, demand columns)
4. ItemAnte uses `minimumPowerScore` for validation
5. Table-level minimum item (persists even if creator leaves)
6. Bot logic updated to use Power Score for item ante
7. SocketHandler fetches minimumAnteItem from database
8. EXIT POINT 0b (skip to showdown when only 1 player can act)
9. Practice Mode Protection (items virtual, not transferred)
10. Bot Protection (skip transfer for bots, no user record)
11. `raisesThisRound` in TableState for UI validation
12. Bot Dead Streets Intelligence (don't raise when all opponents folded/all-in)
13. Bot Smart Fallback (call → check → fold)

**Client-Side (poker-client-unity):**
1. NetworkModels: All Power Score fields (ItemInfo, TableInfo, TableState, SidePotState, SidePotItem)
2. GameService: `minimumAnteItem` parameter in CreateTable()
3. TableScene: Display ⚡PowerScore in item ante prompts
4. InventoryPanel: Filter by Power Score, display ⚡powerScore in item ante mode
5. LobbyScene: Minimum ante item selection UI (141 lines restored)
   - Select item button, display selected item with Power Score
   - Show/hide logic with Item Ante and Simulation toggles
   - Display ⚡PowerScore+ in lobby table list
6. Action panel diagnostic logging for troubleshooting

**Git Safety:**
- AGENT_RULES.md LAW 1 updated: Check `git status` before `git pull` to prevent data loss

🔄 **PENDING:**
- Store item restrictions UI (shop interface)
- Chip purchasing system
- Ads integration
- Premium membership

**Status:** Power Score system 100% implemented and restored ✅
**Note:** System was fully implemented, accidentally reverted (commit a996f8b), and fully restored (commits 3157410 + 594b741)

## License

MIT









