/**
 * Test Learning Array Persistence
 * 
 * This script tests if learning.knowledge and learning.improvements arrays
 * persist correctly across save/load cycles.
 */

const path = require('path');
const StateStore = require('./core/StateStore');

async function testLearningPersistence() {
    try {
        const projectRoot = path.join(__dirname, '..');
        console.log('Testing learning array persistence...\n');
        
        const stateStore = new StateStore(projectRoot);
        
        // Wait for state to load
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Get current state
        let knowledge = stateStore.getState('learning.knowledge') || [];
        let improvements = stateStore.getState('learning.improvements') || [];
        
        console.log('BEFORE TEST:');
        console.log(`  knowledge type: ${Array.isArray(knowledge) ? 'array' : typeof knowledge}, length: ${Array.isArray(knowledge) ? knowledge.length : 'N/A'}`);
        console.log(`  improvements type: ${Array.isArray(improvements) ? 'array' : typeof improvements}, length: ${Array.isArray(improvements) ? improvements.length : 'N/A'}`);
        
        // Ensure they're arrays
        if (!Array.isArray(knowledge)) {
            knowledge = [];
        }
        if (!Array.isArray(improvements)) {
            improvements = [];
        }
        
        // Add test items
        const testKnowledge = {
            type: 'test',
            message: 'Test knowledge item',
            timestamp: Date.now()
        };
        
        const testImprovement = {
            type: 'test',
            message: 'Test improvement item',
            timestamp: Date.now()
        };
        
        knowledge.push(testKnowledge);
        improvements.push(testImprovement);
        
        console.log('\nADDING TEST ITEMS:');
        console.log(`  knowledge length after add: ${knowledge.length}`);
        console.log(`  improvements length after add: ${improvements.length}`);
        
        // Update state
        stateStore.updateState('learning.knowledge', knowledge);
        stateStore.updateState('learning.improvements', improvements);
        
        // Verify in memory
        const knowledgeInMemory = stateStore.getState('learning.knowledge');
        const improvementsInMemory = stateStore.getState('learning.improvements');
        
        console.log('\nIN MEMORY AFTER UPDATE:');
        console.log(`  knowledge type: ${Array.isArray(knowledgeInMemory) ? 'array' : typeof knowledgeInMemory}, length: ${Array.isArray(knowledgeInMemory) ? knowledgeInMemory.length : 'N/A'}`);
        console.log(`  improvements type: ${Array.isArray(improvementsInMemory) ? 'array' : typeof improvementsInMemory}, length: ${Array.isArray(improvementsInMemory) ? improvementsInMemory.length : 'N/A'}`);
        
        // Disable auto-save and force save
        if (stateStore.autoSaveInterval) {
            clearInterval(stateStore.autoSaveInterval);
            stateStore.autoSaveInterval = null;
        }
        
        console.log('\nSAVING STATE...');
        stateStore.save();
        await new Promise(resolve => setTimeout(resolve, 500)); // Give time for write
        
        // Create NEW StateStore instance to test loading
        console.log('\nCREATING NEW STATESTORE INSTANCE (simulating restart)...');
        const stateStore2 = new StateStore(projectRoot);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for load
        
        // Check loaded state
        const knowledgeLoaded = stateStore2.getState('learning.knowledge') || [];
        const improvementsLoaded = stateStore2.getState('learning.improvements') || [];
        
        console.log('\nAFTER LOAD (NEW INSTANCE):');
        console.log(`  knowledge type: ${Array.isArray(knowledgeLoaded) ? 'array' : typeof knowledgeLoaded}, length: ${Array.isArray(knowledgeLoaded) ? knowledgeLoaded.length : 'N/A'}`);
        console.log(`  improvements type: ${Array.isArray(improvementsLoaded) ? 'array' : typeof improvementsLoaded}, length: ${Array.isArray(improvementsLoaded) ? improvementsLoaded.length : 'N/A'}`);
        
        // Verify persistence
        const knowledgePersisted = Array.isArray(knowledgeLoaded) && knowledgeLoaded.length > 0;
        const improvementsPersisted = Array.isArray(improvementsLoaded) && improvementsLoaded.length > 0;
        
        console.log('\nRESULT:');
        if (knowledgePersisted && improvementsPersisted) {
            console.log('✅ SUCCESS: Arrays persisted correctly!');
            console.log(`  knowledge items: ${knowledgeLoaded.length}`);
            console.log(`  improvements items: ${improvementsLoaded.length}`);
        } else {
            console.log('❌ FAILURE: Arrays did not persist correctly!');
            if (!knowledgePersisted) {
                console.log('  knowledge array lost or empty');
            }
            if (!improvementsPersisted) {
                console.log('  improvements array lost or empty');
            }
        }
        
        // Cleanup - restore auto-save
        stateStore2.autoSaveInterval = setInterval(() => {
            stateStore2.save();
        }, 5000);
        
        process.exit(knowledgePersisted && improvementsPersisted ? 0 : 1);
    } catch (error) {
        console.error('❌ ERROR:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

testLearningPersistence().catch(err => {
    console.error('❌ Unhandled error:', err);
    process.exit(1);
});
