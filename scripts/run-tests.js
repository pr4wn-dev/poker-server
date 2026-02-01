#!/usr/bin/env node
/**
 * Run all tests and generate report
 * 
 * Usage: node scripts/run-tests.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Running tests...\n');

try {
    // Run Jest tests
    execSync('npm test -- --coverage', { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
    });
    
    console.log('\n✅ All tests passed!');
    process.exit(0);
} catch (error) {
    console.error('\n❌ Tests failed!');
    process.exit(1);
}

