/**
 * StateAnalyzer - Analyzes state snapshots to find patterns and potential bugs
 * 
 * Goes beyond simple comparison to identify:
 * - State transitions that shouldn't happen
 * - Missing state updates
 * - Timing issues
 * - Inconsistencies in game flow
 */

const StateSnapshot = require('./StateSnapshot');
const fs = require('fs');
const path = require('path');

class StateAnalyzer {
    constructor() {
        this.logDir = path.join(__dirname, '../../logs/analysis');
        
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    
    /**
     * Analyze a single state snapshot log for issues
     */
    analyzeLog(logPath) {
        const data = StateSnapshot.load(logPath);
        if (!data) {
            return { error: 'Could not load log file' };
        }
        
        const issues = [];
        
        // Check for missing state transitions
        const phases = data.snapshots.map(s => s.phase);
        const expectedTransitions = [
            ['waiting', 'ready_up'],
            ['ready_up', 'countdown'],
            ['countdown', 'preflop'],
            ['preflop', 'flop'],
            ['flop', 'turn'],
            ['turn', 'river'],
            ['river', 'showdown'],
            ['showdown', 'waiting']
        ];
        
        for (let i = 0; i < phases.length - 1; i++) {
            const from = phases[i];
            const to = phases[i + 1];
            const isValid = expectedTransitions.some(([f, t]) => f === from && t === to);
            
            if (!isValid && from !== to) {
                issues.push({
                    type: 'invalid_phase_transition',
                    severity: 'high',
                    from,
                    to,
                    snapshotIndex: i,
                    timestamp: data.snapshots[i].timestamp
                });
            }
        }
        
        // Check for pot calculation issues
        let lastPot = 0;
        for (let i = 0; i < data.snapshots.length; i++) {
            const snap = data.snapshots[i];
            if (snap.phase === 'waiting' && snap.pot > 0) {
                issues.push({
                    type: 'pot_not_cleared',
                    severity: 'high',
                    pot: snap.pot,
                    snapshotIndex: i,
                    timestamp: snap.timestamp
                });
            }
            
            // Check for pot decreasing (should only increase or reset to 0)
            if (snap.pot < lastPot && lastPot > 0 && snap.phase !== 'waiting') {
                issues.push({
                    type: 'pot_decreased',
                    severity: 'high',
                    previousPot: lastPot,
                    currentPot: snap.pot,
                    diff: lastPot - snap.pot,
                    snapshotIndex: i,
                    timestamp: snap.timestamp
                });
            }
            
            lastPot = snap.pot;
        }
        
        // Check for seat inconsistencies
        for (let i = 0; i < data.snapshots.length; i++) {
            const snap = data.snapshots[i];
            const seatCount = snap.seats.filter(s => s !== null).length;
            const activeSeats = snap.seats.filter(s => s && !s.isFolded && s.chips > 0).length;
            
            // Check for players with negative chips
            for (const seat of snap.seats) {
                if (seat && seat.chips < 0) {
                    issues.push({
                        type: 'negative_chips',
                        severity: 'high',
                        playerId: seat.playerId,
                        playerName: seat.name,
                        chips: seat.chips,
                        snapshotIndex: i,
                        timestamp: snap.timestamp
                    });
                }
            }
            
            // Check for betting phase with no active players
            if (['preflop', 'flop', 'turn', 'river'].includes(snap.phase) && activeSeats === 0) {
                issues.push({
                    type: 'betting_phase_no_active_players',
                    severity: 'high',
                    phase: snap.phase,
                    snapshotIndex: i,
                    timestamp: snap.timestamp
                });
            }
        }
        
        // Check for turn order issues
        for (let i = 0; i < data.snapshots.length - 1; i++) {
            const current = data.snapshots[i];
            const next = data.snapshots[i + 1];
            
            // If phase changed, currentPlayerIndex should reset or change
            if (current.phase !== next.phase && 
                ['preflop', 'flop', 'turn', 'river'].includes(next.phase) &&
                next.currentPlayerIndex < 0) {
                issues.push({
                    type: 'no_current_player_after_phase_change',
                    severity: 'medium',
                    fromPhase: current.phase,
                    toPhase: next.phase,
                    snapshotIndex: i + 1,
                    timestamp: next.timestamp
                });
            }
        }
        
        return {
            tableId: data.tableId,
            tableName: data.tableName,
            isSimulation: data.isSimulation,
            snapshotCount: data.snapshotCount,
            issues,
            issueCount: issues.length,
            highSeverityIssues: issues.filter(i => i.severity === 'high').length
        };
    }
    
    /**
     * Compare two logs and find differences with context
     */
    compareWithContext(simLogPath, realLogPath) {
        const simAnalysis = this.analyzeLog(simLogPath);
        const realAnalysis = this.analyzeLog(realLogPath);
        
        // Find issues that exist in one but not the other
        const uniqueSimIssues = simAnalysis.issues.filter(simIssue => {
            return !realAnalysis.issues.some(realIssue => 
                realIssue.type === simIssue.type &&
                Math.abs(realIssue.timestamp - simIssue.timestamp) < 1000
            );
        });
        
        const uniqueRealIssues = realAnalysis.issues.filter(realIssue => {
            return !simAnalysis.issues.some(simIssue => 
                simIssue.type === realIssue.type &&
                Math.abs(simIssue.timestamp - realIssue.timestamp) < 1000
            );
        });
        
        return {
            simAnalysis,
            realAnalysis,
            uniqueSimIssues,
            uniqueRealIssues,
            // Issues that appear in both (likely real bugs)
            commonIssues: simAnalysis.issues.filter(simIssue => {
                return realAnalysis.issues.some(realIssue => 
                    realIssue.type === simIssue.type
                );
            })
        };
    }
    
    /**
     * Generate analysis report
     */
    generateReport(analysis) {
        let report = `\n=== STATE ANALYSIS REPORT ===\n`;
        report += `Table: ${analysis.tableName} (${analysis.tableId})\n`;
        report += `Type: ${analysis.isSimulation ? 'Simulation' : 'Real Game'}\n`;
        report += `Snapshots: ${analysis.snapshotCount}\n`;
        report += `Total Issues: ${analysis.issueCount}\n`;
        report += `High Severity: ${analysis.highSeverityIssues}\n\n`;
        
        if (analysis.issues.length === 0) {
            report += `✅ No issues found!\n`;
            return report;
        }
        
        // Group by type
        const byType = {};
        for (const issue of analysis.issues) {
            if (!byType[issue.type]) {
                byType[issue.type] = [];
            }
            byType[issue.type].push(issue);
        }
        
        report += `ISSUES BY TYPE:\n`;
        report += `===============\n\n`;
        
        for (const [type, issues] of Object.entries(byType)) {
            report += `${type} (${issues.length} occurrences):\n`;
            for (const issue of issues.slice(0, 5)) { // Show first 5
                report += `  [${issue.severity.toUpperCase()}] Snapshot ${issue.snapshotIndex}: `;
                if (issue.from && issue.to) {
                    report += `${issue.from} → ${issue.to}`;
                } else if (issue.pot !== undefined) {
                    report += `Pot: ${issue.pot}`;
                } else if (issue.playerName) {
                    report += `${issue.playerName}: ${JSON.stringify(issue).replace(/[{}"]/g, '')}`;
                }
                report += `\n`;
            }
            if (issues.length > 5) {
                report += `  ... and ${issues.length - 5} more\n`;
            }
            report += `\n`;
        }
        
        return report;
    }
}

module.exports = StateAnalyzer;

