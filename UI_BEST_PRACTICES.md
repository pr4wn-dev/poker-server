# UI Best Practices - Lessons Learned

## Overview
This document captures lessons learned from fixing the card positioning issue and provides best practices to ensure all UI components (images, animations, labels, etc.) work correctly throughout the game.

## The Problem We Solved

### Issue: Cards Moving When Flipping
Cards were moving when flipping from face-down to face-up, covering player names and money.

### Root Cause
1. **Parent Container Movement**: Cards are positioned relative to parent containers using anchors. When parent containers move (due to layout recalculation), child positions change.
2. **Multiple State Updates**: `UpdateFromState` is called frequently (on every state update), calling `SetCard` multiple times on the same cards.
3. **Animation Target Drift**: Animations stored `targetPosition = _rect.anchoredPosition` at animation start, but if `SetCard` was called again while animating, the position had changed.
4. **Layout Recalculation**: Unity's layout system can cause positions to change unexpectedly when content visibility changes.

### The Solution
1. **Position Locking**: Store the card's initial position when first revealed (from hidden/empty to visible).
2. **Position Restoration**: If position changes when `SetCard` is called multiple times, restore it to the locked position.
3. **Locked Animation Targets**: Use the locked position as the animation target, not the current position.
4. **Continuous Enforcement**: Use `LateUpdate` to continuously restore the locked position if it changes.

## Best Practices for All UI Components

### 1. Position-Locked UI Elements

**When to Use:**
- Any UI element that should maintain its position relative to a parent container
- Elements that are updated frequently (every state update)
- Elements that use animations
- Elements that change visibility/content frequently

**Implementation Pattern:**
```csharp
private Vector2 _lockedPosition = Vector2.zero;
private bool _positionLocked = false;

public void SetCard(Card card)
{
    // Lock position when first revealed
    if ((wasEmpty || wasHidden) && !_positionLocked && _rect != null)
    {
        _lockedPosition = _rect.anchoredPosition;
        _positionLocked = true;
    }
    
    // Restore position if it changed
    if (_positionLocked && !wasEmpty && !wasHidden && _rect != null)
    {
        Vector2 currentPos = _rect.anchoredPosition;
        if (Vector2.Distance(currentPos, _lockedPosition) > 0.01f)
        {
            _rect.anchoredPosition = _lockedPosition;
        }
    }
}

private void LateUpdate()
{
    // Continuously restore locked position
    if (_positionLocked && _rect != null && !_wasEmpty && !_wasHidden)
    {
        Vector2 currentPos = _rect.anchoredPosition;
        if (Vector2.Distance(currentPos, _lockedPosition) > 0.01f)
        {
            if (_animationCoroutine == null) // Don't interfere with animations
            {
                _rect.anchoredPosition = _lockedPosition;
            }
        }
    }
}
```

### 2. Animation Best Practices

**DO:**
- Use locked/initial positions as animation targets, not current positions
- Stop existing animations before starting new ones
- Reset to final state after animation completes
- Check if animation is running before restoring position in `LateUpdate`

**DON'T:**
- Store `targetPosition = _rect.anchoredPosition` at animation start if position might change
- Allow multiple animations to run simultaneously on the same element
- Forget to reset scale/rotation after animation

**Example:**
```csharp
private System.Collections.IEnumerator AnimateCardReveal()
{
    // CRITICAL: Use locked position as target, not current position
    Vector3 targetPosition = _positionLocked ? (Vector3)_lockedPosition : (Vector3)_rect.anchoredPosition;
    Vector3 targetScale = Vector3.one;
    
    // ... animation code ...
    
    // Ensure final state is exact
    _rect.anchoredPosition = targetPosition;
    _rect.localScale = targetScale;
    _rect.localRotation = Quaternion.identity;
}
```

### 3. Handling Multiple State Updates

**Problem:** `UpdateFromState` is called frequently, potentially updating the same elements multiple times.

**Solution:**
- Only update if state actually changed (compare old vs new state)
- Lock positions/values when first set
- Restore locked values if they change
- Use `CanvasGroup.alpha` instead of `SetActive()` to avoid layout rebuilds

**Example:**
```csharp
// BAD: Always updates, even if nothing changed
public void UpdateFromState(SeatInfo info)
{
    _nameText.text = info.name;
    _chipsText.text = info.chips.ToString();
    _card.SetCard(info.card);
}

// GOOD: Only update if changed
public void UpdateFromState(SeatInfo info)
{
    if (_lastName != info.name)
    {
        _nameText.text = info.name;
        _lastName = info.name;
    }
    
    if (_lastChips != info.chips)
    {
        _chipsText.text = info.chips.ToString();
        _lastChips = info.chips;
    }
    
    // Card position is locked, so SetCard is safe to call multiple times
    _card.SetCard(info.card);
}
```

### 4. Layout System Considerations

**Problem:** Unity's layout system can cause positions to change when:
- Content visibility changes (`SetActive()`)
- Layout groups recalculate
- Parent containers move
- Canvas scalers adjust

**Solutions:**
- Use `CanvasGroup.alpha` instead of `SetActive()` for visibility changes
- Disable layout components on elements that should maintain fixed positions
- Use `ignoreLayout = true` on `LayoutElement` components
- Lock positions for elements that shouldn't move

**Example:**
```csharp
// BAD: Triggers layout recalculation
faceContent.SetActive(!faceDown);
backContent.SetActive(faceDown);

// GOOD: Doesn't trigger layout recalculation
CanvasGroup faceCanvasGroup = faceContent.GetComponent<CanvasGroup>();
if (faceCanvasGroup == null) faceCanvasGroup = faceContent.AddComponent<CanvasGroup>();
faceCanvasGroup.alpha = faceDown ? 0f : 1f;
```

### 5. Component-Specific Guidelines

#### Cards (`CardView`)
- ✅ Lock position when first revealed
- ✅ Restore position in `SetCard` if changed
- ✅ Use locked position as animation target
- ✅ Use `CanvasGroup.alpha` for face/back visibility
- ✅ Continuously restore in `LateUpdate`

#### Chips (`ChipStack`)
- ✅ Position is set once during initialization
- ✅ Value updates don't change position
- ⚠️ Watch for layout recalculation if chip count changes
- ⚠️ Consider locking position if parent moves

#### Labels/Text (`TextMeshProUGUI`)
- ✅ Usually don't need position locking (text doesn't move)
- ⚠️ Watch for text overflow causing layout changes
- ⚠️ Consider locking if parent container moves

#### Animations (`WinnerAnimation`, `ToastNotification`)
- ✅ Use `CanvasGroup.alpha` for fade in/out
- ✅ Store initial position when created
- ✅ Restore position after animation completes
- ⚠️ Consider locking position if parent moves

## Checklist for New UI Components

When creating or updating a UI component, check:

- [ ] **Position Stability**: Does the element maintain its position when parent moves?
- [ ] **Multiple Updates**: Is it safe to call update methods multiple times?
- [ ] **Animation Targets**: Do animations use locked/initial positions?
- [ ] **Layout Recalculation**: Does visibility change trigger unnecessary layout rebuilds?
- [ ] **State Comparison**: Are updates only performed when state actually changes?
- [ ] **Continuous Enforcement**: Is position/value locked and restored in `LateUpdate` if needed?

## Testing Checklist

When testing UI components:

1. **Position Stability Test**: Move parent container, verify child positions don't change
2. **Multiple Update Test**: Call update method 100+ times rapidly, verify no drift
3. **Animation Test**: Start animation, call update during animation, verify correct final position
4. **Layout Test**: Change visibility/content, verify no unexpected position changes
5. **State Update Test**: Rapidly update state, verify UI stays consistent

## Common Pitfalls

1. **Storing Current Position as Animation Target**: Always use locked/initial position
2. **Forgetting to Stop Animations**: Always stop existing animations before starting new ones
3. **Using SetActive for Visibility**: Use `CanvasGroup.alpha` instead to avoid layout rebuilds
4. **Not Locking Positions**: Elements updated frequently should lock their positions
5. **Ignoring Layout Components**: Disable layout components on fixed-position elements

## Utility Pattern: PositionLockedComponent

Consider creating a base class for position-locked components:

```csharp
public abstract class PositionLockedComponent : MonoBehaviour
{
    protected RectTransform _rect;
    protected Vector2 _lockedPosition;
    protected bool _positionLocked = false;
    
    protected virtual void LockPosition()
    {
        if (!_positionLocked && _rect != null)
        {
            _lockedPosition = _rect.anchoredPosition;
            _positionLocked = true;
        }
    }
    
    protected virtual void RestorePosition()
    {
        if (_positionLocked && _rect != null)
        {
            Vector2 currentPos = _rect.anchoredPosition;
            if (Vector2.Distance(currentPos, _lockedPosition) > 0.01f)
            {
                _rect.anchoredPosition = _lockedPosition;
            }
        }
    }
    
    protected virtual void LateUpdate()
    {
        if (_positionLocked && _rect != null)
        {
            RestorePosition();
        }
    }
}
```

## Summary

The key lessons learned:

1. **Lock positions when first set** - Don't let parent movement affect child positions
2. **Restore positions on every update** - Multiple state updates shouldn't cause drift
3. **Use locked positions for animations** - Animations should target stable positions
4. **Enforce continuously** - `LateUpdate` ensures positions stay locked
5. **Avoid layout rebuilds** - Use `CanvasGroup.alpha` instead of `SetActive()`

By following these practices, all UI components (cards, chips, labels, animations, etc.) will maintain their positions and work correctly even when:
- Parent containers move
- State updates occur frequently
- Layout system recalculates
- Animations are interrupted
- Content visibility changes

