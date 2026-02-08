/**
 * Teach Learning System About Command Monitoring Failure
 * 
 * This records the failure where AI didn't notice commands were stuck
 * and user had to cancel them. This is a fundamental monitoring failure.
 */

const path = require('path');
const StateStore = require('./core/StateStore');

async function teachLearningSystem() {
    const projectRoot = path.join(__dirname, '..');
    const stateStore = new StateStore(projectRoot);
    
    try {
        const learningData = stateStore.getState('ai.learning') || {};
        
        // Record the failure pattern
        if (!learningData.aiFailures) {
            learningData.aiFailures = [];
        }
        
        learningData.aiFailures.push({
            type: 'COMMAND_MONITORING_FAILURE',
            problem: 'AI did not notice commands were stuck and user had to cancel them',
            whatHappened: [
                'Commands were executed but hung/stuck',
                'AI did not detect commands were not completing',
                'User had to manually cancel commands',
                'AI continued as if commands completed successfully'
            ],
            whatShouldHaveHappened: [
                'Monitor command execution with timeouts',
                'Detect when commands take too long (stuck threshold)',
                'Detect when user cancels commands (SIGINT)',
                'Report stuck/cancelled commands to learning system',
                'Never assume commands complete successfully without verification'
            ],
            solution: [
                'Created CommandExecutionMonitor component',
                'Tracks all command execution with timeouts',
                'Detects stuck commands (exceeding threshold)',
                'Detects user cancellations (SIGINT)',
                'Reports to learning system for pattern recognition',
                'Always verify command completion before proceeding'
            ],
            keyInsights: [
                'Command execution monitoring is fundamental - cannot skip',
                'Must detect timeouts, cancellations, and stuck commands',
                'Never assume commands complete without verification',
                'User cancellations indicate commands were stuck - must detect this',
                'Learning system must learn from command execution patterns'
            ],
            timestamp: Date.now(),
            severity: 'critical'
        });
        
        // Keep only last 100 failures
        if (learningData.aiFailures.length > 100) {
            learningData.aiFailures = learningData.aiFailures.slice(-100);
        }
        
        // Store command monitoring pattern
        if (!learningData.commandMonitoringPatterns) {
            learningData.commandMonitoringPatterns = {};
        }
        
        learningData.commandMonitoringPatterns['COMMAND_STUCK_NOT_DETECTED'] = {
            count: 1,
            contexts: [{
                problem: 'Commands stuck but AI did not notice',
                solution: 'Use CommandExecutionMonitor to track all commands with timeouts and cancellation detection',
                timestamp: Date.now()
            }],
            solutions: [{
                solution: 'Always monitor command execution. Detect timeouts, cancellations, and stuck commands. Report to learning system.',
                timestamp: Date.now()
            }],
            firstSeen: Date.now(),
            lastSeen: Date.now()
        };
        
        learningData.commandMonitoringPatterns['USER_CANCELLATION_NOT_DETECTED'] = {
            count: 1,
            contexts: [{
                problem: 'User cancelled commands but AI did not detect',
                solution: 'Detect SIGINT signals and report cancellations. User cancellation indicates command was stuck.',
                timestamp: Date.now()
            }],
            solutions: [{
                solution: 'Detect user cancellations (SIGINT). Report to learning system. User cancellation = command was stuck.',
                timestamp: Date.now()
            }],
            firstSeen: Date.now(),
            lastSeen: Date.now()
        };
        
        // Store fundamental monitoring rules
        if (!learningData.fundamentalRules) {
            learningData.fundamentalRules = [];
        }
        
        learningData.fundamentalRules.push({
            rule: 'COMMAND_EXECUTION_MONITORING',
            description: 'Always monitor command execution. Detect timeouts, cancellations, and stuck commands.',
            priority: 'CRITICAL',
            timestamp: Date.now()
        });
        
        learningData.fundamentalRules.push({
            rule: 'DETECT_USER_CANCELLATIONS',
            description: 'User cancellation (SIGINT) indicates command was stuck. Must detect and report.',
            priority: 'CRITICAL',
            timestamp: Date.now()
        });
        
        learningData.fundamentalRules.push({
            rule: 'VERIFY_COMMAND_COMPLETION',
            description: 'Never assume commands complete successfully. Always verify completion before proceeding.',
            priority: 'CRITICAL',
            timestamp: Date.now()
        });
        
        // Keep only last 50 rules
        if (learningData.fundamentalRules.length > 50) {
            learningData.fundamentalRules = learningData.fundamentalRules.slice(-50);
        }
        
        // Update state store
        stateStore.updateState('ai.learning', learningData);
        stateStore.save();
        
        console.log('✅ Successfully recorded command monitoring failure in learning system!');
        console.log('\n   The system now knows:');
        console.log('   - Command execution monitoring is FUNDAMENTAL');
        console.log('   - Must detect timeouts, cancellations, and stuck commands');
        console.log('   - User cancellation = command was stuck (must detect)');
        console.log('   - Never assume commands complete without verification');
        console.log('   - Always report stuck/cancelled commands to learning system');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error teaching learning system:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run
teachLearningSystem();
