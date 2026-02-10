#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const stateFile = path.join(__dirname, '..', 'logs', 'ai-state-store.json');
if (!fs.existsSync(stateFile)) {
    console.log('State file not found');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const state = data.state || {};

function getSize(obj) {
    return JSON.stringify(obj).length;
}

function findDeepNesting(obj, path = '', depth = 0, results = []) {
    if (typeof obj !== 'object' || obj === null) return results;
    if (Array.isArray(obj)) {
        if (obj.length > 0 && typeof obj[0] === 'object') {
            findDeepNesting(obj[0], path + '[0]', depth + 1, results);
        }
        return results;
    }
    
    if (depth >= 4) {
        results.push({ path, depth, size: getSize(obj) });
    }
    
    for (const [key, value] of Object.entries(obj)) {
        const newPath = path ? `${path}.${key}` : key;
        findDeepNesting(value, newPath, depth + 1, results);
    }
    
    return results;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  STATE FILE ANALYSIS');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('File size:', (fs.statSync(stateFile).size / 1024 / 1024).toFixed(2), 'MB');
console.log('State size:', (getSize(state) / 1024 / 1024).toFixed(2), 'MB');
console.log('EventLog size:', (getSize(data.eventLog || []) / 1024 / 1024).toFixed(2), 'MB');
console.log('EventLog entries:', (data.eventLog || []).length);
console.log('');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  SIZE BREAKDOWN BY SECTION');
console.log('═══════════════════════════════════════════════════════════════\n');

const sections = ['game', 'system', 'monitoring', 'issues', 'fixes', 'learning', 'ai', 'metadata', 'rules', 'process'];
for (const section of sections) {
    const size = getSize(state[section] || {});
    if (size > 0) {
        console.log(`${section.padEnd(15)}: ${(size / 1024).toFixed(2).padStart(8)} KB`);
    }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  DEEPLY NESTED OBJECTS (depth >= 4)');
console.log('═══════════════════════════════════════════════════════════════\n');

const deepNesting = findDeepNesting(state);
deepNesting.sort((a, b) => b.size - a.size);

if (deepNesting.length === 0) {
    console.log('No deeply nested objects found (depth < 4)');
} else {
    console.log(`Found ${deepNesting.length} deeply nested paths:\n`);
    deepNesting.slice(0, 20).forEach((item, i) => {
        console.log(`${(i + 1).toString().padStart(3)}. ${item.path.padEnd(50)} (depth: ${item.depth}, size: ${(item.size / 1024).toFixed(2)} KB)`);
    });
    if (deepNesting.length > 20) {
        console.log(`\n... and ${deepNesting.length - 20} more`);
    }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  LEARNING SYSTEM BREAKDOWN');
console.log('═══════════════════════════════════════════════════════════════\n');

const learning = state.learning || {};
const learningKeys = Object.keys(learning);
console.log(`Learning has ${learningKeys.length} keys:`);
learningKeys.forEach(key => {
    const size = getSize(learning[key] || {});
    if (size > 0) {
        console.log(`  ${key.padEnd(30)}: ${(size / 1024).toFixed(2).padStart(8)} KB`);
    }
});
