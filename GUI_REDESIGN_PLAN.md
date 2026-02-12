# GUI Redesign Plan - Full App Overhaul

**Started:** Feb 12, 2026  
**Target:** Android Landscape (1920x1080, matchWidthOrHeight 0.5f)  
**Platform:** Unity (C#), programmatic UI via UIFactory/UISpriteFactory  

---

## Game Identity

This is NOT a standard poker app. This is a **poker RPG with crime mechanics**.

### Story & World
- **Adventure Mode**: Area-based progression maps. Complete an area to unlock the next.
- **Boss Battles**: Poker matches against bosses for item drops and chips.
- **Tournaments**: Per-area tournaments that players compete in.
- **Player Encounters**: PvP robbery system. Steal boats, cars, items from other players using tools (hotwire kits, RFID cloners, lockpicks). Victims can recover stolen property if the thief gets caught.
- **Item Economy**: Vehicles (boats, cars), tools, keys to locked areas, gambleable items, cosmetics.
- **Progression**: Starts gritty and street-level (Area 1: "The Dirty Lew" - downtown Lewiston, Maine). Each area escalates in vibe, stakes, and access requirements.

### Tone
- Underground, edgy, street-smart
- NOT a clean casino. NOT cartoon. NOT sterile.
- Think GTA meets poker - dark, atmospheric, with personality
- Humor and attitude welcome, but grounded

---

## Visual Direction: Stylized Urban / Dark Street

### Base Palette (consistent across entire game)
- **Backgrounds**: Near-black with subtle texture/grain (charcoal, deep navy)
- **Panels**: Dark, slight transparency, flat with rounded corners
- **Primary accent**: Gold/amber - universal language for money, value, chips
- **Text**: Crisp white (primary), muted gray (secondary), dark gray (disabled)
- **Success**: Muted green
- **Danger**: Red
- **Warning**: Amber/orange
- **Interactive elements**: Accent-colored to stand out against dark background

### Area Accent System (shifts per zone)
Each area gets its own signature color that tints accents, backgrounds, and mood:

| Area | Name | Vibe | Accent Color | Background Tint |
|------|------|------|-------------|----------------|
| 1 | The Dirty Lew | Hood, gritty, dimly lit | Dirty gold / muted green | Dark with warm grain |
| 2+ | TBD | Escalating | Richer, more saturated | Cleaner, bolder |
| Late | TBD | High-end, exclusive | Bright golds, whites | Deep elegant darks |

The UI frame (panels, buttons, nav) stays consistent. Only accent colors and background mood shift per area.

### What We Are NOT Doing
- No bright cartoon outlines or thick drop shadows
- No purple-blue backgrounds (old abandoned cartoon attempt)
- No mismatched hardcoded colors per scene
- No tiny floating panels with wasted screen space

---

## Typography (1920x1080 canvas pixels)

All sizes are in pixels on the 1920x1080 reference canvas. NOT dp.

| Level | Size | Weight | Use |
|-------|------|--------|-----|
| Display | 72f | Bold | Scene titles, big numbers |
| Heading | 48f | Bold | Section headers, player names |
| Subheading | 36f | SemiBold | Panel titles, phase text |
| Body | 28f | Normal | General content, button labels |
| Caption | 22f | Normal | Labels, timestamps, secondary info |
| Tiny | 18f | Normal | Badges, counts, fine print |

- Primary text: White
- Secondary text: Gray (0.7, 0.7, 0.7)
- Muted text: Dark gray (0.5, 0.5, 0.5)
- Gold text: theme.textGold for titles, chips, accent values
- All text uses TextMeshPro
- No thick outlines on text (subtle shadow only where needed for readability over images)

---

## Layout and Touch Targets (Android Landscape)

### Thumb Zone Awareness

```
+-----------------------------------------------------------+
|  INFO BAR (glance zone - rarely tapped)                    |
|                                                             |
|  LEFT THUMB        CENTER CONTENT          RIGHT THUMB      |
|  ZONE              (table, cards,          ZONE             |
|  (nav, back,       maps, lists)            (primary         |
|  secondary)                                 actions)         |
|                                                             |
|  [NAV BUTTONS]     [CONTENT AREA]       [ACTION BUTTONS]   |
+-----------------------------------------------------------+
```

- **Top bar**: Info only (phase, timer, chips) - look, don't tap often
- **Bottom-left**: Menu, back, secondary actions (left thumb)
- **Bottom-right**: Primary actions - fold, call, raise, confirm (right thumb)
- **Center**: Content - table, cards, lists, maps
- **Top corners**: Nothing critical (hardest to reach)

### Touch Target Sizes (1920x1080 px)

| Element | Size (px) | Notes |
|---------|-----------|-------|
| CTA buttons (Login, Create) | 110px tall, full width | Big gold, fontHeading text |
| Action buttons (Fold, Call, etc.) | 70px tall, 100px min-w | In-game actions |
| Nav buttons (Back, tabs, bottom bar) | 80px tall, 160px min-w | Secondary navigation |
| List items (lobby table rows) | 120px tall | Full-width cards with status bar |
| Input fields | 100px tall, full width | 28f body text inside |
| Steppers (replace sliders) | 90px tall [ - VALUE + ] | Big +/- buttons, gold value center |
| Toggles | 90x90px | Chunky toggle buttons |
| Small/icon buttons | 64x64px | Settings gear, close X |
| Card taps | 80x112+ | Easily tappable |

### Spacing System (1920x1080 px)

| Token | Value (px) | Use |
|-------|------------|-----|
| xs | 8 | Icon-to-text gaps |
| sm | 16 | Tight spacing within groups |
| md | 28 | Standard panel padding |
| lg | 44 | Between sections |
| xl | 64 | Major section separation |
| screenPadding | 32 | Safe area inset from edges |

### Layout Rules
- **Content fills the screen.** No tiny centered cards in emptiness.
- **All panels use ScrollView** so content never goes off-screen on resize.
- **Inputs and buttons stretch** to fill available width (flexibleWidth = 1).
- **Steppers replace sliders** — big [ - ] VALUE [ + ] controls for number selection.
- **Two-column layouts** for settings (steppers side by side) with fallback scroll.

---

## Animation and Feedback System

Animations are a CORE part of the experience, not optional polish. Every interaction should feel responsive and alive.

### Transitions
| Type | Duration | Easing | Description |
|------|----------|--------|-------------|
| Scene enter | 200-300ms | Ease-out | Panels slide up or fade in |
| Scene exit | 150ms | Ease-in | Fade out |
| Panel open | 250ms | Ease-out | Scale 0.95 to 1.0 + fade in |
| Panel close | 150ms | Ease-in | Scale 1.0 to 0.95 + fade out |

### Interactive Feedback
- **Button press**: Scale down to 0.95 on touch, snap back on release
- **Button focus/hover**: Subtle glow pulse
- **Chip count change**: Number rolls up/down with color flash (green=gain, red=loss)
- **Card deal**: Cards slide from deck, slight rotation, staggered timing
- **Card flip**: 3D flip (scaleX 1 to 0 to 1 with face swap at midpoint)

### Ambient / Idle
- **Card backs**: Subtle shimmer or holographic pattern shift
- **Pot chips**: Gentle float/bob
- **Active player seat**: Pulsing glow border
- **Timer low**: Pulse intensifies, color shifts to red (ALREADY IMPLEMENTED - keep)
- **Gold/chip displays**: Subtle sparkle

### Big Moments
- **Win a hand**: Chips fly from pot to winner, flash, particle burst
- **All-in**: Screen edge glow, dramatic pulse
- **Boss encounter**: Screen shake, dramatic reveal
- **Robbery encounter**: Red alert flash, tension pulse
- **Level up / area unlock**: Celebration, confetti/particles

### Sound Design (paired with animations)
- Card deal: snap/flick
- Chip bet: clinking stack
- Fold: soft card toss
- Win: cha-ching + chip cascade
- Timer tick: subtle clock when low
- Button press: tactile click
- Navigation: soft whoosh

---

## Theme System (GameTheme.cs)

The existing GameTheme.cs ScriptableObject is the foundation. It needs to be expanded and then ACTUALLY USED everywhere (currently most scenes hardcode colors and ignore it).

### Required Structure

```
Base Palette (never changes)
  Background colors (dark shell)
  Panel colors (slightly lighter, transparent)
  Text colors (white, gray, muted)
  Universal accents (gold for money, red for danger, green for success)
  Card colors (face, back, suits)
  Chip colors (by denomination)
  Player state colors (active, waiting, folded, all-in, winner)
  Rarity colors (common through legendary)

Area Palette (changes per zone - new addition)
  areaAccentPrimary (signature color)
  areaAccentSecondary
  areaBackgroundTint (subtle background shift)
  areaMood (enum: gritty, neon, luxurious, etc.)

Sizing (consistent everywhere - expand existing)
  Touch targets (minTouchTarget = 48)
  Button heights (actionButton, navButton, menuButton)
  Card dimensions (width, height)
  Avatar sizes
  Spacing tokens (xs=4, sm=8, md=16, lg=24, xl=32)
  Screen padding (16)
  Font sizes (display, heading, subheading, body, caption, tiny)

Animation Timing (new addition)
  fast = 150ms (feedback)
  normal = 250ms (transitions)
  slow = 400ms (dramatic moments)
  Easing curves (ease-out for enter, ease-in for exit)
```

### Critical Rule
**Every new Color(...) in every scene file MUST be replaced with Theme.Current.xxx.** No exceptions. If a color is needed that doesn't exist in the theme, add it to the theme first.

---

## Phase-by-Phase Work Plan

### Phase 1: Theme System Foundation
**Goal:** Lock in GameTheme.cs as the single source of truth.

- [ ] Expand GameTheme.cs with full palette, sizing, spacing, animation timing
- [ ] Add area accent system (AreaTheme struct or separate ScriptableObject)
- [ ] Create ThemeHelper utility class for common patterns (CreateThemedButton, CreateThemedPanel, etc.)
- [ ] Verify theme loads correctly in Unity

### Phase 2: Login / Register (MainMenuScene auth panels)
**Goal:** First thing users see. Set the visual tone.

- [ ] Redesign login panel - dark card, centered, clean spacing
- [ ] Redesign register panel - matching style
- [ ] Properly sized input fields (56dp+) with show/hide password toggle
- [ ] Better error display (inline with icon, not just red text)
- [ ] Remove all hardcoded colors, use theme
- [ ] Add field validation before submit (register)
- [ ] Smooth panel transitions (fade/scale)

### Phase 3: Main Menu (MainMenuScene main panel)
**Goal:** Hub of the app. Visual hierarchy. Sets the tone.

- [ ] Redesign with visual hierarchy:
  - Hero section: ADVENTURE and MULTIPLAYER as large cards (side by side)
  - Bottom bar: SHOP, INVENTORY, FRIENDS, SETTINGS as icon buttons
- [ ] Player info bar: polished XP bar, level badge, formatted chip count (e.g. "20M")
- [ ] Thumb-friendly bottom navigation
- [ ] Friends button: show "Coming Soon" toast (currently TODO)
- [ ] Fix Settings logout to call GameService.Logout() (currently broken)
- [ ] Remove all hardcoded colors, use theme
- [ ] Scene transition animations

### Phase 4: Lobby (LobbyScene)
**Goal:** Browse/create/join tables. Fix bugs. Thumb-friendly.

- [ ] Redesign table list: card-style rows (64-72dp), status indicators (open/in-progress/full)
- [ ] Add search/filter bar
- [ ] Fix: implement password input dialog for private tables (currently TODO)
- [ ] Fix: oderId typo to userId in OnInviteUser
- [ ] Fix: StartSimulation parameter mismatch (7 vs 6 params, itemAnteEnabled)
- [ ] Redesign create table form: grouped sections, better sliders, visual toggles
- [ ] Auto-refresh table list on timer
- [ ] Remove all hardcoded colors, use theme

### Phase 5: Table Scene (TableScene)
**Goal:** The big one. Polish the gameplay experience.

**KEEP as-is (sizes are good, user confirmed):**
- Action bar button sizes (Fold 70x50, Check 80x50, Call 90w, Bet 70x50, Raise 120x70, All In 140x70)
- Top bar label/timer sizes (phase 18f, timer 28f bold)
- Timer pulse animation when time is low
- Action bar positioning (bottom of screen, horizontal layout)

**Improve:**
- [ ] Rip out ALL hardcoded new Color(...), wire to theme
- [ ] Cleaner seat layout with better player cards (avatar, name, chips, status)
- [ ] Community cards: centered, larger, deal animations
- [ ] Pot display: prominent, centered above community cards
- [ ] Action panel: use theme colors consistently
- [ ] Bet slider: improve thumb handle, add chip denomination markers
- [ ] Side menu: gray out unimplemented features (Invite, Chat) with "Coming Soon"
- [ ] Game over popup: proper results with chip delta
- [ ] Verify simulation counter works
- [ ] Verify money tracking (no vanishing chips)
- [ ] Card deal/flip animations
- [ ] Chip movement animations (bet to pot, pot to winner)

### Phase 6: Connection Flow (MainMenuScene connection panel)
**Goal:** Polish the connection experience.

- [ ] Progress indicator with clear status text
- [ ] Visible "Manual Connect" button (not buried in settings)
- [ ] Timeout with friendly message and retry option
- [ ] Smooth transition from connected to login panel

### Phase 7: Cross-Cutting Cleanup
**Goal:** Remove dead code, enforce consistency.

- [ ] Audit every scene file for remaining hardcoded colors
- [ ] Remove or mark legacy code: PokerTableScene.cs, GameController.cs (if unused)
- [ ] Fix AdventureMapScene.cs bug: lockIcon assigns Image to Text object
- [ ] Fix server.js: gameLogger used before required (line ~57)
- [ ] Fix Events.js: documentation says playerName but actual is username
- [ ] Mark placeholder scenes clearly (Leaderboard, Tournament use mock data)
- [ ] Consistent scene transition animations everywhere

---

## Scenes Inventory

| Scene | Status | Priority |
|-------|--------|----------|
| MainMenuScene (connection) | Needs polish | Phase 6 |
| MainMenuScene (login/register) | Needs redesign | Phase 2 |
| MainMenuScene (main menu) | Needs redesign | Phase 3 |
| LobbyScene | Needs redesign + bug fixes | Phase 4 |
| TableScene | Keep layout, polish visuals | Phase 5 |
| AdventureScene | Functional, polish later | Future |
| AdventureBattleScene | Functional, polish later | Future |
| AdventureMapScene | Has bugs, uses mock data | Future |
| SettingsScene | Functional, needs theme pass | Future |
| ShopScene | Placeholder (TODO purchases) | Future |
| LeaderboardScene | Uses mock data | Future |
| StatisticsScene | Placeholder stats | Future |
| TournamentScene | Uses mock data | Future |
| PokerTableScene | Legacy/alternate, evaluate for removal | Phase 7 |

---

## Server-Side Issues to Fix During This Pass

| Issue | Location | Phase |
|-------|----------|-------|
| gameLogger used before require | server.js ~line 57 | Phase 7 |
| Events.js docs say playerName, actual is username | src/sockets/Events.js | Phase 7 |
| Money validation / chip tracking bugs | src/game/Table.js | Phase 5 (verify) |
| Bot entry/exit lifecycle | src/testing/SimulationManager.js | Phase 5 (verify) |
| Simulation not completing target games | SimulationManager.js | Phase 5 (verify) |

---

## Art Assets

All custom art (backgrounds, boss portraits, item icons, UI elements) can be generated using free AI image generators. See **[ART_ASSET_PROMPTS.md](ART_ASSET_PROMPTS.md)** for ready-to-use prompts that match our visual direction.

Priority assets needed before/during the overhaul:
- Login/main menu background
- App logo/title
- Card back design (3 frames for shimmer animation)
- Default table background

Everything else (boss portraits, vehicles, tools, map art) can be generated as those features are built.

---

## Key Principles

1. **Theme is law** - no hardcoded colors, ever
2. **Thumbs first** - every tappable element must be reachable and large enough
3. **Content fills the screen** - no wasted space
4. **Animations are not optional** - they ARE the experience
5. **Consistency across scenes** - same buttons, same panels, same spacing
6. **Area accents for personality** - world changes, UI frame doesn't
7. **Fix root causes** - no bandaids, no workarounds
