# 🚨 AGENT RULES - READ FIRST, OBEY ALWAYS 🚨

**THESE ARE NON-NEGOTIABLE. VIOLATION = THEFT OF USER'S TIME AND MONEY.**

## LAW 1: PULL BOTH REPOS FIRST
```powershell
# Server repo (Node.js backend)
cd c:\Users\Becca\source\repos\poker-server; git pull

# Client repo (Unity frontend)  
cd C:\Projects\poker-client-unity; git pull
```
**This happens BEFORE you respond to the user. BEFORE you do anything else. FIRST.**

If user says "get files" or "update" or starts a new session → PULL BOTH REPOS.

Not one. BOTH. Every time. No exceptions.

### VERIFYING FILES MATCH (After Pulling)
After pulling, verify you have the latest files and they match remote:
```powershell
# Check latest commit on server
cd c:\Users\Becca\source\repos\poker-server; git log --oneline -1

# Check latest commit on client
cd C:\Projects\poker-client-unity; git log --oneline -1

# Check if working tree is clean (no uncommitted changes)
cd c:\Users\Becca\source\repos\poker-server; git status
cd C:\Projects\poker-client-unity; git status

# Verify you're on the right branch and up to date
cd c:\Users\Becca\source\repos\poker-server; git branch; git status
cd C:\Projects\poker-client-unity; git branch; git status
```

**If git status shows uncommitted changes:**
- Local changes exist that aren't in the repo
- Either commit and push them, or stash/discard them: `git stash` or `git restore .`
- Goal: Working tree should be clean and match remote exactly

**If commits don't match what you expect:**
- Check commit messages to verify you have the right version
- Latest commits should match what was pushed before leaving
- If unsure, check commit timestamps: `git log --format="%h %ai %s" -5`
- Compare with remote: `git fetch; git log origin/master --oneline -5`

**CRITICAL:** Both repos MUST be pushed before leaving work session. Always verify with `git status` that working tree is clean and `git log -1` shows the latest commit you expect.

## LAW 2: CHECK PAST PROBLEMS FIRST
Before solving ANY problem, search CHANGELOG.md for matching issues. The solution probably already exists.
`Ctrl+F` the error message, the symptom, the feature name. If it's been solved before, use that solution.
Don't reinvent. Don't guess. CHECK FIRST.

## LAW 3: DOCUMENT FIXES IMMEDIATELY  
When you fix ANY bug → add it to CHANGELOG.md BEFORE moving on. Not later. NOW.

## LAW 4: COMMIT AUTOMATICALLY
After code changes: `git add -A; git commit -m "message"; git push`
Don't wait to be asked.

## LAW 5: NO BANDAIDS
Fix root causes. Install real dependencies. No mock mode. No workarounds.

## LAW 6: ONE LOG FILE
All fixes and issues go in CHANGELOG.md. Not in separate files.

## LAW 7: WHEN STUCK, RESET
If you're patching errors one-by-one for more than 15 minutes, STOP.
Find the last working commit: `git log --oneline`
Reset to it: `git reset --hard <commit>`
Don't waste hours on what takes 30 seconds.

## LAW 8: GREP BOTH SIDES TO FIND MISMATCHES
When something isn't working between client and server, **grep both codebases** for the exact strings involved.

**The commands that find answers fast:**
```powershell
# What does server ACTUALLY emit?
grep "socket.emit.*event_name" src/sockets/SocketHandler.js

# What does client ACTUALLY expect?
grep "eventName.*response" Assets/Scripts/Networking/SocketManager.cs -A 10

# What response format does server send?
grep "callback.*success" src/sockets/SocketHandler.js -A 5

# What response format does client expect?
grep "class.*Response" Assets/Scripts/Networking/NetworkModels.cs -A 10
```

**Pattern:** When client is stuck, server logs show success → MISMATCH between what server sends and what client listens for. Grep both sides, compare the exact strings.

## LAW 9: SIMULATION SAYS IT ALL - NEVER ASK USER TO DESCRIBE

The simulation system must capture EVERYTHING. If you have to ask the user "what happened?" or "can you describe the bug?", **YOU HAVE FAILED.**

**Required logging for every feature:**
1. **Every button click** - log what was clicked, current state, parameters
2. **Every state change** - log before/after values
3. **Every server request** - log request params, response, errors
4. **Every phase transition** - log from/to phase, player counts, timers

**When something bugs out:**
1. Check server console logs FIRST
2. Check Unity console logs SECOND
3. Check simulation.log and socketbot.log THIRD
4. The logs MUST tell you what went wrong

**Before testing:** Always verify server is running:
```powershell
Get-Process node -ErrorAction SilentlyContinue
```

If logging is insufficient to diagnose a problem → ADD MORE LOGGING before asking user.

---

## LAW 10: USE STATE COMPARISON TO FIND BUGS

**CRITICAL: Simulation tables ALWAYS capture state snapshots automatically.**
**Real/practice tables require ENABLE_STATE_SNAPSHOTS=true to capture snapshots.**

To compare simulation vs real games:
1. Run a simulation (snapshots auto-enabled)
2. Run a real/practice game with ENABLE_STATE_SNAPSHOTS=true
3. Run: `npm run compare-states --latest` or `npm run compare-states <simId> <realId>`
4. Review differences and fix issues

See `COMPARISON_WORKFLOW.md` for detailed instructions.

**CRITICAL:** Simulation and real games use the SAME code path. Comparing them finds bugs automatically.

**When debugging game logic issues:**
1. **Enable state snapshots**: `$env:ENABLE_STATE_SNAPSHOTS="true"; npm start`
2. **Run simulation** with the bug scenario
3. **Play real game** with same table settings
4. **Compare states**: `npm run compare-states <tableId>`
5. **Review differences** - they show exactly where logic diverges

**State snapshots capture:**
- Pot amounts, bets, blinds
- Community cards, seat states
- Turn order, phase transitions
- All state changes in structured JSON

**Comparison finds:**
- Pot calculation errors
- Betting logic bugs
- Card dealing issues
- Turn order problems
- Any state divergence

**Files:**
- `logs/state_snapshots/` - State JSON files
- `logs/comparisons/` - Comparison reports
- `TESTING.md` - Full testing guide

**If simulation and real game diverge → BUG FOUND. Fix the code, don't compare code paths (they're the same).**

---

## 🚨 MANDATORY PRE-FLIGHT CHECKLIST (DO THIS EVERY SESSION START)

Before writing ANY code, complete these steps:

### 🚨 Step 0: PULL BOTH REPOS FIRST!!! 🚨
```powershell
# Server repo (Node.js backend)
cd c:\Users\Becca\source\repos\poker-server; git pull

# Client repo (Unity frontend)
cd C:\Projects\poker-client-unity; git pull
```

**VERIFY FILES MATCH:**
```powershell
# Check latest commits match
cd c:\Users\Becca\source\repos\poker-server; git log --oneline -1
cd C:\Projects\poker-client-unity; git log --oneline -1

# Verify no uncommitted local changes
cd c:\Users\Becca\source\repos\poker-server; git status
cd C:\Projects\poker-client-unity; git status

# Verify branch and remote sync
cd c:\Users\Becca\source\repos\poker-server; git branch; git fetch; git status
cd C:\Projects\poker-client-unity; git branch; git fetch; git status
```

**If git status shows changes:**
- You have local files not in the repo
- Either commit/push them OR discard them to match remote exactly: `git restore .`
- Working tree MUST be clean to ensure you have the right files
- If you see "Your branch is behind 'origin/master'", run `git pull` again

### Step 1: Read Critical Issues
- [ ] Check CHANGELOG.md for similar issues
- [ ] Search for error messages in CHANGELOG.md
- [ ] Check if solution already exists

### Step 2: Verify Patterns Before Coding
- [ ] Check Socket.IO event naming: `event_name` → `event_name_response`
- [ ] Verify response format: `{ success, error?, ...data }`
- [ ] Check Unity client pattern for Emit calls

### Step 3: Before Any Socket.IO Work
- [ ] Is `SOCKET_IO_AVAILABLE` in Scripting Define Symbols for current platform?
- [ ] Am I adding response classes to NetworkModels.cs (not GameService.cs)?
- [ ] Am I using the `Emit<T>` pattern that uses JsonUtility?
- [ ] Does the server emit BOTH callback() AND socket.emit('event_response')?

### Step 4: Before Committing
- [ ] Did I document any new issues/solutions in CHANGELOG.md?
- [ ] Did I commit and push changes?

### Step 5: When Debugging Game Logic
- [ ] Did I enable state snapshots? (`ENABLE_STATE_SNAPSHOTS=true`)
- [ ] Did I run simulation to reproduce the bug?
- [ ] Did I compare simulation vs real game states?
- [ ] Did I check comparison report for differences?

---

**FAILURE TO COMPLETE THIS CHECKLIST = REPEATING PAST MISTAKES = WASTING USER'S TIME AND MONEY**

