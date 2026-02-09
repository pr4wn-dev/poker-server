/**
 * Cleanup Existing Patterns - Generalize Bloated Patterns
 * 
 * This script cleans up existing patterns in the state store by:
 * 1. Generalizing specific patterns (exact values -> categories)
 * 2. Removing excessive context (exact line numbers, full paths)
 * 3. Merging duplicate patterns
 * 4. Reducing file size
 */

const path = require('path');
const AIMonitorCore = require('./core/AIMonitorCore');
const PatternCleanup = require('./core/PatternCleanup');

const projectRoot = path.resolve(__dirname, '..');
const aiCore = new AIMonitorCore(projectRoot);

async function cleanupPatterns() {
    try {
        console.log('=== CLEANING UP PATTERNS ===');
        console.log('');
        
        // Get current patterns
        const stateStore = aiCore.stateStore;
        const currentPatterns = stateStore.getState('learning.patterns') || [];
        
        console.log('Current patterns:', currentPatterns.length);
        
        // Calculate current size
        const currentSize = JSON.stringify(currentPatterns).length;
        console.log('Current size:', (currentSize / 1024).toFixed(2), 'KB');
        console.log('');
        
        // Clean up patterns
        console.log('Cleaning up patterns...');
        const cleanedPatterns = PatternCleanup.cleanupPatterns(currentPatterns);
        
        console.log('Cleaned patterns:', cleanedPatterns.length);
        
        // Calculate new size
        const newSize = JSON.stringify(cleanedPatterns).length;
        console.log('New size:', (newSize / 1024).toFixed(2), 'KB');
        console.log('');
        
        // Calculate reduction
        const reduction = ((currentSize - newSize) / currentSize * 100).toFixed(1);
        console.log('Size reduction:', reduction + '%');
        console.log('');
        
        // Save cleaned patterns
        console.log('Saving cleaned patterns...');
        stateStore.updateState('learning.patterns', cleanedPatterns);
        stateStore.save();
        
        console.log('✅ Patterns cleaned and saved!');
        console.log('');
        
        // Show some examples
        if (cleanedPatterns.length > 0) {
            console.log('Sample cleaned patterns:');
            cleanedPatterns.slice(0, 3).forEach(([key, data], i) => {
                console.log(`  ${i + 1}. ${key}`);
                console.log(`     Frequency: ${data.frequency}, Success Rate: ${(data.successRate * 100).toFixed(1)}%`);
                console.log(`     Solutions: ${(data.solutions || []).length}, Contexts: ${(data.contexts || []).length}`);
            });
        }
        
    } catch (error) {
        console.error('Error cleaning up patterns:', error);
        process.exit(1);
    } finally {
        aiCore.destroy();
    }
}

cleanupPatterns();
