# Systematic Debugging Plan - Missing Chips Problem

## Goal
Isolate where chips are being lost by systematically commenting out code sections.

## Strategy
1. **Comment out all "fix" attempts** - Remove all the band-aid fixes
2. **Keep only core logic** - Test with minimal code
3. **Add back one section at a time** - Find which section causes the problem

## Key Locations to Test

### Pot Clearing Locations (in order of when they should happen):

1. **`calculateAndAwardSidePots` (line ~7834)** - Should clear pot AFTER awarding side pots
   - This is the CORRECT place to clear pot after a hand ends
   - Keep this one active first

2. **`awardPot` (line ~8303, ~8468)** - Should clear pot AFTER awarding to winner
   - This is also a CORRECT place
   - Keep this one active first

3. **`startNewHand` (lines 2414, 2742, 2760, 2828)** - Multiple "fix" attempts
   - These are BAND-AID fixes trying to clear pot that wasn't cleared earlier
   - COMMENT THESE OUT FIRST - they're masking the real problem

## Testing Plan

### Phase 1: Comment out all startNewHand "fixes"
- Comment out lines 2400-2427 (immediate clear at start)
- Comment out lines 2732-2751 (before PRE-RESET clear)
- Comment out lines 2757-2825 (final clear before capture)
- Comment out lines 2826-2875 (force clear)
- Keep ONLY the pot clearing in `calculateAndAwardSidePots` and `awardPot`
- Test: Does pot get cleared properly?

### Phase 2: If pot still not cleared
- Check if `calculateAndAwardSidePots` is actually being called
- Check if `awardPot` is actually being called
- Add logging to see which path is taken

### Phase 3: Test betting logic
- Comment out betting logic temporarily
- See if chips are lost during betting or during pot award
- Isolate: Is the problem in betting or in pot clearing?

## Next Steps
1. Start with Phase 1 - comment out all startNewHand fixes
2. Run simulation
3. Check logs to see if pot gets cleared in the correct places
4. If not, investigate why calculateAndAwardSidePots/awardPot aren't clearing it
