# Poker Server

Real-time multiplayer Texas Hold'em poker server built with Node.js and Socket.IO.

## Documentation

- **[INSTALL.md](INSTALL.md)** - Setup and installation guide
- **[AGENT_RULES.md](AGENT_RULES.md)** - Rules for AI agents working on this project
- **[CHANGELOG.md](CHANGELOG.md)** - Issues encountered and solutions (search this first!)
- **[TESTING.md](TESTING.md)** - Testing guide: unit tests, simulation comparison, state snapshots
- **[UI_BEST_PRACTICES.md](UI_BEST_PRACTICES.md)** - UI component best practices: position locking, animations, layout handling

## Features

- 🎴 Full Texas Hold'em game logic
- 🔌 Real-time WebSocket communication (Socket.IO)
- 👥 Multi-table support
- 🎮 Designed for Unity client integration
- 🔒 Per-player card visibility (no cheating!)

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
│   ├── server.js           # Entry point
│   ├── game/
│   │   ├── GameManager.js  # Manages tables & players
│   │   ├── Table.js        # Table & game state
│   │   ├── Deck.js         # Card deck
│   │   └── HandEvaluator.js# Hand ranking
│   └── sockets/
│       ├── SocketHandler.js # WebSocket events
│       └── Events.js       # Event documentation
├── env.example             # Environment template
└── package.json
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

**Server → Client:**
- `table_state` - Game state update
- `player_action` - Action notification
- `player_joined/left` - Player events

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
- Comprehensive diagnostics for Content/Viewport positioning

**Verification:** 
- Items are now visible in a proper grid layout
- Grid fills available width with optimal cell sizing
- Items wrap correctly to next row instead of overflowing horizontally
- No items are clipped by Mask component

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
**Status:** Active development  
**Severity:** MEDIUM  
**Affects:** Tables with item ante enabled

**Issues:**
- Null reference errors in item ante handling
- Item validation problems
- Missing field errors (Unity client compatibility)
- Item not found in inventory edge cases

**See:** `src/game/ItemAnte.js` and `scripts/watch-logs-and-fix.js` for current fixes

## License

MIT









