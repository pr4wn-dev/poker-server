# Inventory System Implementation Guide

## Overview

The server has a complete inventory system that stores items in the database. This guide explains what Unity needs to implement to display and interact with the inventory.

---

## Server-Side (Already Implemented ✅)

### Database
- `inventory` table stores all items per user
- Items have: id, name, description, type, rarity, icon, baseValue, etc.

### API Endpoints
- `get_inventory` - Get player's inventory
- `get_test_items` - Add test items to inventory (for development)
- `get_profile` - Returns full profile including inventory

### Item Properties Sent to Client
```json
{
  "id": "uuid",
  "templateId": "CARD_BACK_FLAME",
  "name": "Flame Card Back",
  "description": "Cards with fiery edges",
  "type": "card_back",
  "rarity": "uncommon",
  "icon": "card_back_flame",
  "baseValue": 500,
  "isGambleable": true,
  "isTradeable": true,
  "obtainedFrom": "Boss Name"
}
```

---

## Unity Client Implementation Needed

### 1. Inventory Button/Icon
**Location:** Main game UI (lobby, table view, etc.)

**Requirements:**
- Visible button/icon to open inventory
- Should be accessible from most screens
- Consider using a backpack/bag icon

**Implementation:**
```csharp
// Example: Add button to UI
public Button inventoryButton;

void Start() {
    inventoryButton.onClick.AddListener(OpenInventory);
}

void OpenInventory() {
    // Request inventory from server
    socket.Emit("get_inventory");
}
```

### 2. Inventory UI Panel
**Requirements:**
- Grid/list view of items
- Show item icon, name, rarity
- Filter by type (card_back, avatar, trophy, etc.)
- Sort by rarity, value, or name
- Show item details on hover/click

**Item Display:**
- **Icon:** Use `item.icon` string to load sprite from Resources/Sprites
- **Name:** `item.name`
- **Rarity Color:** Use rarity to color border/background
  - Common: Gray (#9d9d9d)
  - Uncommon: Green (#1eff00)
  - Rare: Blue (#0070dd)
  - Epic: Purple (#a335ee)
  - Legendary: Orange (#ff8000)
- **Value:** Show `item.baseValue` for item ante

### 3. Item Icon Asset Mapping
**Current Icon Names in Server:**
- Card Backs: `card_back_flame`, `card_back_golden`, `card_back_diamond`, `card_back_holo`
- Avatars: `avatar_shark`, `avatar_wolf`, `avatar_dragon`, `avatar_legend`
- Trophies: `trophy_bronze`, `trophy_silver`, `trophy_gold`
- Keys: `key_yacht`, `key_island`, `key_mystery`, `key_underground`
- Vehicles: `vehicle_speedboat`, `vehicle_yacht_gold`, `vehicle_jet`
- XP Chips: `xp_chip_small`, `xp_chip_medium`, `xp_chip_large`, `xp_jackpot`
- Table Skins: `table_velvet`, `table_gold`
- Chip Styles: `chips_casino`, `chips_platinum`

**Unity Implementation:**
```csharp
// Option 1: Resources folder
Sprite GetItemIcon(string iconName) {
    return Resources.Load<Sprite>($"Items/{iconName}");
}

// Option 2: Addressables
Sprite GetItemIcon(string iconName) {
    return Addressables.LoadAssetAsync<Sprite>($"Items/{iconName}").WaitForCompletion();
}

// Option 3: Dictionary mapping
Dictionary<string, Sprite> iconMap;
Sprite GetItemIcon(string iconName) {
    return iconMap.ContainsKey(iconName) ? iconMap[iconName] : defaultItemIcon;
}
```

### 4. Item Ante Integration
When item ante is enabled and player needs to submit:
1. Show inventory UI
2. Filter to show only `isGambleable: true` items
3. Highlight items that meet minimum value requirement
4. Allow player to select item
5. Send `start_side_pot` or `submit_to_side_pot` with `itemId`

---

## Testing the Inventory

### Option 1: Use Test Items Endpoint
```csharp
// In Unity, call this to get test items
socket.Emit("get_test_items", (response) => {
    if (response.success) {
        // Refresh inventory display
        RefreshInventory();
    }
});
```

This adds 20+ test items across all rarities to your inventory.

### Option 2: Defeat Bosses in Adventure Mode
- Play adventure mode
- Defeat bosses
- Items are automatically added to inventory

### Option 3: Win Tournaments
- Join tournaments with item prizes
- Win to get items

---

## Socket Events Reference

### Client → Server
- `get_inventory` - Get player's inventory
  - Response: `get_inventory_response` with `{ success: true, inventory: [...] }`
  
- `get_test_items` - Add test items (development only)
  - Response: `get_test_items_response` with `{ success: true, inventory: [...] }`

### Server → Client
- `get_inventory_response` - Inventory data
- `get_test_items_response` - Test items added confirmation

---

## Recommended Unity Asset Structure

```
Assets/
  Resources/
    Items/
      Icons/
        card_back_flame.png
        card_back_golden.png
        avatar_shark.png
        trophy_bronze.png
        ... (all icon names)
```

Or use Addressables for better performance.

---

## Quick Start Checklist

- [ ] Add inventory button to main UI
- [ ] Create inventory panel UI
- [ ] Implement `get_inventory` socket listener
- [ ] Create item icon mapping system
- [ ] Display items in grid/list
- [ ] Add rarity color coding
- [ ] Test with `get_test_items` endpoint
- [ ] Integrate with item ante selection

---

## Example Unity Code Structure

```csharp
public class InventoryManager : MonoBehaviour {
    public GameObject inventoryPanel;
    public Transform itemGrid;
    public GameObject itemPrefab;
    
    private List<ItemData> currentInventory = new List<ItemData>();
    
    void OnEnable() {
        SocketManager.Instance.On("get_inventory_response", OnInventoryReceived);
    }
    
    public void OpenInventory() {
        inventoryPanel.SetActive(true);
        SocketManager.Instance.Emit("get_inventory");
    }
    
    void OnInventoryReceived(string json) {
        var response = JsonUtility.FromJson<InventoryResponse>(json);
        currentInventory = response.inventory;
        DisplayItems();
    }
    
    void DisplayItems() {
        foreach (var item in currentInventory) {
            var itemUI = Instantiate(itemPrefab, itemGrid);
            itemUI.GetComponent<ItemUI>().Setup(item);
        }
    }
}
```

---

**Note:** The server sends icon names as strings. Unity needs to map these to actual sprite assets. If you have different asset names, we can update the server to match your Unity assets.
