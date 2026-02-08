#!/usr/bin/env node
/**
 * Check Console Usage - Pre-commit Hook
 * 
 * Scans codebase for console.* usage and fails if violations found.
 * Only allows console.log for CLI JSON output in cerberus-integration.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const violations = [];

// Files/directories to check
const checkPaths = [
    'src',
    'monitoring',
    'scripts'
];

// Files that are allowed to use console.log (CLI tools)
const allowedFiles = [
    'cerberus-integration.js',
    'test-simple.js', // Test output is OK
    'test-cerberus-a-z.js' // Test output is OK
];

// Patterns to find console usage
const consolePatterns = [
    /console\.log\s*\(/g,
    /console\.error\s*\(/g,
    /console\.warn\s*\(/g,
    /console\.info\s*\(/g,
    /console\.debug\s*\(/g
];

/**
 * Check a file for console usage
 */
function checkFile(filePath) {
    const relativePath = path.relative(projectRoot, filePath);
    const fileName = path.basename(filePath);
    
    // Skip allowed files
    if (allowedFiles.some(allowed => fileName.includes(allowed))) {
        return;
    }
    
    // Skip node_modules
    if (filePath.includes('node_modules')) {
        return;
    }
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            consolePatterns.forEach((pattern, patternIndex) => {
                const matches = line.match(pattern);
                if (matches) {
                    // Check if it's CLI JSON output (allowed)
                    const isCLIJSON = line.includes('JSON.stringify') && 
                                     (line.includes('cerberus-integration') || 
                                      line.includes('console.log(JSON.stringify'));
                    
                    if (!isCLIJSON) {
                        violations.push({
                            file: relativePath,
                            line: index + 1,
                            content: line.trim(),
                            method: ['log', 'error', 'warn', 'info', 'debug'][patternIndex]
                        });
                    }
                }
            });
        });
    } catch (error) {
        // Skip files that can't be read
    }
}

/**
 * Recursively check directory
 */
function checkDirectory(dirPath) {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                // Skip node_modules and .git
                if (entry.name !== 'node_modules' && entry.name !== '.git') {
                    checkDirectory(fullPath);
                }
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                checkFile(fullPath);
            }
        }
    } catch (error) {
        // Skip directories that can't be read
    }
}

// Check all paths
checkPaths.forEach(checkPath => {
    const fullPath = path.join(projectRoot, checkPath);
    if (fs.existsSync(fullPath)) {
        if (fs.statSync(fullPath).isDirectory()) {
            checkDirectory(fullPath);
        } else {
            checkFile(fullPath);
        }
    }
});

// Report results
if (violations.length > 0) {
    console.error('\n❌ CONSOLE USAGE VIOLATIONS DETECTED:\n');
    violations.forEach(v => {
        console.error(`  ${v.file}:${v.line}`);
        console.error(`    console.${v.method}() found`);
        console.error(`    ${v.content.substring(0, 80)}...\n`);
    });
    console.error(`\nTotal violations: ${violations.length}`);
    console.error('\nAll output must go through gameLogger, not console.*');
    console.error('Use gameLogger.info/error/warn instead.\n');
    process.exit(1);
} else {
    console.log('✅ No console usage violations found');
    process.exit(0);
}
