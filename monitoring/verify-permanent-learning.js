/**
 * Verify Permanent Learning System
 * 
 * Checks if web search findings and other knowledge are properly stored
 * and will persist across sessions.
 */

const fs = require('fs');
const path = require('path');

function verifyPermanentLearning() {
    const stateFile = path.join(__dirname, '..', 'logs', 'ai-state-store.json');
    
    if (!fs.existsSync(stateFile)) {
        console.log('❌ State file not found:', stateFile);
        return false;
    }
    
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const learning = state.state?.learning || {};
    
    console.log('=== PERMANENT LEARNING VERIFICATION ===\n');
    
    // Check knowledge array
    const knowledge = Array.isArray(learning.knowledge) ? learning.knowledge : [];
    console.log(`📚 Learning Knowledge Count: ${knowledge.length}`);
    
    // Check improvements array
    const improvements = Array.isArray(learning.improvements) ? learning.improvements : [];
    console.log(`📈 Learning Improvements Count: ${improvements.length}\n`);
    
    // Check for web search knowledge
    const webSearchKnowledge = knowledge.filter(k => 
        k.type === 'web_search_finding' || k.permanent === true
    );
    console.log(`🔍 Web Search Knowledge Entries: ${webSearchKnowledge.length}`);
    
    if (webSearchKnowledge.length > 0) {
        console.log('\n📋 Web Search Knowledge Details:');
        webSearchKnowledge.forEach((k, i) => {
            console.log(`\n  Entry ${i + 1}:`);
            console.log(`    Type: ${k.type || 'N/A'}`);
            console.log(`    Topic: ${k.topic || 'N/A'}`);
            console.log(`    Permanent: ${k.permanent !== false ? '✅ YES' : '❌ NO'}`);
            console.log(`    Sources: ${k.sources?.length || 0}`);
            console.log(`    Insights: ${k.insights?.length || 0}`);
            console.log(`    Solutions: ${k.solutions?.length || 0}`);
            if (k.timestamp) {
                const date = new Date(k.timestamp);
                console.log(`    Stored: ${date.toLocaleString()}`);
            }
        });
    } else {
        console.log('  ⚠️  No web search knowledge found');
    }
    
    // Check for workflow improvements
    const workflowImprovements = improvements.filter(i => 
        i.type === 'workflow_improvement' || i.permanent === true
    );
    console.log(`\n🔄 Workflow Improvement Entries: ${workflowImprovements.length}`);
    
    if (workflowImprovements.length > 0) {
        console.log('\n📋 Workflow Improvement Details:');
        workflowImprovements.forEach((i, idx) => {
            console.log(`\n  Entry ${idx + 1}:`);
            console.log(`    Type: ${i.type || 'N/A'}`);
            console.log(`    Improvement: ${i.improvement || 'N/A'}`);
            console.log(`    Permanent: ${i.permanent !== false ? '✅ YES' : '❌ NO'}`);
            console.log(`    Description: ${i.description || 'N/A'}`);
            if (i.timestamp) {
                const date = new Date(i.timestamp);
                console.log(`    Stored: ${date.toLocaleString()}`);
            }
        });
    } else {
        console.log('  ⚠️  No workflow improvements found');
    }
    
    // Check if WORKFLOW.md has web search integration
    const workflowFile = path.join(__dirname, 'WORKFLOW.md');
    if (fs.existsSync(workflowFile)) {
        const workflowContent = fs.readFileSync(workflowFile, 'utf8');
        const hasWebSearch = workflowContent.includes('Search Online First') || 
                            workflowContent.includes('web_search');
        console.log(`\n📄 WORKFLOW.md Web Search Integration: ${hasWebSearch ? '✅ YES' : '❌ NO'}`);
    }
    
    // Summary
    console.log('\n=== VERIFICATION SUMMARY ===');
    const hasKnowledge = knowledge.length > 0;
    const hasImprovements = improvements.length > 0;
    const hasWebSearch = webSearchKnowledge.length > 0;
    const hasWorkflow = workflowImprovements.length > 0;
    
    console.log(`Knowledge Array Exists: ${hasKnowledge ? '✅' : '❌'}`);
    console.log(`Improvements Array Exists: ${hasImprovements ? '✅' : '❌'}`);
    console.log(`Web Search Knowledge Stored: ${hasWebSearch ? '✅' : '❌'}`);
    console.log(`Workflow Improvements Stored: ${hasWorkflow ? '✅' : '❌'}`);
    
    const allGood = hasKnowledge && hasImprovements && hasWebSearch && hasWorkflow;
    console.log(`\nOverall Status: ${allGood ? '✅ PERMANENT LEARNING WORKING' : '⚠️  NEEDS ATTENTION'}`);
    
    return allGood;
}

verifyPermanentLearning();
