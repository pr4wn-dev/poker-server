# Combat System Design — Post-Game PvP

> Replaces the old Robbery & Karma system with a narratively coherent "Wild West showdown after a heated poker game" PvP system.

---

## Overview

After a poker game, players can **challenge** someone they played with to a fight. The system auto-picks matched items from both players and puts half the loser's chips on the line. The target can fight back or flee. Combat resolves automatically based on character stats, equipped items, and crew backup.

**Why this exists:** Poker creates tension. Combat lets players act on it. Every other system (characters, items, crews, adventure) becomes more meaningful because it feeds into combat power.

---

## Core Flow

```
Poker Game Ends
    ↓
Challenge Window Opens (5 minutes)
    ↓
Challenger picks a target (anyone they played with)
    ↓
System auto-picks a random gambleable item from challenger
System finds closest Power Score match from target
    ↓
Target sees challenge popup:
  "[Player] is calling you out!"
  "At stake: [Your Item] vs [Their Item] + chips"
    ↓
Target chooses:
  🤜 FIGHT → Combat resolves → Winner takes all
  🏃 FLEE  → Pay 10% chips, keep items, get "Coward" tag
  ⏰ TIMEOUT (30 sec) → Auto-FLEE
  📴 DISCONNECT → Auto-LOSE (treated as fight loss)
```

---

## Stakes

### Automatic Item Selection
When Player A challenges Player B:

1. System picks a **random gambleable item** from Player A's inventory
2. System finds the **closest Power Score match** from Player B's inventory
3. Both items go into the pot automatically — players don't choose

**Item matching rules:**
- Match within ±30% Power Score of the challenger's item
- If no match within range, pick the closest available item anyway
- If Power Score gap exceeds 5×, downgrade to **chips-only fight**
- **Store-purchased items are NEVER at risk** (legal compliance)

### Chip Stakes
- Winner takes **half the loser's current chip balance**
- This is calculated at fight resolution, not at challenge time

### If No Items
- If challenger has 0 gambleable items → chips-only fight
- If target has 0 gambleable items → chips-only fight
- If both have 0 gambleable items → chips-only fight
- Chips-only fights are still valid and can be initiated

---

## Player Choices

### Fight
Accept the challenge. Combat resolves. Winner takes:
- Both wagered items (theirs back + opponent's)
- Half the loser's chip balance
- +1 Notoriety
- Crew XP (if in a crew)

Loser:
- Loses their wagered item
- Loses half their chips
- Gets "Bruised" status (1 hour — can't be challenged again)
- Small XP consolation prize

### Flee
Decline the fight. Pay a coward tax:
- Lose **10% of your current chips**
- Keep all items
- Get "Coward" tag for 1 hour (cosmetic, visible at table seats)
- Challenger gets the 10% as consolation

### Timeout (30 seconds)
If target doesn't respond within 30 seconds → **auto-flee** with same penalties as fleeing.

### Disconnect
If target goes offline during the challenge window → **auto-LOSE**. Treated as a full fight loss:
- Lose the matched item
- Lose half their chips
- Challenger wins everything

**Rationale:** Without this, players would just close the app to dodge every fight. Going offline = you lost the fight.

---

## Combat Resolution

No mini-game. Auto-resolved with a dramatic 3-second animation.

### Combat Score Formula

```
Combat Score = Character Base Stats (ATK + DEF + SPD)
             + Equipped Item Combat Bonuses (sum of all 6 slots)
             + Crew Backup Bonus (+2 per online crew member, max +10)
             + Notoriety Bonus (+1 per 10 notoriety, max +5)
             + Random Roll (base score × random between 0.80 and 1.20)
```

**Higher score wins.** The ±20% random roll means upsets happen — a weaker player can still win ~30% of the time.

### Character Combat Stats

Each of the 10 characters gets base ATK / DEF / SPD. Rarer characters have higher totals but with distinct tradeoffs (glass cannon vs tank vs balanced).

| Rarity | Total Base Stats | Example Distribution |
|--------|-----------------|---------------------|
| Common | 15 | ATK 5, DEF 5, SPD 5 |
| Uncommon | 18 | ATK 7, DEF 5, SPD 6 |
| Rare | 21 | ATK 6, DEF 8, SPD 7 |
| Epic | 24 | ATK 9, DEF 7, SPD 8 |
| Legendary | 27 | ATK 10, DEF 8, SPD 9 |
| Mythic | 30 | ATK 10, DEF 10, SPD 10 |

> Actual per-character stat spreads TBD when we implement. Each character should feel distinct — some are fighters (high ATK), some are tanks (high DEF), some are runners (high SPD, better flee success?).

### Item Combat Bonuses

Each item template gets a small combat bonus based on its type/category:

| Item Category | Bonus Type | Common | Uncommon | Rare | Epic | Legendary |
|--------------|-----------|--------|----------|------|------|-----------|
| Weapon | +ATK | +1 | +2 | +3 | +4 | +5 |
| Armor | +DEF | +1 | +2 | +3 | +4 | +5 |
| Accessory | +ATK, +SPD | +1 ea | +1 ea | +2, +1 | +2, +2 | +3, +2 |
| Tool | +SPD | +1 | +2 | +3 | +4 | +5 |
| Consumable | No bonus | — | — | — | — | — |

A fully-equipped player with 6 Legendary items would get up to +30 combat bonus. A naked player gets +0. **Gear matters.**

### Crew Backup

If you're in a crew and crew members are currently online:
- +2 combat score per online crew member
- Maximum +10 (5 members)
- Crew earns XP when backing up a member in combat
- **Cannot challenge your own crewmates** (friendly fire protection)

This makes crews **essential** for serious fighters. A solo player vs a full crew has a significant disadvantage.

---

## Notoriety System (Replaces Karma)

Notoriety is a **lifetime combat reputation score**. It goes up, never down.

| Notoriety | Title | Visual at Seat |
|-----------|-------|---------------|
| 0–5 | Civilian | Nothing |
| 6–15 | Troublemaker | Small skull icon |
| 16–30 | Outlaw | Skull + crossbones |
| 31–50 | Gunslinger | Flaming skull |
| 51+ | Most Wanted | Animated skull with glow |

**How you earn it:**
- +1 per combat win
- +0.5 per combat loss (you still showed up to fight)
- +0 for fleeing

**Mechanical effect:**
- +1 combat bonus per 10 notoriety (max +5 at 50+ notoriety)
- Purely cosmetic beyond that — high notoriety does NOT make you more targetable
- Displayed at table seats, player profiles, and leaderboards

**What it replaces:**
The old Karma/Heart system tracked "goodness" and made pure-hearted players invisible to criminals. That's gone. Notoriety is a **flex stat** — it shows you've been in fights. No one is protected or punished by it.

---

## Challenge Rules & Limits

| Rule | Detail |
|------|--------|
| **Who can you challenge?** | Only players you played poker with in the last 5 minutes |
| **Challenge window** | 5 minutes after the hand/game ends |
| **Response timeout** | 30 seconds to Fight or Flee (then auto-flee) |
| **Disconnect during challenge** | Auto-LOSE (full fight loss penalties) |
| **Cooldown per target** | 1 challenge per player per 24 hours |
| **Bruised protection** | Can't be challenged for 1 hour after losing a fight |
| **Coward tag** | Visible for 1 hour after fleeing (cosmetic only) |
| **Minimum chips to be challenged** | Must have ≥ 1,000 chips (poverty protection) |
| **Crew immunity** | Can't challenge members of your own crew |
| **Multiple challenges** | Can challenge multiple different players from the same game, but one at a time |

---

## How It Ties Into Other Systems

| System | Connection |
|--------|-----------|
| **Poker** | Creates the tension. You just lost 50K → you want revenge. Challenge window only opens after a game |
| **Characters** | Each has unique combat stats (ATK/DEF/SPD). Rarer characters = stronger fighters. Adventure character drops now REALLY matter |
| **Items** | Equipped items give combat bonuses. Items are at stake in fights. Inventory management matters |
| **Crews** | Online crew members = combat backup. Crew XP from fights. Can't fight crewmates. Makes crews essential |
| **For Keeps** | Still exists separately as voluntary item-ante poker. Combat is the "dark alley after the card game" version |
| **Adventure** | Where you grind items and unlock characters that make you stronger in combat |
| **Notoriety** | Replaces karma. Shows your combat history. Cosmetic + tiny bonus |
| **Leaderboard** | Add "Most Dangerous" leaderboard category (by notoriety or combat wins) |

---

## Client UI Flow

### Challenge Initiation (TableScene)
After a game ends or when leaving the table, a "CHALLENGE" button appears next to each player you played with. Tapping it initiates the challenge.

### Challenge Popup (Target)
Full-screen popup showing:
- Challenger's character portrait + name + notoriety title
- Auto-selected items from both sides (with Power Score)
- "Half your chips at stake" warning
- Two big buttons: 🤜 **FIGHT** and 🏃 **FLEE**
- 30-second countdown timer

### Combat Animation (Both Players)
- 3-second dramatic sequence
- Both characters face off
- Quick strike animations based on who has higher ATK/DEF/SPD
- Winner celebration, loser knocked down
- Results screen: items transferred, chips transferred, notoriety change

### Combat Scene (CombatScene.cs — replaces RobberyScene.cs)
- Accessed from Main Menu (bottom nav replaces "ROBBERY" button with "COMBAT")
- Shows: your combat stats, recent fights, notoriety rank, win/loss record
- Challenge history log
- No "browse targets" — you can only challenge from the table

---

## Database Changes

### Tables to Add
```sql
CREATE TABLE combat_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    challenger_id INT NOT NULL,
    target_id INT NOT NULL,
    winner_id INT,
    challenger_item_id VARCHAR(50),
    target_item_id VARCHAR(50),
    chips_transferred INT DEFAULT 0,
    challenger_combat_score FLOAT,
    target_combat_score FLOAT,
    target_action ENUM('fight', 'flee', 'disconnect', 'timeout') NOT NULL,
    table_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (challenger_id) REFERENCES users(id),
    FOREIGN KEY (target_id) REFERENCES users(id)
);
```

### Columns to Add
```sql
ALTER TABLE users ADD COLUMN notoriety FLOAT DEFAULT 0;
ALTER TABLE users ADD COLUMN combat_wins INT DEFAULT 0;
ALTER TABLE users ADD COLUMN combat_losses INT DEFAULT 0;
ALTER TABLE users ADD COLUMN last_combat_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN bruised_until TIMESTAMP NULL;
```

### Columns to Add to Items
```sql
-- Item templates get combat bonuses
-- These go in the item template definitions, not the DB
-- Each item template: { ..., combatBonus: { atk: 0, def: 0, spd: 0 } }
```

### Tables/Columns to Remove
```sql
DROP TABLE IF EXISTS karma_history;
ALTER TABLE users DROP COLUMN karma;
-- robbery_log table repurposed → combat_log
```

---

## Socket Events

### New Events (replace robbery events)
```
Client → Server:
  challenge_player     { targetId, tableId }
  respond_to_challenge { challengeId, action: 'fight' | 'flee' }
  get_combat_stats     {}
  get_combat_history   {}

Server → Client:
  challenge_received   { challengeId, challenger, challengerItem, yourItem, chipStake, timeoutSeconds }
  challenge_expired    { challengeId, reason }
  combat_result        { challengeId, winner, loser, itemsTransferred, chipsTransferred, scores }
  combat_fled          { challengeId, fleeingPlayer, chipsPenalty }
  notoriety_update     { userId, notoriety, title }
```

### Events to Remove
```
robbery_attempt, robbery_recovery, get_recoverable_robberies
get_karma, get_karma_history, get_robbery_targets
```

---

## Implementation Order (When We Build It)

1. **Server: CombatManager.js** — Core logic (challenge, match items, resolve, rewards)
2. **Server: CharacterSystem.js** — Add combat stats to all 10 characters
3. **Server: Item templates** — Add combat bonuses to item definitions
4. **Server: Database.js** — Add combat tables, remove karma tables
5. **Server: UserRepository.js** — Notoriety methods, combat log, remove karma methods
6. **Server: SocketHandler.js** — Replace robbery/karma events with combat events
7. **Server: Table.js** — Track "recently played with", strip karma from seat state
8. **Server: server.js** — Remove karma decay timer
9. **Client: NetworkModels.cs** — Replace robbery/karma models with combat models
10. **Client: GameService.cs** — Replace robbery/karma methods with combat methods
11. **Client: SocketManager.cs** — Replace robbery/karma events with combat events
12. **Client: CombatScene.cs** — New scene (replaces RobberyScene)
13. **Client: TableScene.cs** — Add challenge button post-game
14. **Client: Strip karma** — Remove from PokerTableView, PlayerProfilePopup, StatisticsScene, MainMenuScene
15. **Client: Add notoriety** — Display at seats, profiles, leaderboard

**Estimated total: ~12-14 hours across 2-3 sessions**
