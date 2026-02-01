# Changelog - Issues & Solutions

This file tracks all issues encountered and their solutions. **Search this file first** before debugging.

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

