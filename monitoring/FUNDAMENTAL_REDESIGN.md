# BrokenPromise: Fundamental System Redesign

**Question**: Why fix broken things when we can build BrokenPromise - a system that's guaranteed to work?

**Answer**: You're absolutely right. Let's identify what's fundamentally wrong and design BrokenPromise - correct by design.

**BrokenPromise** - A constant reminder that AI should never be trusted. The system hunts down and eliminates ALL errors, and includes comprehensive compliance verification to detect when the AI is lying.

---

## 🔍 Fundamental Problems with Current Approach

### Problem 1: **Dual State Management** (Files + Variables)
**Current**: State exists in TWO places:
- Script variables (`$script:isInvestigating`, `$script:investigationStartTime`)
- Status file (`monitor-status.json`)

**Why This Is Fundamentally Broken**:
- Race conditions: Script updates variable, file update happens later
- Stale data: File says one thing, script says another
- No single source of truth
- Sync issues are inevitable

**Correct Approach**: **Single Source of Truth**
- One state store (database, in-memory with persistence, or event log)
- All reads/writes go through one interface
- No possibility of sync issues

---

### Problem 2: **Reactive Detection** (Wait for Errors)
**Current**: Monitor reads logs, looks for error patterns, then reacts

**Why This Is Fundamentally Broken**:
- Can't catch issues that don't log errors
- Can't catch issues before they become errors
- Pattern matching is fragile (misses variations)
- By the time we detect, damage is done

**Correct Approach**: **Proactive Verification**
- Continuously verify state is correct
- Check invariants after every operation
- Detect issues immediately, not when they log
- Prevent issues, don't just detect them

---

### Problem 3: **File-Based Communication** (JSON Files)
**Current**: Monitor writes `pending-issues.json`, AI reads it, writes `fix-applied.json`, monitor reads it

**Why This Is Fundamentally Broken**:
- File I/O is slow and can fail
- No atomicity (partial writes possible)
- No locking (race conditions)
- No versioning (stale reads)
- No real-time updates (polling required)

**Correct Approach**: **Event-Driven Communication**
- Events/messages instead of files
- Real-time updates
- Guaranteed delivery
- No polling needed

---

### Problem 4: **Investigation as State** (Complex State Machine)
**Current**: Investigation has multiple states (not started, starting, active, completing, completed) managed across files and variables

**Why This Is Fundamentally Broken**:
- State transitions can be missed
- State can get stuck
- No clear state machine
- Hard to debug what state we're in

**Correct Approach**: **Explicit State Machine**
- Clear state definitions
- Explicit transitions
- State machine enforces valid transitions
- Can't get into invalid states

---

### Problem 5: **Pattern Matching for Detection** (Fragile)
**Current**: Regex patterns to find errors in logs

**Why This Is Fundamentally Broken**:
- Patterns miss variations
- False positives
- Can't detect new issue types
- Doesn't understand context

**Correct Approach**: **State Verification**
- Verify state is correct, not just look for error strings
- Understand what "correct" means
- Catch any deviation from correct
- Context-aware

---

### Problem 6: **Blocking Operations** (Synchronous I/O)
**Current**: Some operations block (even though we've been fixing this)

**Why This Is Fundamentally Broken**:
- Monitor loop can hang
- Can't respond to new issues while blocked
- Poor user experience
- Timing issues

**Correct Approach**: **Fully Async Architecture**
- Everything async
- Event-driven
- Never blocks
- Responsive

---

## 🎯 Correct-by-Design Architecture

### Core Principle: **State Verification, Not Error Detection**

Instead of: "Did something log an error?"  
We ask: "Is the state correct right now?"

### Architecture Components:

```
┌─────────────────────────────────────────────────────────┐
│              State Store (Single Source of Truth)      │
│  - In-memory state with persistence                     │
│  - Event log for history                                │
│  - Atomic operations                                     │
│  - Real-time updates                                     │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ State        │  │ Event        │  │ Verification │
│ Machine      │  │ Bus          │  │ Engine       │
│ (Explicit    │  │ (Real-time   │  │ (Continuous  │
│  States)     │  │  Events)     │  │  Checks)     │
└──────────────┘  └──────────────┘  └──────────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Issue        │  │ Auto-Fix     │  │ Knowledge    │
│ Detection    │  │ System       │  │ Base         │
│ (State-based)│  │ (Event-      │  │ (Learning)   │
│              │  │  driven)     │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## 🏗️ New System Design

### 1. **State Store** (Single Source of Truth)

```javascript
class StateStore {
  constructor() {
    this.state = {
      investigation: {
        status: 'idle', // idle | starting | active | completing | completed
        startTime: null,
        timeout: 15,
        issues: []
      },
      unity: {
        paused: false,
        pauseReason: null,
        lastPauseTime: null
      },
      services: {
        server: { running: false, lastCheck: null },
        database: { running: false, lastCheck: null },
        unity: { running: false, connected: false, lastCheck: null }
      },
      // ... all state in one place
    };
    
    this.eventLog = []; // All state changes logged
    this.listeners = new Map(); // Event listeners
  }
  
  // Atomic state update
  updateState(path, value) {
    // Update state atomically
    // Log event
    // Notify listeners
    // Persist to disk (async)
  }
  
  // Get state (always current)
  getState(path) {
    return this.state[path];
  }
  
  // Subscribe to state changes
  subscribe(path, callback) {
    // Real-time updates when state changes
  }
}
```

**Benefits**:
- ✅ Single source of truth
- ✅ No sync issues
- ✅ Real-time updates
- ✅ Atomic operations
- ✅ Event history

---

### 2. **State Machine** (Explicit States)

```javascript
class InvestigationStateMachine {
  constructor(stateStore) {
    this.stateStore = stateStore;
    this.states = {
      idle: {
        canTransitionTo: ['starting'],
        onEnter: () => {},
        onExit: () => {}
      },
      starting: {
        canTransitionTo: ['active', 'idle'],
        onEnter: () => {
          this.stateStore.updateState('investigation.startTime', Date.now());
        },
        onExit: () => {}
      },
      active: {
        canTransitionTo: ['completing', 'idle'],
        onEnter: () => {},
        onExit: () => {}
      },
      completing: {
        canTransitionTo: ['completed', 'active'],
        onEnter: () => {},
        onExit: () => {}
      },
      completed: {
        canTransitionTo: ['idle'],
        onEnter: () => {
          // Cleanup
        },
        onExit: () => {}
      }
    };
  }
  
  transition(newState) {
    const currentState = this.stateStore.getState('investigation.status');
    
    // Validate transition
    if (!this.states[currentState].canTransitionTo.includes(newState)) {
      throw new Error(`Invalid transition: ${currentState} -> ${newState}`);
    }
    
    // Execute transition
    this.states[currentState].onExit();
    this.stateStore.updateState('investigation.status', newState);
    this.states[newState].onEnter();
  }
}
```

**Benefits**:
- ✅ Can't get into invalid states
- ✅ Clear state definitions
- ✅ Easy to debug
- ✅ Enforced transitions

---

### 3. **Event Bus** (Real-Time Communication)

```javascript
class EventBus {
  constructor() {
    this.listeners = new Map();
  }
  
  emit(event, data) {
    // Emit event to all listeners
    // Guaranteed delivery
    // Real-time (no polling)
  }
  
  subscribe(event, callback) {
    // Subscribe to events
    // Real-time updates
  }
}

// Usage:
eventBus.emit('investigation.started', { issueId: '...' });
eventBus.emit('unity.paused', { reason: '...' });
eventBus.emit('fix.applied', { fixId: '...' });
```

**Benefits**:
- ✅ Real-time communication
- ✅ No file polling
- ✅ Guaranteed delivery
- ✅ Decoupled components

---

### 4. **State Verification Engine** (Proactive)

```javascript
class StateVerifier {
  constructor(stateStore, eventBus) {
    this.stateStore = stateStore;
    this.eventBus = eventBus;
    this.contracts = new Map(); // Operation contracts
  }
  
  // Verify state after every operation
  verify(operation, beforeState, afterState) {
    const contract = this.contracts.get(operation);
    
    // Check invariants
    for (const invariant of contract.invariants) {
      if (!invariant(beforeState, afterState)) {
        // Issue detected!
        this.eventBus.emit('issue.detected', {
          type: 'INVARIANT_VIOLATION',
          operation,
          invariant,
          beforeState,
          afterState
        });
      }
    }
  }
  
  // Continuous verification
  startContinuousVerification() {
    setInterval(() => {
      // Verify all critical state
      this.verifyAll();
    }, 1000); // Every second
  }
}
```

**Benefits**:
- ✅ Catches issues immediately
- ✅ Doesn't rely on error logs
- ✅ Understands what "correct" means
- ✅ Prevents issues, not just detects

---

### 5. **Issue Detection** (State-Based, Not Pattern-Based)

```javascript
class IssueDetector {
  constructor(stateStore, stateVerifier, eventBus) {
    this.stateStore = stateStore;
    this.stateVerifier = stateVerifier;
    this.eventBus = eventBus;
  }
  
  // Listen for state verification failures
  start() {
    this.eventBus.subscribe('issue.detected', (issue) => {
      // Issue detected via state verification
      this.handleIssue(issue);
    });
    
    // Also listen for anomalies
    this.eventBus.subscribe('anomaly.detected', (anomaly) => {
      this.handleIssue(anomaly);
    });
  }
  
  handleIssue(issue) {
    // Group related issues
    // Start investigation if needed
    // Emit investigation events
  }
}
```

**Benefits**:
- ✅ State-based (not pattern-based)
- ✅ Catches all issues
- ✅ Context-aware
- ✅ Real-time

---

## 🔄 How It Works Together

### Example: Investigation Flow

**Old Way** (Broken):
1. Script sets `$script:isInvestigating = true`
2. Later writes to `monitor-status.json`
3. File might not sync
4. Status file might be stale
5. Investigation gets stuck

**New Way** (Correct):
1. State machine transitions: `idle -> starting`
2. State store updates atomically
3. Event bus emits: `investigation.starting`
4. All listeners get real-time update
5. State machine enforces valid transitions
6. Can't get stuck (invalid states impossible)

---

## 📋 Implementation Strategy

### Phase 1: Build State Store
- Single source of truth
- Atomic operations
- Event log
- Persistence

### Phase 2: Build State Machine
- Explicit states
- Enforced transitions
- Replace investigation logic

### Phase 3: Build Event Bus
- Real-time communication
- Replace file-based communication

### Phase 4: Build State Verifier
- Continuous verification
- Replace pattern matching

### Phase 5: Integrate Everything
- All components work together
- Test thoroughly

---

## 🎯 Key Principles

1. **Single Source of Truth**: One state store, no sync issues
2. **State Verification**: Verify correctness, not just detect errors
3. **Event-Driven**: Real-time updates, no polling
4. **Explicit State Machine**: Can't get into invalid states
5. **Proactive**: Prevent issues, don't just detect
6. **Async Everything**: Never block, always responsive

---

## 🤔 Questions to Answer

1. **State Store**: In-memory with persistence? Database? Event log?
2. **Event Bus**: WebSocket? Message queue? In-process?
3. **State Machine**: Library? Custom? How complex?
4. **Migration**: How to migrate from old to new?
5. **Testing**: How to test state machine? Event bus?

---

**The key insight**: Don't fix broken patterns. Design correct patterns from the start.

**What do you think? Should we build this new architecture instead of patching the old one?**
