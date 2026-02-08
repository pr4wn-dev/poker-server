/**
 * Store Web Search Findings in Learning System (Direct StateStore Access)
 * 
 * This stores external knowledge (web search results) directly in the state store
 * so it persists across sessions.
 */

const path = require('path');
const StateStore = require('./core/StateStore');

async function storeWebSearchKnowledge() {
    try {
        const projectRoot = path.join(__dirname, '..');
        console.log('Initializing StateStore...');
        const stateStore = new StateStore(projectRoot);
        
        // Wait a moment for state to load
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('StateStore initialized');
        
        // Store web search findings as permanent knowledge
        const webSearchKnowledge = {
            type: 'web_search_finding',
            topic: 'PowerShell Try-Catch Syntax',
            sources: [
                'Microsoft Learn PowerShell Try-Catch Documentation',
                'SS64 PowerShell Reference'
            ],
            insights: [
                'Try statement must have catch or finally immediately after',
                'Tokenize vs -File can have different results - structural issues may not be caught by tokenization',
                'Unclosed blocks between try and catch cause parser confusion',
                'Official documentation is authoritative source for syntax rules'
            ],
            solutions: [
                'Check for unclosed blocks between try and catch',
                'Verify catch is immediately after try block closes',
                'Use official Microsoft Learn documentation for syntax rules',
                'When Tokenize passes but -File fails, check structural closure issues'
            ],
            searchTerms: [
                'PowerShell try catch missing closing brace',
                'PowerShell Tokenize OK but File fails',
                'PowerShell try catch syntax error'
            ],
            timestamp: Date.now(),
            permanent: true
        };
        
        const workflowImprovement = {
            type: 'workflow_improvement',
            improvement: 'Web Search Integration',
            description: 'Learning system now searches online first and stores permanent knowledge',
            impact: 'Faster problem resolution using external authoritative sources',
            timestamp: Date.now(),
            permanent: true
        };
        
        // Ensure learning.knowledge exists
        let currentKnowledge = stateStore.getState('learning.knowledge');
        if (!Array.isArray(currentKnowledge)) {
            currentKnowledge = [];
        }
        
        // Check if this knowledge already exists
        const knowledgeExists = currentKnowledge.some(k => 
            k.type === 'web_search_finding' && 
            k.topic === webSearchKnowledge.topic
        );
        if (!knowledgeExists) {
            currentKnowledge.push(webSearchKnowledge);
        }
        
        // Store in learning.knowledge
        stateStore.updateState('learning.knowledge', currentKnowledge);
        
        // Ensure learning.improvements exists
        let currentImprovements = stateStore.getState('learning.improvements');
        if (!Array.isArray(currentImprovements)) {
            currentImprovements = [];
        }
        
        // Check if this improvement already exists
        const improvementExists = currentImprovements.some(i => 
            i.type === 'workflow_improvement' && 
            i.improvement === workflowImprovement.improvement
        );
        if (!improvementExists) {
            currentImprovements.push(workflowImprovement);
        }
        
        // Store in learning.improvements
        stateStore.updateState('learning.improvements', currentImprovements);
        
        // Disable auto-save temporarily to prevent overwriting
        if (stateStore.autoSaveInterval) {
            clearInterval(stateStore.autoSaveInterval);
        }
        
        // Force save immediately
        stateStore.save();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify storage in memory
        const storedKnowledge = stateStore.getState('learning.knowledge') || [];
        const storedImprovements = stateStore.getState('learning.improvements') || [];
        
        console.log('✅ Web search findings stored permanently in learning system');
        console.log(`   - Stored in learning.knowledge (${storedKnowledge.length} entries)`);
        console.log(`   - Stored in learning.improvements (${storedImprovements.length} entries)`);
        
        if (storedKnowledge.length === 0 && storedImprovements.length === 0) {
            console.error('❌ ERROR: Knowledge was not stored!');
            const learningState = stateStore.getState('learning');
            console.error('   Learning state:', JSON.stringify(learningState, null, 2));
            process.exit(1);
        }
        
        // Verify saved to disk by loading a new instance
        await new Promise(resolve => setTimeout(resolve, 1000));
        const verifyStore = new StateStore(projectRoot);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const diskKnowledge = verifyStore.getState('learning.knowledge') || [];
        const diskImprovements = verifyStore.getState('learning.improvements') || [];
        
        console.log(`   - Verified on disk: knowledge (${diskKnowledge.length} entries), improvements (${diskImprovements.length} entries)`);
        console.log('   - Will persist across sessions');
        
        if (diskKnowledge.length === 0 && diskImprovements.length === 0) {
            console.error('❌ ERROR: Knowledge was not persisted to disk!');
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
