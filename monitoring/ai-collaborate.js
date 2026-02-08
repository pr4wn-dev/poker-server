/**
 * AI Collaboration Helper - We Are One
 * 
 * This script provides easy access to the symbiotic collaboration interface.
 * Use this to query the learning system, get proactive suggestions, and collaborate.
 * 
 * Usage:
 *   node monitoring/ai-collaborate.js query "What patterns match this problem?"
 *   node monitoring/ai-collaborate.js before-action '{"type":"fix_attempt","method":"make_async"}'
 *   node monitoring/ai-collaborate.js after-action '{"type":"fix_attempt","method":"make_async"}' '{"success":true}'
 *   node monitoring/ai-collaborate.js help '{"component":"ErrorRecovery","issue":"hang"}'
 */

const path = require('path');
const AIMonitorCore = require('./core/AIMonitorCore');

const projectRoot = path.join(__dirname, '..');
const core = new AIMonitorCore(projectRoot);

// Wait for initialization
setTimeout(() => {
    const command = process.argv[2];
    const arg1 = process.argv[3];
    const arg2 = process.argv[4];
    
    try {
        switch (command) {
            case 'query':
                if (!arg1) {
                    console.error('Usage: node ai-collaborate.js query "<question>"');
                    process.exit(1);
                }
                const queryResult = core.queryLearning(arg1);
                console.log(JSON.stringify(queryResult, null, 2));
                break;
                
            case 'before-action':
                if (!arg1) {
                    console.error('Usage: node ai-collaborate.js before-action \'{"type":"fix_attempt",...}\'');
                    process.exit(1);
                }
                const action = JSON.parse(arg1);
                const suggestions = core.beforeAIAction(action);
                console.log(JSON.stringify(suggestions, null, 2));
                break;
                
            case 'after-action':
                if (!arg1 || !arg2) {
                    console.error('Usage: node ai-collaborate.js after-action \'{"type":"fix_attempt",...}\' \'{"success":true}\'');
                    process.exit(1);
                }
                const action2 = JSON.parse(arg1);
                const result = JSON.parse(arg2);
                core.afterAIAction(action2, result);
                console.log(JSON.stringify({ success: true, message: 'Action tracked and learned from' }, null, 2));
                break;
                
            case 'help':
                if (!arg1) {
                    console.error('Usage: node ai-collaborate.js help \'{"component":"ErrorRecovery","issue":"hang"}\'');
                    process.exit(1);
                }
                const context = JSON.parse(arg1);
                const assistance = core.aiNeedsHelp(context);
                console.log(JSON.stringify(assistance, null, 2));
                break;
                
            case 'recommendations':
                const recommendations = core.getCollaborationInterface()?.getProactiveRecommendations() || [];
                console.log(JSON.stringify(recommendations, null, 2));
                break;
                
            default:
                console.log(`
AI Collaboration Interface - We Are One

Commands:
  query "<question>"              - Query the learning system
  before-action '<action-json>'    - Get proactive suggestions before taking action
  after-action '<action-json> <result-json>' - Learn from action result
  help '<context-json>'            - Get help when stuck
  recommendations                  - Get proactive recommendations

Examples:
  node ai-collaborate.js query "What patterns match circular dependency?"
  node ai-collaborate.js before-action '{"type":"fix_attempt","method":"make_async","issueType":"hang"}'
  node ai-collaborate.js after-action '{"type":"fix_attempt","method":"make_async"}' '{"success":true}'
  node ai-collaborate.js help '{"component":"ErrorRecovery","issue":"hang"}'
                `);
                break;
        }
    } catch (error) {
        console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
        process.exit(1);
    } finally {
        core.destroy();
        process.exit(0);
    }
}, 1000);
