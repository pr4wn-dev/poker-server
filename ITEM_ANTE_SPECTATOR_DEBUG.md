# Item Ante Spectator Viewing Issue - Debug Guide

## Problem
User (spectator) can't see items in item ante panel. Status shows "locked" (game has started).

## Possible Causes

### 1. **No Items Were Submitted** (Most Likely)
- If status is "locked" but `approvedItems` is empty, it means no players submitted items before the game started
- **Check:** Unity Console will now show: `"approvedItems is empty! No items were submitted to item ante."`
- **Solution:** Players need to submit items during the "collecting" phase (before game starts)

### 2. **Items Missing Icon Field**
- Items might have been submitted but don't have the `icon` field set
- **Check:** Unity Console will show: `"Processing item 'X' (icon: NULL, ...)"`
- **Solution:** Items need `icon` field when submitted (should be set from inventory)

### 3. **Items Not Being Sent to Client**
- Server might not be sending `approvedItems` in the state
- **Check:** Unity Console will show: `"approvedItems count = 0"` or `"approvedItems is null"`
- **Solution:** Check server logs for `[ITEM_ANTE]` events

## Debug Steps

### Step 1: Check Unity Console
When you click the item ante button, check Unity Console for:
```
[TableScene] ShowItemAntePanel: approvedItems count = X, status = locked
```

**If count = 0:**
- No items were submitted before game started
- This is expected if players didn't submit items during collection phase

**If count > 0:**
- Items were submitted, check next step

### Step 2: Check Item Data
Look for logs like:
```
[TableScene] ShowItemAntePanel: Processing item 'ItemName' (icon: iconName, rarity: rarity, value: value)
```

**If icon is NULL:**
- Items don't have icon field set
- Check server logs to see what was submitted

**If icon has value:**
- Items have icons, check sprite loading

### Step 3: Check Sprite Loading
Look for logs like:
```
[TableScene] CreateItemAnteSlot_SUCCESS: itemName=..., iconName=...
```
or
```
[TableScene] CreateItemAnteSlot_FAILED: itemName=..., iconName=..., error=...
```

**If FAILED:**
- Sprite not found in `Resources/Items/{iconName}`
- Check if sprite file exists in Unity project

## Expected Behavior

### When Status = "locked":
- Game has started
- No more items can be submitted
- Items that were submitted should be visible in the panel
- If no items were submitted, panel should show "No items were submitted to this item ante."

### For Spectators:
- Spectators can view item ante panel (read-only)
- Spectators cannot submit items
- Spectators see the same items as players

## What to Check Next

1. **Unity Console Logs:**
   - What does `approvedItems count` show?
   - Are there any items being processed?
   - Are there sprite loading errors?

2. **Server Logs:**
   - Check for `[ITEM_ANTE] STARTED` - was item ante started?
   - Check for `[ITEM_ANTE] SUBMISSION_APPROVED` - were items submitted?
   - Check for `[ITEM_ANTE] LOCKED` - when did it lock?

3. **Game State:**
   - Did players actually submit items before the game started?
   - Was item ante enabled when the table was created?
   - Did the game start before players could submit items?

## Quick Test

To test if items show when they exist:
1. Create a new table with item ante enabled
2. As a player (not spectator), submit an item before game starts
3. Start the game (status becomes "locked")
4. As spectator, click item ante button
5. You should see the item(s) that were submitted

If items still don't show after this test, the issue is likely:
- Sprite loading (check Unity Console for sprite errors)
- Item data missing fields (check Unity Console for item data logs)
