/**
 * Store Web Search Findings in Learning System
 * 
 * This demonstrates how to permanently store external knowledge (web search results)
 * in the learning system so it persists across sessions.
 */

const path = require('path');
const AIMonitorCore = require('./core/AIMonitorCore');

async function storeWebSearchKnowledge() {
    try {
        const projectRoot = path.join(__dirname, '..');
        console.log('Initializing AIMonitorCore...');
        const core = new AIMonitorCore(projectRoot);
        
        // Wait for initialization
        console.log('Waiting for initialization...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('AIMonitorCore initialized');
    
    // Store web search findings as permanent knowledge
    const action = {
        type: 'web_search_learning',
        method: 'web_search_integration',
        issueType: 'POWERSHELL_SYNTAX_ERROR',
        component: 'cerberus.ps1',
        file: 'monitoring/cerberus.ps1',
        details: {
            problem: 'PowerShell try-catch syntax error - Tokenize reports OK but -File fails',
            webSearchFindings: {
                sources: [
                    'Microsoft Learn PowerShell Try-Catch Documentation',
                    'SS64 PowerShell Reference'
                ],
                keyInsights: [
                    'Try statement must have catch or finally immediately after',
                    'Tokenize vs -File can have different results - structural issues may not be caught by tokenization',
                    'Unclosed blocks between try and catch cause parser confusion',
                    'Official documentation is authoritative source for syntax rules'
                ],
                searchTerms: [
                    'PowerShell try catch missing closing brace',
                    'PowerShell Tokenize OK but File fails',
                    'PowerShell try catch syntax error'
                ],
                solutions: [
                    'Check for unclosed blocks between try and catch',
                    'Verify catch is immediately after try block closes',
                    'Use official Microsoft Learn documentation for syntax rules',
                    'When Tokenize passes but -File fails, check structural closure issues'
                ]
            },
            approach: [
                '1. Searched online for PowerShell try-catch syntax rules',
                '2. Found official Microsoft Learn documentation',
                '3. Learned that Tokenize vs -File can differ',
                '4. Identified pattern: structural closure issues cause parser confusion'
            ],
            solution: [
                'Store web search findings permanently in learning system',
                'Use official documentation as authoritative source',
                'Check for unclosed blocks when Tokenize OK but -File fails',
                'Search online first before exhaustive local debugging'
            ],
            keyInsights: [
                'Web search should be first step when stuck',
                'Learning system must store external knowledge permanently',
                'Official documentation is more reliable than local iteration',
                'Search terms should be refined over time for better results'
            ],
            codeChanges: []
        }
    };
    
    const result = {
        success: true,
        permanentKnowledge: true,
        source: 'web_search',
        timestamp: Date.now(),
        storedIn: 'learning.knowledge and learning.improvements'
    };
    
    await core.afterAIAction(action, result);
    
    // Also store directly in state for permanent access
    core.stateStore.updateState('learning.knowledge', (knowledge = []) => {
        knowledge.push({
            type: 'web_search_finding',
            topic: 'PowerShell Try-Catch Syntax',
            sources: action.details.webSearchFindings.sources,
            insights: action.details.webSearchFindings.keyInsights,
            solutions: action.details.webSearchFindings.solutions,
            searchTerms: action.details.webSearchFindings.searchTerms,
            timestamp: Date.now(),
            permanent: true
        });
        return knowledge;
    });
    
    core.stateStore.updateState('learning.improvements', (improvements = []) => {
        improvements.push({
            type: 'workflow_improvement',
            improvement: 'Web Search Integration',
            description: 'Learning system now searches online first and stores permanent knowledge',
            impact: 'Faster problem resolution using external authoritative sources',
            timestamp: Date.now(),
            permanent: true
        });
        return improvements;
    });
    
    // Wait for state to save
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify storage
    const storedKnowledge = core.stateStore.getState('learning.knowledge') || [];
    const storedImprovements = core.stateStore.getState('learning.improvements') || [];
    
    console.log('✅ Web search findings stored permanently in learning system');
    console.log(`   - Stored in learning.knowledge (${storedKnowledge.length} entries)`);
    console.log(`   - Stored in learning.improvements (${storedImprovements.length} entries)`);
    console.log('   - Will persist across sessions');
    
    if (storedKnowledge.length === 0 && storedImprovements.length === 0) {
        console.error('❌ ERROR: Knowledge was not stored!');
        console.error('   StateStore state:', JSON.stringify(core.stateStore.getState('learning'), null, 2));
        process.exit(1);
    }
    
    process.exit(0);
    } catch (error) {
        console.error('❌ Error storing web search knowledge:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

storeWebSearchKnowledge().catch(err => {
    console.error('❌ Unhandled error:', err);
    process.exit(1);
});
