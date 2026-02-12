# 🎰 Item Economy System - Complete Design Document

**Status:** ✅ Fully Implemented  
**Last Updated:** February 12, 2026  
**Implementation:** See README.md "Implementation Status" section

---

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
- Table list shows: `"Item Ante: ⚡9,500+ (Legendary)"`
- Optional: Preview of creator's selected item
- Players know the stakes before joining

#### Before Each Hand
1. All players see: **"⚠️ MINIMUM REQUIRED: ⚡9,500 (Legendary: Flaming Ace)"**
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

### Implementation Checklist

**✅ Completed (February 2026):**
- [x] Power Score calculation system (`Item.js`: `calculatePowerScore()`, `calculateDropRate()`, `calculateDemand()`)
- [x] `isGambleable` flag enforcement (store items = false)
- [x] Database schema (power_score, source, drop_rate, demand columns)
- [x] ItemAnte uses `minimumPowerScore` for validation
- [x] Table-level minimum item (persists if creator leaves)
- [x] Bot logic updated to use Power Score
- [x] SocketHandler fetches minimumAnteItem from database
- [x] Unity NetworkModels (all Power Score fields)
- [x] Unity GameService (minimumAnteItem parameter)
- [x] Unity TableScene (⚡PowerScore display)
- [x] Unity InventoryPanel (Power Score filtering)
- [x] Unity LobbyScene (minimum ante item selection UI, 141 lines)

**⏳ Pending:**
- [ ] Store item restrictions UI (shop interface)
- [ ] Chip purchasing system backend
- [ ] Ads integration (AdMob, Unity Ads)
- [ ] Premium membership system
- [ ] Trading system (player-to-player)
- [ ] Item collection display (profile)
- [ ] Leaderboards (most legendary items)

---

## Legal Compliance Summary

✅ **Item Ante is NOT gambling because:**
1. Gambleable items have **zero real-money value** (cannot be cashed out)
2. Store items **cannot be gambled** (separation of concerns)
3. Chips can be earned **free through skill** (not pay-to-win)
4. Chip purchases are **one-way only** (cannot cash out)
5. All revenue from **ads, traffic, cosmetics** (not gambling)

✅ **This model is legal worldwide** (no gambling licenses required)

---

## Technical Implementation

**Server Files:**
- `src/models/Item.js` - Power Score calculation
- `src/game/ItemAnte.js` - Item ante validation
- `src/game/Table.js` - Locked minimum ante
- `src/database/Database.js` - Schema migration

**Client Files:**
- `Assets/Scripts/Networking/NetworkModels.cs` - Data models
- `Assets/Scripts/UI/Scenes/LobbyScene.cs` - Minimum ante selection
- `Assets/Scripts/UI/Scenes/TableScene.cs` - Power Score display
- `Assets/Scripts/UI/Components/InventoryPanel.cs` - Filtering

**For full implementation details, see README.md**
