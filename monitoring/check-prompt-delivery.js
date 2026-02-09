#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const stateFile = path.join(__dirname, '..', 'logs', 'ai-state-store.json');

if (!fs.existsSync(stateFile)) {
    console.log('State file not found');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

const prompts = data.state?.ai?.prompts || [];
const deliveredPrompts = data.state?.ai?.deliveredPrompts || [];

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PROMPT DELIVERY CHECK');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`Total prompts: ${prompts.length}`);
console.log(`Delivered prompts: ${deliveredPrompts.length}`);
console.log(`Undelivered prompts: ${prompts.filter(p => !deliveredPrompts.includes(p.id)).length}\n`);

if (prompts.length > 0) {
    console.log('Recent prompts (last 5):');
    prompts.slice(-5).forEach((p, i) => {
        const delivered = deliveredPrompts.includes(p.id);
        console.log(`\n${i + 1}. ID: ${p.id}`);
        console.log(`   Type: ${p.type}`);
        console.log(`   Delivered: ${delivered ? 'YES' : 'NO'}`);
        console.log(`   Time: ${new Date(p.timestamp).toISOString()}`);
    });
} else {
    console.log('No prompts found');
}

// Check if StateStore emits events
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  STATE STORE EVENT EMISSION');
console.log('═══════════════════════════════════════════════════════════════\n');

// Check if updateState emits stateChanged
const StateStore = require('./core/StateStore');
const projectRoot = path.resolve(__dirname, '..');
const stateStore = new StateStore(projectRoot);

let eventEmitted = false;
stateStore.on('stateChanged', (event) => {
    if (event.path === 'ai.deliveredPrompts') {
        eventEmitted = true;
        console.log('✓ stateChanged event emitted for ai.deliveredPrompts');
    }
});

// Test if updateState triggers event
const testDelivered = stateStore.getState('ai.deliveredPrompts') || [];
stateStore.updateState('ai.deliveredPrompts', [...testDelivered, 'test-id']);

setTimeout(() => {
    if (eventEmitted) {
        console.log('✓ StateStore is emitting stateChanged events');
    } else {
        console.log('✗ StateStore is NOT emitting stateChanged events');
        console.log('  This means compliance verification won\'t trigger!');
    }
    stateStore.destroy();
    process.exit(0);
}, 100);
