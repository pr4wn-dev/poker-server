# Permanent Learning System - Known Issue

## Problem
Arrays in `learning.knowledge` and `learning.improvements` are not persisting to disk correctly. They are stored correctly in memory, but when saved to `logs/ai-state-store.json`, they become empty arrays.

## Status
- ✅ Arrays are correctly stored in memory
- ✅ Backup arrays are created correctly (length > 0)
- ✅ Direct file write works (manual test confirms)
- ❌ `save()` method writes empty arrays to file

## Root Cause
The `save()` method in `StateStore.js` is not correctly preserving arrays during serialization/write. Multiple safeguards have been added, but arrays still become empty in the file.

## Working Solution
Direct file write bypassing `save()` works:
```javascript
const backup = JSON.parse(JSON.stringify(stateStore.getState('learning.knowledge')));
const serialized = stateStore._serializeState(stateStore.state);
serialized.learning = serialized.learning || {};
serialized.learning.knowledge = backup;
const data = {state: serialized, timestamp: Date.now()};
data.state.learning.knowledge = backup;
fs.writeFileSync('logs/ai-state-store.json', JSON.stringify(data, null, 2), 'utf8');
```

## Next Steps
1. Investigate why `save()` method loses arrays even with multiple safeguards
2. Consider using direct file write as a workaround
3. Check if `_serializeState` is converting arrays to empty objects
4. Verify if auto-save interval is overwriting arrays after manual save
