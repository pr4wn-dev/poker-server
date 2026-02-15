# Narrative Pivot Summary — Mafia Wars Poker

**Date:** February 14, 2026  
**Status:** Documentation complete, ready for implementation

---

## 🎯 The New Story (Quick Version)

A child's family is kidnapped. A mafioso teaches them poker. They get 20 million chips and climb the criminal underworld to find the killer. Final boss has thousands of victims in drawers. You search the drawers hoping to find your family.

**Read GAME_STORY.md for full narrative.**

---

## ✅ What's Done

1. ✅ **GAME_STORY.md** — Complete narrative document (opening, 8 areas, 13 bosses, drawer mechanic, loan system)
2. ✅ **GAME_COMPLETION_PLAN.md** — Full task breakdown with 171 items, status tracking
3. ✅ **PROJECT_STATUS.md** (Unity) — Updated roadmap with new features
4. ✅ **CHANGELOG.md** — Documented the pivot with full context
5. ✅ All docs committed and pushed to GitHub

---

## 📋 What Needs to Be Done

### **Phase 1: Narrative Reskin** (2-3 days)
Text and color updates, no new systems:

**Server (poker-server):**
- [ ] `src/game/CharacterSystem.js` — Rename 10 characters to victims
- [ ] `src/adventure/WorldMap.js` — Rename 8 areas to criminal locations
- [ ] `src/adventure/Boss.js` — Rename 13 bosses to criminal figures
- [ ] `src/database/UserRepository.js` — Change default chips to 20M

**Client (poker-client-unity):**
- [ ] `Assets/Scripts/UI/Core/GameTheme.cs` — Update color palette (cyber → noir)
- [ ] `Assets/Scripts/UI/Scenes/MainMenuScene.cs` — Update subtitle text
- [ ] `Assets/Scripts/UI/Scenes/AdventureMapScene.cs` — Update area story text
- [ ] `Assets/Scripts/UI/Scenes/CharacterSelectScene.cs` — Update title to "The Rescued"
- [x] `Assets/Scripts/UI/Scenes/RobberyScene.cs` — Rename "Notoriety" → "Heat" ✅

### **Phase 2: Opening Cinematic** (1-2 days)
NEW feature:
- [ ] Database: Add `has_seen_intro` column to users table
- [ ] `Assets/Scripts/UI/Scenes/IntroScene.cs` — NEW scene (static images + text)
- [ ] Hook into login flow (check flag, show intro if first time)
- [ ] Generate 7 AI art images (kidnapping sequence)

### **Phase 3: Drawer Dungeon** (2-3 days)
NEW feature:
- [ ] `Assets/Scripts/UI/Scenes/DrawerDungeonScene.cs` — NEW scene (grid of drawers)
- [ ] Server logic in `AdventureManager.js` — Roll which drawers have characters
- [ ] Socket events: `open_drawer`, `drawer_result`
- [ ] Hook to final boss victory
- [ ] Generate AI art (vault background, drawer UI)

### **Phase 4: Mafia Loan System** (2-3 days)
NEW feature:
- [ ] Database: Create `mafia_loans` table
- [ ] `src/mafia/MafiaLoanManager.js` — NEW module (offer, track, enforce)
- [ ] Socket events: `request_loan`, `repay_loan`, `loan_overdue`
- [ ] Loan popup UI (Unity)
- [ ] Cron job: Check overdue loans → create enforcer challenges
- [ ] Integrate with existing `CombatManager.js`

### **Phase 5: Art Assets** (2-5 days, parallel with code)
Replace all cyber art with noir/mafia:
- [ ] Opening cinematic (7 images)
- [ ] Main menu background (dark rainy street)
- [ ] Character portraits (10 victims)
- [ ] Boss portraits (13 criminals)
- [ ] Area backgrounds (8 locations)
- [ ] Drawer dungeon UI
- [ ] Table/chips/cards (worn, gritty)

### **Phase 6: Audio Assets** (1-2 days, parallel with code)
- [ ] Character voice lines (70 clips, noir theme)
- [ ] Background music (somber piano, jazzy noir, tense orchestral)
- [ ] Drawer/rescue SFX

### **Phase 7: Testing** (2-3 days)
- [ ] Full narrative playthrough
- [ ] Loan system testing
- [ ] Drawer dungeon testing
- [ ] Multiplayer regression testing

---

## 🎮 Why This Works

**83% of code unchanged:**
- ✅ Poker engine (core gameplay)
- ✅ Multiplayer (lobbies, tables, tournaments)
- ✅ Adventure structure (8 areas, 13 bosses)
- ✅ Combat system → perfect for mafia enforcers
- ✅ Character system → perfect for rescued victims
- ✅ All 16 Unity scenes (just text/color updates)

**Only 3 new features:**
1. Opening cinematic (simple image slideshow)
2. Drawer dungeon (grid UI + server RNG)
3. Loan system (database + manager + UI)

**Narrative elevates everything:**
- Poker = climbing criminal ladder (not just gambling)
- Combat = mafia violence (not random PvP)
- Characters = rescued victims (not random unlocks)
- Bosses = criminal figures (not generic enemies)
- Endgame = searching for family (emotional hook)

---

## 📊 Current Status

**Code completion:** ~63% (107/171 features)
- Core systems: 83% functional
- New features: 0% (not started)
- Narrative reskin: 0% (not started)

**Art completion:** ~4% (1/25 assets)

**Estimated timeline:** 2-3 weeks of focused work

---

## 🚀 Next Steps

1. **Start with Phase 1** (narrative reskin) — easiest, no new systems
2. **Then Phase 2-4** (new features) — one at a time
3. **Parallel: Phase 5-6** (art/audio) — can generate while coding
4. **Finish with Phase 7** (testing) — full validation

**First task:** Update `GameTheme.cs` color palette (cyber → noir)

---

## 📁 Key Documents

- **GAME_STORY.md** — Full narrative (opening, areas, bosses, mechanics)
- **GAME_COMPLETION_PLAN.md** — Detailed task breakdown (171 items)
- **PROJECT_STATUS.md** — Unity roadmap and status
- **CHANGELOG.md** — Pivot documented with context

All docs are in sync and committed to GitHub.

---

**Ready to begin implementation.**
