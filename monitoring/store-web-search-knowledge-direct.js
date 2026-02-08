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
        
        // CRITICAL: Disable auto-save BEFORE saving to prevent overwriting
        if (stateStore.autoSaveInterval) {
            clearInterval(stateStore.autoSaveInterval);
            stateStore.autoSaveInterval = null;
        }
        
        // Force save immediately with arrays - use sync write to ensure it completes
        stateStore.save();
        
        // Wait for file write to complete and verify immediately
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Read file directly to verify (don't create new StateStore - it might load old state)
        const fs = require('fs');
        const stateFile = path.join(projectRoot, 'logs', 'ai-state-store.json');
        
        if (!fs.existsSync(stateFile)) {
            console.error('❌ ERROR: State file not found after save!');
            process.exit(1);
        }
        
        // Read and verify file contents
        let fileState;
        try {
            fileState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        } catch (error) {
            console.error('❌ ERROR: Failed to read state file:', error.message);
            process.exit(1);
        }
        
        const fileKnowledge = fileState.state?.learning?.knowledge || [];
        const fileImprovements = fileState.state?.learning?.improvements || [];
        const knowledgeIsArray = Array.isArray(fileKnowledge);
        const improvementsIsArray = Array.isArray(fileImprovements);
        const knowledgeLength = knowledgeIsArray ? fileKnowledge.length : 0;
        const improvementsLength = improvementsIsArray ? fileImprovements.length : 0;
        
        // Verify arrays are in memory
        const memKnowledge = stateStore.getState('learning.knowledge') || [];
        const memImprovements = stateStore.getState('learning.improvements') || [];
        
        console.log('✅ Web search findings stored permanently in learning system');
        console.log(`   - Memory: knowledge (${memKnowledge.length} entries), improvements (${memImprovements.length} entries)`);
        console.log(`   - File: knowledge (${knowledgeLength} entries), improvements (${improvementsLength} entries)`);
        console.log('   - Will persist across sessions');
        
        // Final verification - both memory and file must have data
        if ((memKnowledge.length === 0 && memImprovements.length === 0) || (knowledgeLength === 0 && improvementsLength === 0)) {
            console.error('❌ ERROR: Knowledge was not persisted!');
            console.error(`   Memory: knowledge=${memKnowledge.length}, improvements=${memImprovements.length}`);
            console.error(`   File: knowledge=${knowledgeLength} (isArray: ${knowledgeIsArray}), improvements=${improvementsLength} (isArray: ${improvementsIsArray})`);
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
