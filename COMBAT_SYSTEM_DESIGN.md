# Combat System Design — PvP Showdowns

> Replaces the old Robbery & Karma system with a narratively coherent "Wild West showdown" PvP system. Mark someone during a poker game. When the game ends, they get called out.

---

## Overview

During a poker game, you can **mark** someone for a fight. You're stewing at the table, they just sucked out on you, you flag them. When the game ends, the challenge is delivered. If they marked you too — it's an **instant mutual showdown**, no backing out. You can also challenge people outside of games through your friends list, recent opponents, or leaderboards.

Combat resolves automatically based on character stats, equipped items, crew backup, and a random roll. The target can fight back or flee — but going offline = auto-lose.

**Why this exists:** Poker creates tension. Combat lets players act on it. Every other system (characters, items, crews, adventure) becomes more meaningful because it feeds into combat power.

---

## Core Flow

### Path 1: Mark During a Poker Game (Primary)

```
During Poker Game
    ↓
Player taps opponent's seat → "MARK FOR FIGHT" button
    ↓
Mark is placed silently (target does NOT know yet)
You can mark multiple players during one game
    ↓
Poker Game Ends
    ↓
All marks are delivered as challenges:
  "[Player] is calling you out!"
    ↓
System auto-picks matched items from both sides
    ↓
Target chooses:
  🤜 FIGHT → Combat resolves → Winner takes all
  🏃 FLEE  → Pay 10% chips, keep items, get "Coward" tag
  ⏰ TIMEOUT (30 sec) → Auto-FLEE
  📴 DISCONNECT → Auto-LOSE (treated as fight loss)
```

### Path 2: Mutual Mark = Instant Showdown

```
During Poker Game
    ↓
Player A marks Player B
Player B marks Player A (neither knows about the other's mark)
    ↓
Poker Game Ends
    ↓
🔥 MUTUAL CHALLENGE DETECTED 🔥
Both players marked each other — NO flee option!
    ↓
Combat resolves immediately → Winner takes all
```

When both players independently marked each other, neither can flee — you both wanted this. The fight triggers instantly after the game ends with a special "MUTUAL SHOWDOWN" animation.

### Path 3: Challenge Outside a Game

```
From CombatScene / Friends / Leaderboard / Recent Opponents
    ↓
Player taps "CHALLENGE" on someone
    ↓
Challenge is sent immediately (not queued)
    ↓
Target gets popup wherever they are:
  🤜 FIGHT or 🏃 FLEE (30 sec timer)
  📴 DISCONNECT → Auto-LOSE
```

Outside-game challenges work the same as in-game ones (same stakes, same resolution) but with these restrictions:
- **Friends list** — challenge any friend, anytime
- **Recent Opponents** — anyone you played poker with in the last 24 hours
- **Leaderboard** — challenge anyone on any leaderboard (bold move)
- Same cooldown rules apply (1 per target per 24 hours)

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

### In-Game Marks

| Rule | Detail |
|------|--------|
| **When can you mark?** | Anytime during a poker game (from the player's seat popup) |
| **Is the mark visible?** | No — marks are silent. Target doesn't know until the game ends |
| **Multiple marks** | You can mark multiple players in the same game |
| **Mark delivery** | All marks are delivered as challenges when the poker game ends |
| **Mutual marks** | If both players marked each other → instant fight, no flee option |
| **Mark expires** | If you leave the table before the game ends, your marks are cancelled |

### All Challenges (In-Game + Outside)

| Rule | Detail |
|------|--------|
| **Response timeout** | 30 seconds to Fight or Flee (then auto-flee) |
| **Disconnect during challenge** | Auto-LOSE (full fight loss penalties) |
| **Cooldown per target** | 1 challenge per player per 24 hours |
| **Bruised protection** | Can't be challenged for 1 hour after losing a fight |
| **Coward tag** | Visible for 1 hour after fleeing (cosmetic only) |
| **Minimum chips to be challenged** | Must have ≥ 1,000 chips (poverty protection) |
| **Crew immunity** | Can't challenge members of your own crew |
| **Multiple challenges** | Challenges resolve one at a time (queue if multiple from same game) |

### Outside-Game Challenges

| Rule | Detail |
|------|--------|
| **Friends** | Challenge any friend, anytime |
| **Recent Opponents** | Anyone you played with in the last 24 hours (visible in CombatScene) |
| **Leaderboard** | Challenge anyone on any leaderboard |
| **Mutual marks don't apply** | Outside challenges always give the target fight/flee choice |

---

## How It Ties Into Other Systems

| System | Connection |
|--------|-----------|
| **Poker** | Creates the tension. Mark someone mid-game while you're fuming. Mutual marks = instant showdown. The game IS the buildup |
| **Characters** | Each has unique combat stats (ATK/DEF/SPD). Rarer characters = stronger fighters. Adventure character drops now REALLY matter |
| **Items** | Equipped items give combat bonuses. Items are at stake in fights. Inventory management matters |
| **Crews** | Online crew members = combat backup. Crew XP from fights. Can't fight crewmates. Makes crews essential |
| **Friends** | Challenge friends anytime from CombatScene or Friends list. Social connections = potential combat targets |
| **For Keeps** | Still exists separately as voluntary item-ante poker. Combat is the "dark alley after the card game" version |
| **Adventure** | Where you grind items and unlock characters that make you stronger in combat |
| **Notoriety** | Replaces karma. Shows your combat history. Cosmetic + tiny bonus |
| **Leaderboard** | Add "Most Dangerous" category. Also a source of outside-game challenges (call out top players) |

---

## Client UI Flow

### Marking During a Game (TableScene)
- Tap an opponent's seat → player profile popup appears (already exists)
- New button in popup: **🎯 MARK FOR FIGHT** (red, bottom of popup)
- After marking, a small crosshair icon appears on that seat (only visible to you)
- You can unmark by tapping the seat again → "UNMARK" button
- Marks are silent — the target sees nothing during the game

### Post-Game Challenge Delivery (TableScene)
When the game ends:
1. **Mutual marks first** — if two players marked each other, a dramatic "MUTUAL SHOWDOWN" banner appears. No flee option. Fight resolves immediately with a special animation.
2. **One-way marks next** — delivered as standard challenges to each target, one at a time. Target sees the challenge popup.
3. If you marked 3 people, they queue up and resolve sequentially.

### Challenge Popup (Target — all challenge types)
Full-screen popup showing:
- Challenger's character portrait + name + notoriety title
- Auto-selected items from both sides (with Power Score)
- "Half your chips at stake" warning
- Two big buttons: 🤜 **FIGHT** and 🏃 **FLEE** (flee hidden for mutual marks)
- 30-second countdown timer

### Combat Animation (Both Players)
- 3-second dramatic sequence
- Both characters face off
- Quick strike animations based on who has higher ATK/DEF/SPD
- Winner celebration, loser knocked down
- Results screen: items transferred, chips transferred, notoriety change
- Mutual showdowns get a special "double draw" intro animation

### Combat Scene (CombatScene.cs — replaces RobberyScene.cs)
- Accessed from Main Menu (bottom nav replaces "ROBBERY" button with "COMBAT")
- **Your Stats** — combat record, notoriety rank, win/loss ratio
- **Recent Fights** — challenge history log with results
- **Recent Opponents** — players you've played poker with in the last 24 hours, with CHALLENGE button
- **Challenge from Friends** — opens friends list with CHALLENGE buttons
- **Leaderboard Challenges** — link to leaderboard with CHALLENGE option on each player

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
    is_mutual BOOLEAN DEFAULT FALSE,
    source ENUM('in_game', 'friend', 'recent', 'leaderboard') NOT NULL DEFAULT 'in_game',
    table_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (challenger_id) REFERENCES users(id),
    FOREIGN KEY (target_id) REFERENCES users(id)
);

-- Tracks who you've played poker with recently (for outside-game challenges)
CREATE TABLE recent_opponents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    opponent_id INT NOT NULL,
    table_id VARCHAR(50),
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (opponent_id) REFERENCES users(id),
    UNIQUE KEY unique_pair_per_day (user_id, opponent_id, played_at)
);
-- Rows older than 24 hours are pruned by a scheduled cleanup
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
  mark_player          { targetId, tableId }           # Silent mark during game
  unmark_player        { targetId, tableId }           # Remove mark during game
  challenge_player     { targetId, source: 'friend' | 'recent' | 'leaderboard' }  # Outside-game challenge
  respond_to_challenge { challengeId, action: 'fight' | 'flee' }
  get_combat_stats     {}
  get_combat_history   {}
  get_recent_opponents {}                              # Players from last 24h

Server → Client:
  mark_confirmed       { targetId }                    # Your mark was registered
  challenge_received   { challengeId, challenger, challengerItem, yourItem, chipStake, timeoutSeconds, isMutual }
  mutual_showdown      { challengeId, opponent, challengerItem, opponentItem, chipStake }  # No flee!
  challenge_expired    { challengeId, reason }
  combat_result        { challengeId, winner, loser, itemsTransferred, chipsTransferred, scores }
  combat_fled          { challengeId, fleeingPlayer, chipsPenalty }
  notoriety_update     { userId, notoriety, title }
  recent_opponents     { opponents: [{ userId, username, notoriety, lastPlayedAt }] }
```

### Events to Remove
```
robbery_attempt, robbery_recovery, get_recoverable_robberies
get_karma, get_karma_history, get_robbery_targets
```

---

## Implementation Order (When We Build It)

1. **Server: CombatManager.js** — Core logic (mark, challenge, mutual detection, match items, resolve, rewards)
2. **Server: CharacterSystem.js** — Add combat stats to all 10 characters
3. **Server: Item templates** — Add combat bonuses to item definitions
4. **Server: Database.js** — Add combat_log, recent_opponents tables; remove karma tables
5. **Server: UserRepository.js** — Notoriety methods, combat log, recent opponents, remove karma methods
6. **Server: SocketHandler.js** — Replace robbery/karma events with mark/challenge/combat events
7. **Server: Table.js** — Track marks per player per game, populate recent_opponents on game end, strip karma from seat state
8. **Server: server.js** — Remove karma decay timer, add recent_opponents cleanup cron (prune >24h)
9. **Client: NetworkModels.cs** — Replace robbery/karma models with combat models (marks, mutual, recent opponents)
10. **Client: GameService.cs** — Replace robbery/karma methods with mark/challenge/combat methods
11. **Client: SocketManager.cs** — Replace robbery/karma events with combat events
12. **Client: CombatScene.cs** — New scene (replaces RobberyScene) with stats, history, recent opponents, challenge-from-friends, leaderboard link
13. **Client: TableScene.cs** — Add "MARK FOR FIGHT" button in player seat popup, crosshair indicator, post-game challenge delivery queue, mutual showdown UI
14. **Client: Strip karma** — Remove from PokerTableView, PlayerProfilePopup, StatisticsScene, MainMenuScene
15. **Client: Add notoriety** — Display at seats, profiles, leaderboard
16. **Client: FriendsScene.cs** — Add CHALLENGE button next to each friend
17. **Client: LeaderboardScene.cs** — Add CHALLENGE button next to each player

**Estimated total: ~14-16 hours across 2-3 sessions**
