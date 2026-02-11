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









