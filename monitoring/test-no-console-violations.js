/**
 * Test: No Console Violations
 * 
 * Verifies that no console.* calls exist in the codebase (except allowed files).
 * This test ensures the logging rule is enforced.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const violations = [];

// Files that are allowed to use console.log (CLI tools)
const allowedFiles = [
    'cerberus-integration.js',
    'check-console-usage.js',
    'test-simple.js',
    'test-cerberus-a-z.js',
    'test-no-console-violations.js'
];

// Patterns to find console usage
const consolePatterns = [
    { pattern: /console\.log\s*\(/g, method: 'log' },
    { pattern: /console\.error\s*\(/g, method: 'error' },
    { pattern: /console\.warn\s*\(/g, method: 'warn' },
    { pattern: /console\.info\s*\(/g, method: 'info' },
    { pattern: /console\.debug\s*\(/g, method: 'debug' }
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
            consolePatterns.forEach(({ pattern, method }) => {
                if (pattern.test(line)) {
                    // Reset regex
                    pattern.lastIndex = 0;
                    
                    // Check if it's CLI JSON output (allowed)
                    const isCLIJSON = line.includes('JSON.stringify') && 
                                     (line.includes('cerberus-integration') || 
                                      line.includes('console.log(JSON.stringify'));
                    
                    if (!isCLIJSON) {
                        violations.push({
                            file: relativePath,
                            line: index + 1,
                            content: line.trim(),
                            method
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
                if (entry.name !== 'node_modules' && entry.name !== '.git' && 
                    entry.name !== 'logs' && entry.name !== '.husky') {
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

// Check monitoring and src directories
['monitoring', 'src'].forEach(checkPath => {
    const fullPath = path.join(projectRoot, checkPath);
    if (fs.existsSync(fullPath)) {
        checkDirectory(fullPath);
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
