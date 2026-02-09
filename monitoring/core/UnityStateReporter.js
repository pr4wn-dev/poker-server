/**
 * UnityStateReporter - Handles Unity state reports and verification
 * 
 * BrokenPromise component that receives Unity UI/audio state from Unity client
 * and compares it against server state to detect mismatches.
 */

const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

class UnityStateReporter extends EventEmitter {
    constructor(stateStore, issueDetector) {
        super();
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        
        // Track Unity state reports
        this.unityStateHistory = [];
        this.maxHistorySize = 1000;
        
        // State verification cache (to avoid duplicate checks)
        this.lastVerification = new Map(); // componentId -> timestamp
        this.verificationCooldown = 5000; // 5 seconds between verifications
    }
    
    /**
     * Handle Unity state report from client
     * Called when Unity emits 'report_unity_state' Socket.IO event
     */
    handleUnityStateReport(userId, stateReport) {
        try {
            const {
                timestamp = Date.now(),
                uiState = {},
                audioState = {},
                animationState = {},
                gameState = {}
            } = stateReport;
            
            // Create unified state record
            const unityState = {
                userId,
                timestamp,
                ui: this.normalizeUIState(uiState),
                audio: this.normalizeAudioState(audioState),
                animations: this.normalizeAnimationState(animationState),
                game: gameState
            };
            
            // Update StateStore
            this.updateStateStore(unityState);
            
            // Verify state against server expectations
            this.verifyUnityState(userId, unityState);
            
            // Add to history
            this.unityStateHistory.push(unityState);
            if (this.unityStateHistory.length > this.maxHistorySize) {
                this.unityStateHistory.shift();
            }
            
            // Emit event
            this.emit('unityStateReported', unityState);
            
        } catch (error) {
            gameLogger.error('BrokenPromise', '[UNITY_STATE_REPORTER] HANDLE_REPORT_ERROR', {
                userId,
                error: error.message,
                stack: error.stack
            });
        }
    }
    
    /**
     * Normalize UI state from Unity
     */
    normalizeUIState(uiState) {
        const normalized = {
            labels: new Map(),
            images: new Map(),
            buttons: new Map(),
            panels: new Map()
        };
        
        // Normalize labels
        if (uiState.labels && Array.isArray(uiState.labels)) {
            for (const label of uiState.labels) {
                if (label.id) {
                    normalized.labels.set(label.id, {
                        text: label.text || '',
                        visible: label.visible !== false,
                        color: label.color || '#FFFFFF',
                        enabled: label.enabled !== false
                    });
                }
            }
        }
        
        // Normalize images
        if (uiState.images && Array.isArray(uiState.images)) {
            for (const image of uiState.images) {
                if (image.id) {
                    normalized.images.set(image.id, {
                        sprite: image.sprite || null,
                        visible: image.visible !== false,
                        color: image.color || '#FFFFFF',
                        enabled: image.enabled !== false
                    });
                }
            }
        }
        
        // Normalize buttons
        if (uiState.buttons && Array.isArray(uiState.buttons)) {
            for (const button of uiState.buttons) {
                if (button.id) {
                    normalized.buttons.set(button.id, {
                        text: button.text || '',
                        visible: button.visible !== false,
                        enabled: button.enabled !== false,
                        interactable: button.interactable !== false
                    });
                }
            }
        }
        
        // Normalize panels
        if (uiState.panels && Array.isArray(uiState.panels)) {
            for (const panel of uiState.panels) {
                if (panel.id) {
                    normalized.panels.set(panel.id, {
                        visible: panel.visible !== false,
                        active: panel.active !== false
                    });
                }
            }
        }
        
        return normalized;
    }
    
    /**
     * Normalize audio state from Unity
     */
    normalizeAudioState(audioState) {
        const normalized = {
            sounds: new Map(),
            music: new Map(),
            volume: {
                master: audioState.masterVolume || 1.0,
                sfx: audioState.sfxVolume || 1.0,
                music: audioState.musicVolume || 1.0
            }
        };
        
        // Normalize sounds
        if (audioState.sounds && Array.isArray(audioState.sounds)) {
            for (const sound of audioState.sounds) {
                if (sound.id) {
                    normalized.sounds.set(sound.id, {
                        playing: sound.playing === true,
                        volume: sound.volume || 1.0,
                        clip: sound.clip || null,
                        loop: sound.loop === true
                    });
                }
            }
        }
        
        // Normalize music
        if (audioState.music && Array.isArray(audioState.music)) {
            for (const music of audioState.music) {
                if (music.id) {
                    normalized.music.set(music.id, {
                        playing: music.playing === true,
                        volume: music.volume || 1.0,
                        clip: music.clip || null,
                        loop: music.loop === true
                    });
                }
            }
        }
        
        return normalized;
    }
    
    /**
     * Normalize animation state from Unity
     */
    normalizeAnimationState(animationState) {
        const normalized = new Map();
        
        if (animationState.animations && Array.isArray(animationState.animations)) {
            for (const anim of animationState.animations) {
                if (anim.id) {
                    normalized.set(anim.id, {
                        playing: anim.playing === true,
                        progress: anim.progress || 0,
                        speed: anim.speed || 1.0,
                        name: anim.name || ''
                    });
                }
            }
        }
        
        return normalized;
    }
    
    /**
     * Update StateStore with Unity state
     */
    updateStateStore(unityState) {
        try {
            const currentUnity = this.stateStore.getState('system.unity') || {};
            
            // Update UI state
            const uiState = {
                labels: Array.from(unityState.ui.labels.entries()).map(([id, data]) => ({ id, ...data })),
                images: Array.from(unityState.ui.images.entries()).map(([id, data]) => ({ id, ...data })),
                buttons: Array.from(unityState.ui.buttons.entries()).map(([id, data]) => ({ id, ...data })),
                panels: Array.from(unityState.ui.panels.entries()).map(([id, data]) => ({ id, ...data }))
            };
            
            // Update audio state
            const audioState = {
                sounds: Array.from(unityState.audio.sounds.entries()).map(([id, data]) => ({ id, ...data })),
                music: Array.from(unityState.audio.music.entries()).map(([id, data]) => ({ id, ...data })),
                volume: unityState.audio.volume
            };
            
            // Update animations
            const animations = Array.from(unityState.animations.entries()).map(([id, data]) => ({ id, ...data }));
            
            // Update StateStore
            this.stateStore.updateState('system.unity', {
                ...currentUnity,
                status: 'running',
                lastCheck: unityState.timestamp,
                uiState: {
                    labels: new Map(uiState.labels.map(item => [item.id, item])),
                    images: new Map(uiState.images.map(item => [item.id, item])),
                    sounds: new Map(audioState.sounds.map(item => [item.id, item])),
                    animations: new Map(animations.map(item => [item.id, item]))
                }
            });
            
        } catch (error) {
            gameLogger.error('BrokenPromise', '[UNITY_STATE_REPORTER] UPDATE_STATE_ERROR', {
                error: error.message,
                stack: error.stack
            });
        }
    }
    
    /**
     * Verify Unity state against server expectations
     */
    verifyUnityState(userId, unityState) {
        try {
            const gameState = this.stateStore.getState('game');
            const serverState = this.stateStore.getState('system.server');
            
            // Check if user is at a table
            const playerTable = this.findPlayerTable(userId, gameState);
            if (!playerTable) {
                // Not at a table, skip verification
                return;
            }
            
            // Verify UI state matches server expectations
            this.verifyUIState(userId, unityState, playerTable);
            
            // Verify audio state
            this.verifyAudioState(userId, unityState, playerTable);
            
        } catch (error) {
            gameLogger.error('BrokenPromise', '[UNITY_STATE_REPORTER] VERIFY_ERROR', {
                userId,
                error: error.message,
                stack: error.stack
            });
        }
    }
    
    /**
     * Find player's table from game state
     */
    findPlayerTable(userId, gameState) {
        if (!gameState || !gameState.tables) {
            return null;
        }
        
        for (const table of Object.values(gameState.tables)) {
            if (table.seats) {
                for (const seat of table.seats) {
                    if (seat && seat.playerId === userId) {
                        return table;
                    }
                }
            }
        }
        
        return null;
    }
    
    /**
     * Verify UI state matches server expectations
     */
    verifyUIState(userId, unityState, table) {
        const issues = [];
        
        // Check critical UI elements based on game phase
        const phase = table.phase || 'waiting';
        const playerSeat = this.findPlayerSeat(userId, table);
        
        if (!playerSeat) {
            return;
        }
        
        // Example: If it's player's turn, action buttons should be visible
        if (phase !== 'waiting' && table.currentPlayerIndex === playerSeat.index) {
            const actionButtons = ['fold', 'check', 'call', 'bet', 'raise', 'allin'];
            for (const buttonId of actionButtons) {
                const button = unityState.ui.buttons.get(buttonId);
                if (!button || !button.visible || !button.enabled) {
                    issues.push({
                        type: 'UI_MISMATCH',
                        component: `button_${buttonId}`,
                        expected: { visible: true, enabled: true },
                        actual: button ? { visible: button.visible, enabled: button.enabled } : { visible: false, enabled: false },
                        severity: 'high'
                    });
                }
            }
        }
        
        // Report issues
        if (issues.length > 0 && this.issueDetector) {
            for (const issue of issues) {
                this.issueDetector.detectIssue({
                    type: issue.type,
                    severity: issue.severity,
                    method: 'unityStateReporter',
                    details: {
                        userId,
                        tableId: table.id,
                        component: issue.component,
                        expected: issue.expected,
                        actual: issue.actual
                    },
                    timestamp: Date.now()
                });
            }
        }
    }
    
    /**
     * Verify audio state
     */
    verifyAudioState(userId, unityState, table) {
        // Check if critical sounds should be playing
        const phase = table.phase || 'waiting';
        
        // Example: If cards are being dealt, deal sound should play
        // This is a placeholder - expand based on actual game requirements
        
        // For now, just verify volume levels are reasonable
        if (unityState.audio.volume.master < 0 || unityState.audio.volume.master > 1) {
            if (this.issueDetector) {
                this.issueDetector.detectIssue({
                    type: 'AUDIO_MISMATCH',
                    severity: 'medium',
                    method: 'unityStateReporter',
                    details: {
                        userId,
                        tableId: table.id,
                        issue: 'Master volume out of range',
                        value: unityState.audio.volume.master
                    },
                    timestamp: Date.now()
                });
            }
        }
    }
    
    /**
     * Find player's seat in table
     */
    findPlayerSeat(userId, table) {
        if (!table.seats) {
            return null;
        }
        
        for (const seat of table.seats) {
            if (seat && seat.playerId === userId) {
                return seat;
            }
        }
        
        return null;
    }
    
    /**
     * Get Unity state history
     */
    getStateHistory(limit = 100) {
        return this.unityStateHistory.slice(-limit);
    }
    
    /**
     * Get current Unity state for user
     */
    getCurrentState(userId) {
        const unityState = this.stateStore.getState('system.unity');
        if (!unityState) {
            return null;
        }
        
        // Find most recent state for this user
        for (let i = this.unityStateHistory.length - 1; i >= 0; i--) {
            if (this.unityStateHistory[i].userId === userId) {
                return this.unityStateHistory[i];
            }
        }
        
        return null;
    }
}

module.exports = UnityStateReporter;
