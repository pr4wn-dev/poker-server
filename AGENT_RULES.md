# Project Conventions

## Socket.IO Pattern (CRITICAL)
Server MUST emit BOTH callback AND event for every handler:
```javascript
if (callback) callback(response);
socket.emit('event_name_response', response);
```

## Response Classes
All response/model classes go in `NetworkModels.cs` only. Never in `GameService.cs`.

## Commits
Commit and push after completing changes. Don't wait to be asked.

## Documentation
Issues and solutions go in `CHANGELOG.md`. Search it before debugging.

## PowerShell
Use separate commands instead of `&&` (not supported in older PS versions).
