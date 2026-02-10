#!/usr/bin/env node
/**
 * Pre-Flight Check System
 * 
 * Runs BEFORE BrokenPromise starts to ensure all systems are ready
 * Uses learning system to detect and fix issues automatically
 * Prevents errors from happening during startup
 */

const path = require('path');
const fs = require('fs');
const DatabaseManager = require('../core/DatabaseManager');
const gameLogger = require('../../src/utils/GameLogger');

const projectRoot = path.resolve(__dirname, '../..');

class PreFlightCheck {
    constructor() {
        this.issues = [];
        this.fixes = [];
        this.learningPatterns = null;
    }

    /**
     * Query learning system for known issues and fixes
     */
    async loadLearningPatterns() {
        try {
            const dbManager = new DatabaseManager(projectRoot);
            await dbManager.initialize();
            const pool = dbManager.getPool();
            
            // Get common startup issues and their fixes
            const [patterns] = await pool.execute(`
                SELECT * FROM learning_patterns 
                WHERE issue_type IN ('memory_heap_overflow', 'null_reference_state', 'verification_memory_overflow', 'startup_error')
                ORDER BY frequency DESC, success_rate DESC
                LIMIT 20
            `);
            
            // Get misdiagnosis patterns
            const [misdiagnosis] = await pool.execute(`
                SELECT * FROM learning_misdiagnosis_patterns 
                WHERE component IN ('startup', 'initialization', 'BrokenPromise', 'Node.js', 'PowerShell')
                ORDER BY frequency DESC
                LIMIT 10
            `);
            
            this.learningPatterns = {
                patterns: patterns,
                misdiagnosis: misdiagnosis
            };
            
            await dbManager.pool.end();
        } catch (error) {
            console.error('[PRE-FLIGHT] Failed to load learning patterns:', error.message);
            this.learningPatterns = { patterns: [], misdiagnosis: [] };
        }
    }

    /**
     * Check database connection
     */
    async checkDatabase() {
        try {
            const dbManager = new DatabaseManager(projectRoot);
            await dbManager.initialize();
            const pool = dbManager.getPool();
            await pool.execute('SELECT 1');
            await dbManager.pool.end();
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                fix: 'Ensure MySQL is running (WAMP/XAMPP) and database credentials are correct in .env'
            };
        }
    }

    /**
     * Check Node.js version
     */
    checkNodeVersion() {
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);
        if (majorVersion < 18) {
            return {
                success: false,
                error: `Node.js version ${nodeVersion} is too old (need 18+)`,
                fix: 'Update Node.js to version 18 or higher'
            };
        }
        return { success: true, version: nodeVersion };
    }

    /**
     * Check required files exist
     */
    checkRequiredFiles() {
        const requiredFiles = [
            'monitoring/BrokenPromise.ps1',
            'monitoring/BrokenPromiseIntegration.ps1',
            'monitoring/integration/BrokenPromise-integration.js',
            'monitoring/integration/BrokenPromise-integration-http.js',
            'monitoring/core/AIMonitorCore.js',
            'monitoring/core/DatabaseManager.js',
            'src/server.js',
            '.env'
        ];
        
        const missing = [];
        for (const file of requiredFiles) {
            const fullPath = path.join(projectRoot, file);
            if (!fs.existsSync(fullPath)) {
                missing.push(file);
            }
        }
        
        if (missing.length > 0) {
            return {
                success: false,
                error: `Missing required files: ${missing.join(', ')}`,
                fix: 'Ensure all files are present. Run git pull to sync repository.'
            };
        }
        return { success: true };
    }

    /**
     * Check Unity executable path
     */
    checkUnityPath() {
        try {
            const configPath = path.join(projectRoot, 'monitoring', 'BrokenPromise-config.json');
            if (!fs.existsSync(configPath)) {
                return {
                    success: false,
                    error: 'BrokenPromise-config.json not found',
                    fix: 'Create configuration file with Unity executable path'
                };
            }
            
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (!config.unity || !config.unity.executablePath) {
                return {
                    success: false,
                    error: 'Unity executable path not configured',
                    fix: 'Set unity.executablePath in BrokenPromise-config.json'
                };
            }
            
            if (!fs.existsSync(config.unity.executablePath)) {
                return {
                    success: false,
                    error: `Unity executable not found: ${config.unity.executablePath}`,
                    fix: 'Update unity.executablePath in BrokenPromise-config.json to correct path'
                };
            }
            
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: `Config error: ${error.message}`,
                fix: 'Fix BrokenPromise-config.json syntax errors'
            };
        }
    }

    /**
     * Check port availability
     */
    async checkPorts() {
        const net = require('net');
        const ports = [3000, 3001]; // Server port, integration server port
        
        const issues = [];
        for (const port of ports) {
            const available = await new Promise((resolve) => {
                const server = net.createServer();
                server.listen(port, () => {
                    server.once('close', () => resolve(true));
                    server.close();
                });
                server.on('error', () => resolve(false));
            });
            
            if (!available) {
                issues.push({
                    port: port,
                    error: `Port ${port} is in use`,
                    fix: port === 3000 
                        ? 'Kill processes on port 3000: Kill-Port3000Processes or restart computer'
                        : 'Kill integration server process or restart computer'
                });
            }
        }
        
        if (issues.length > 0) {
            return {
                success: false,
                issues: issues
            };
        }
        return { success: true };
    }

    /**
     * Check logs directory
     */
    checkLogsDirectory() {
        const logsDir = path.join(projectRoot, 'logs');
        if (!fs.existsSync(logsDir)) {
            try {
                fs.mkdirSync(logsDir, { recursive: true });
                return { success: true, created: true };
            } catch (error) {
                return {
                    success: false,
                    error: `Cannot create logs directory: ${error.message}`,
                    fix: 'Create logs directory manually or fix permissions'
                };
            }
        }
        return { success: true };
    }

    /**
     * Check npm dependencies
     */
    checkDependencies() {
        const packageJsonPath = path.join(projectRoot, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            return {
                success: false,
                error: 'package.json not found',
                fix: 'Run npm init or ensure package.json exists'
            };
        }
        
        const nodeModulesPath = path.join(projectRoot, 'node_modules');
        if (!fs.existsSync(nodeModulesPath)) {
            return {
                success: false,
                error: 'node_modules not found',
                fix: 'Run npm install to install dependencies'
            };
        }
        
        // Check critical dependencies
        const criticalDeps = ['express', 'socket.io', 'mysql2', 'dotenv'];
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        const missing = [];
        for (const dep of criticalDeps) {
            if (!allDeps[dep]) {
                missing.push(dep);
            }
        }
        
        if (missing.length > 0) {
            return {
                success: false,
                error: `Missing dependencies: ${missing.join(', ')}`,
                fix: 'Run npm install to install missing dependencies'
            };
        }
        
        return { success: true };
    }

    /**
     * Get fix suggestion from learning system
     */
    getFixSuggestion(issue) {
        if (!this.learningPatterns) return null;
        
        const errorLower = (issue.error || '').toLowerCase();
        const checkLower = (issue.check || '').toLowerCase();
        
        // Search patterns for matching issue
        for (const pattern of this.learningPatterns.patterns) {
            const details = JSON.parse(pattern.details || '{}');
            const contexts = (pattern.contexts || '').toLowerCase();
            const solutions = pattern.solutions || '';
            
            // Match by issue type, error message, or context
            if (errorLower.includes(pattern.issue_type.toLowerCase()) ||
                contexts.includes(errorLower) ||
                errorLower.includes(pattern.issue_type.toLowerCase().replace(/_/g, ' '))) {
                
                const misdiagnosis = this.learningPatterns.misdiagnosis.find(m => m.issue_type === pattern.issue_type);
                
                return {
                    pattern: pattern.issue_type,
                    solution: solutions || pattern.solution_method,
                    successRate: pattern.success_rate,
                    frequency: pattern.frequency,
                    misdiagnosis: misdiagnosis,
                    timeSaved: pattern.time_saved
                };
            }
        }
        
        // Also check misdiagnosis patterns directly
        for (const misdiagnosis of this.learningPatterns.misdiagnosis) {
            const symptom = (misdiagnosis.symptom || '').toLowerCase();
            if (errorLower.includes(symptom) || symptom.includes(errorLower)) {
                return {
                    pattern: misdiagnosis.issue_type,
                    solution: misdiagnosis.correct_approach,
                    successRate: null,
                    frequency: misdiagnosis.frequency,
                    misdiagnosis: misdiagnosis,
                    timeSaved: null,
                    avoid: misdiagnosis.common_misdiagnosis
                };
            }
        }
        
        return null;
    }

    /**
     * Attempt automatic fix based on learning system
     */
    async attemptAutoFix(issue) {
        const suggestion = this.getFixSuggestion(issue);
        if (!suggestion) return false;
        
        // Only attempt fixes for certain issues
        const autoFixable = [
            'logs directory',
            'missing dependencies',
            'port availability'
        ];
        
        const issueType = (issue.check || '').toLowerCase();
        if (!autoFixable.some(type => issueType.includes(type))) {
            return false;
        }
        
        try {
            // Fix: Create logs directory
            if (issueType.includes('logs directory')) {
                const logsDir = path.join(projectRoot, 'logs');
                if (!fs.existsSync(logsDir)) {
                    fs.mkdirSync(logsDir, { recursive: true });
                    return true;
                }
            }
            
            // Fix: Install missing dependencies
            if (issueType.includes('missing dependencies')) {
                // Note: npm install would need to be run manually
                // We can't auto-run it here, but we can suggest it
                return false;
            }
            
            // Fix: Port availability - suggest killing processes
            if (issueType.includes('port availability')) {
                // Note: Killing processes requires PowerShell
                // We can't auto-run it here, but we can suggest it
                return false;
            }
        } catch (error) {
            console.error(`      Auto-fix failed: ${error.message}`);
            return false;
        }
        
        return false;
    }

    /**
     * Run all pre-flight checks
     */
    async runAllChecks() {
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  PRE-FLIGHT CHECK - Ensuring All Systems Ready');
        console.log('═══════════════════════════════════════════════════════════════\n');
        
        // Load learning patterns first
        await this.loadLearningPatterns();
        
        const checks = [
            { name: 'Node.js Version', fn: () => this.checkNodeVersion() },
            { name: 'Required Files', fn: () => this.checkRequiredFiles() },
            { name: 'Logs Directory', fn: () => this.checkLogsDirectory() },
            { name: 'NPM Dependencies', fn: () => this.checkDependencies() },
            { name: 'Database Connection', fn: () => this.checkDatabase() },
            { name: 'Unity Path', fn: () => this.checkUnityPath() },
            { name: 'Port Availability', fn: () => this.checkPorts() }
        ];
        
        let allPassed = true;
        
        for (const check of checks) {
            process.stdout.write(`  [CHECK] ${check.name}... `);
            try {
                const result = await Promise.resolve(check.fn());
                if (result.success) {
                    console.log('[OK]');
                    if (result.created) {
                        console.log(`      Created ${check.name.toLowerCase()}`);
                    }
                } else {
                    console.log('[FAIL]');
                    console.log(`      Error: ${result.error || 'Unknown error'}`);
                    
                    // Get fix suggestion from learning system
                    const suggestion = this.getFixSuggestion({ ...result, check: check.name });
                    if (suggestion) {
                        console.log(`      [LEARNING SYSTEM] Known issue: ${suggestion.pattern}`);
                        if (suggestion.frequency) {
                            console.log(`      [LEARNING SYSTEM] Frequency: ${suggestion.frequency} occurrences`);
                        }
                        if (suggestion.successRate) {
                            console.log(`      [LEARNING SYSTEM] Success rate: ${(suggestion.successRate * 100).toFixed(1)}%`);
                        }
                        console.log(`      [LEARNING SYSTEM] Solution: ${suggestion.solution}`);
                        if (suggestion.avoid) {
                            console.log(`      [LEARNING SYSTEM] ⚠️  AVOID: ${suggestion.avoid}`);
                        } else if (suggestion.misdiagnosis) {
                            console.log(`      [LEARNING SYSTEM] ⚠️  AVOID: ${suggestion.misdiagnosis.common_misdiagnosis}`);
                        }
                        if (suggestion.timeSaved) {
                            console.log(`      [LEARNING SYSTEM] Time saved: ${Math.round(suggestion.timeSaved / 1000)}s`);
                        }
                        result.learningFix = suggestion;
                        
                        // Attempt automatic fix
                        process.stdout.write(`      [AUTO-FIX] Attempting fix... `);
                        const fixed = await this.attemptAutoFix({ ...result, check: check.name });
                        if (fixed) {
                            console.log('[SUCCESS]');
                            // Re-run check
                            const recheck = await Promise.resolve(check.fn());
                            if (recheck.success) {
                                console.log(`      [CHECK] ${check.name}... [OK] (fixed)`);
                                continue; // Skip adding to issues
                            }
                        } else {
                            console.log('[MANUAL FIX REQUIRED]');
                        }
                    } else {
                        console.log(`      Fix: ${result.fix || 'Manual intervention required'}`);
                    }
                    
                    this.issues.push({
                        check: check.name,
                        ...result
                    });
                    allPassed = false;
                }
            } catch (error) {
                console.log('[ERROR]');
                console.log(`      Exception: ${error.message}`);
                this.issues.push({
                    check: check.name,
                    success: false,
                    error: error.message
                });
                allPassed = false;
            }
        }
        
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        if (allPassed) {
            console.log('  [OK] ALL PRE-FLIGHT CHECKS PASSED');
            console.log('═══════════════════════════════════════════════════════════════\n');
            return { success: true };
        } else {
            console.log('  [!] PRE-FLIGHT CHECKS FAILED - Issues Found');
            console.log('═══════════════════════════════════════════════════════════════\n');
            console.log('Issues found:');
            this.issues.forEach((issue, i) => {
                console.log(`  ${i + 1}. ${issue.check}: ${issue.error}`);
                if (issue.learningFix) {
                    console.log(`     → Learning System Solution: ${issue.learningFix.solution}`);
                } else if (issue.fix) {
                    console.log(`     → Fix: ${issue.fix}`);
                }
            });
            console.log('');
            return { success: false, issues: this.issues };
        }
    }
}

// Run if called directly
if (require.main === module) {
    const check = new PreFlightCheck();
    check.runAllChecks().then(result => {
        process.exit(result.success ? 0 : 1);
    }).catch(error => {
        console.error('Pre-flight check failed:', error);
        process.exit(1);
    });
}

module.exports = PreFlightCheck;
