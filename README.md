# Poker Server

Real-time multiplayer Texas Hold'em poker server built with Node.js and Socket.IO.

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

## License

MIT


