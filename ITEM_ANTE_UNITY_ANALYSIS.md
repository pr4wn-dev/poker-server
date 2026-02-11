# Item Ante Unity Implementation Analysis

## Answers to Debugging Questions

### 1. Does Unity call `get_inventory` when item ante menu opens?

**YES** ✅

**Location:** `Assets/Scripts/UI/Components/InventoryPanel.cs:213`

**Flow:**
1. When `needsItemAnteSubmission` becomes `true`, Unity calls `ShowItemAnteSelectionPrompt()` (TableScene.cs:1749)
2. This creates/shows an `InventoryPanel` (TableScene.cs:1267)
3. `InventoryPanel.Show()` calls `RefreshInventory()` (InventoryPanel.cs:188)
4. `RefreshInventory()` calls `_gameService.GetInventory()` (InventoryPanel.cs:213)

**Code Reference:**
```csharp
// InventoryPanel.cs:184-226
public void Show()
{
    _gameService = GameService.Instance;
    gameObject.SetActive(true);
    RefreshInventory();  // <-- Calls get_inventory
}

private void RefreshInventory()
{
    _gameService.GetInventory(items =>  // <-- Emits "get_inventory" socket event
    {
        if (items == null || items.Count == 0)
        {
            Debug.Log("[InventoryPanel] Inventory is empty");
            return;
        }
        
        foreach (var item in items)
        {
            CreateItemSlot(item);
        }
    });
}
```

---

### 2. Are items filtered to `isGambleable: true`?

**NO** ❌ **THIS IS A BUG**

**Current Behavior:**
- `InventoryPanel` displays **ALL items** from inventory
- No filtering is applied for `isGambleable`
- Items that shouldn't be gambled are still shown

**Expected Behavior (per INVENTORY_IMPLEMENTATION_GUIDE.md:116):**
- Filter to show only `isGambleable: true` items
- Highlight items that meet minimum value requirement

**Fix Needed:**
```csharp
// In InventoryPanel.cs RefreshInventory(), add filtering:
_gameService.GetInventory(items =>
{
    if (items == null || items.Count == 0) return;
    
    // FILTER: Only show gambleable items for item ante
    var gambleableItems = items.Where(item => item.isGambleable).ToList();
    
    foreach (var item in gambleableItems)
    {
        CreateItemSlot(item);
    }
});
```

---

### 3. Does Unity use `templateId` or `icon` to load sprites?

**Unity uses `icon` field (NOT `templateId`)** ✅

**Location:** 
- `InventoryPanel.cs:248` - `LoadItemIcon(item.icon)`
- `TableScene.cs:1174` - `LoadItemIcon(string iconName)`

**Sprite Loading Logic:**
```csharp
// InventoryPanel.cs:286-298
private Sprite LoadItemIcon(string iconName)
{
    if (string.IsNullOrEmpty(iconName)) return null;
    
    // Try to load from Resources/Items/{iconName}
    var sprite = Resources.Load<Sprite>($"Items/{iconName}");
    if (sprite == null)
    {
        // Try without path
        sprite = Resources.Load<Sprite>(iconName);
    }
    return sprite;
}
```

**Paths Checked:**
1. `Resources/Items/{iconName}` (e.g., `Resources/Items/card_back_flame`)
2. `Resources/{iconName}` (fallback)

**Note:** `templateId` is stored in the `Item` class (NetworkModels.cs:239) but is **NOT used** for sprite loading. Unity only uses the `icon` field.

---

### 4. Check Unity console for any errors when loading item sprites

**Unity has built-in error reporting** ✅

**Location:** `TableScene.cs:1174-1248`

**Error Reporting:**
- Unity reports icon loading failures to the server via `_gameService.ReportIconLoadingIssue()`
- Logs include:
  - `operation`: "LoadItemIcon_FAILED"
  - `iconName`: The icon name that failed
  - `attemptedPath1`: `Items/{iconName}`
  - `attemptedPath2`: `{iconName}`
  - `error`: "Sprite not found in Resources - checked both paths"

**What to Check:**
1. Unity Console for `[TableScene]` or `[InventoryPanel]` errors
2. Server logs for `ReportIconLoadingIssue` events
3. Verify sprite assets exist in Unity project at:
   - `Assets/Resources/Items/{iconName}.png` (or .jpg, etc.)

---

### 5. Verify items have `templateId` in the response

**YES** ✅ (After our server-side fixes)

**Server Side:**
- `UserRepository.getInventory()` returns items with `templateId` (UserRepository.js:440)
- `ItemAnte.getState()` now includes `templateId` in all item objects (ItemAnte.js:518, 531, etc.)
- `side_pot_started` and `side_pot_submission` events now send formatted items with `templateId` (SocketHandler.js:1788, 1830)

**Unity Side:**
- `NetworkModels.Item` class has `templateId` field (NetworkModels.cs:239)
- Unity receives `templateId` but doesn't use it for sprite loading (uses `icon` instead)

**Verification:**
- Check server logs for `[INVENTORY] GET_INVENTORY_RESPONSE` to see if items have `templateId`
- Check Unity debug logs when `get_inventory` response is received

---

## Summary of Issues Found

### ✅ Fixed (Server-Side)
1. Missing `templateId` in item ante state
2. Missing `description`, `isGambleable`, `isTradeable`, `obtainedFrom` in item ante state
3. `side_pot_started` event not sending formatted items
4. `side_pot_submission` event not sending formatted items

### ❌ Still Needs Fix (Unity-Side)
1. **Items not filtered by `isGambleable`** - Unity shows ALL items, not just gambleable ones
2. **Sprite assets may be missing** - Unity tries to load from `Resources/Items/{iconName}` but sprites might not exist
3. **No minimum value filtering** - Unity doesn't filter items by minimum value requirement

---

## Recommended Next Steps

1. **Check Unity Console** for sprite loading errors
2. **Verify sprite assets exist** in Unity project at `Assets/Resources/Items/`
3. **Add filtering** in Unity to only show `isGambleable: true` items
4. **Add minimum value filtering** to highlight/disable items below minimum value
5. **Test with actual items** that have valid `icon` values matching Unity sprite assets

---

## Server Logs to Monitor

When testing, check server logs for:
- `[INVENTORY] GET_INVENTORY_RESPONSE` - Shows what items Unity receives
- `[ITEM_ANTE] SIDE_POT_STARTED_EMIT` - Shows formatted creatorItem being sent
- `[ITEM_ANTE] SIDE_POT_SUBMISSION_EMIT` - Shows formatted item being sent
- `ReportIconLoadingIssue` events from Unity (if sprites fail to load)
