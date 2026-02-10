/**
 * Code Analysis Instrumentation - Automatic Logging Injection
 * 
 * Analyzes code AST and automatically injects logging for state-changing operations
 * Focuses on data that prevents misdiagnosis
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class CodeAnalysisInstrumentation extends EventEmitter {
    constructor(projectRoot, stateStore, learningEngine) {
        super();
        this.projectRoot = projectRoot;
        this.stateStore = stateStore;
        this.learningEngine = learningEngine;
        
        // Track what logging is actually useful
        this.usefulLogging = new Map(); // path -> { count, lastUsed, issueTypes }
        this.instrumentedFiles = new Set();
        
        // Patterns for what to log (learned from experience)
        this.loggingPatterns = {
            stateChanges: true,
            errors: true,
            stateTransitions: true,
            criticalOperations: true
        };
    }

    /**
     * Analyze JavaScript file and inject logging
     */
    async instrumentJavaScriptFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Simple AST-like analysis (for now - could use @babel/parser for full AST)
            const lines = content.split('\n');
            const instrumented = [];
            let inFunction = false;
            let functionName = null;
            let braceDepth = 0;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                
                // Detect state-changing operations
                if (trimmed.includes('stateStore.updateState') || 
                    trimmed.includes('this.state') && trimmed.includes('=') ||
                    trimmed.includes('updateState(')) {
                    
                    // Extract path if possible
                    const pathMatch = line.match(/['"`]([^'"`]+)['"`]/);
                    const statePath = pathMatch ? pathMatch[1] : 'unknown';
                    
                    // Inject logging before state change
                    instrumented.push(`        // Auto-instrumented: State change logging`);
                    instrumented.push(`        gameLogger.info('STATE_CHANGE', { path: '${statePath}', file: '${path.basename(filePath)}', line: ${i + 1} });`);
                }
                
                // Detect error handling
                if (trimmed.includes('catch') || trimmed.includes('throw') || trimmed.includes('error')) {
                    instrumented.push(`        // Auto-instrumented: Error logging`);
                    instrumented.push(`        gameLogger.error('ERROR', { error: error?.message || error, file: '${path.basename(filePath)}', line: ${i + 1} });`);
                }
                
                instrumented.push(line);
            }
            
            // Write instrumented file (with backup)
            const backupPath = filePath + '.pre-instrument-backup';
            if (!fs.existsSync(backupPath)) {
                fs.copyFileSync(filePath, backupPath);
            }
            
            fs.writeFileSync(filePath, instrumented.join('\n'), 'utf8');
            this.instrumentedFiles.add(filePath);
            
            this.emit('fileInstrumented', { file: filePath, linesAdded: instrumented.length - lines.length });
            
            return { success: true, linesAdded: instrumented.length - lines.length };
        } catch (error) {
            this.emit('instrumentationError', { file: filePath, error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Analyze C# Unity file and inject logging
     */
    async instrumentCSharpFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Simple analysis for C# (could use Roslyn for full AST)
            const lines = content.split('\n');
            const instrumented = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                
                // Detect property setters
                if (trimmed.includes('set') && trimmed.includes('{')) {
                    const propMatch = line.match(/(\w+)\s*\{/);
                    if (propMatch) {
                        instrumented.push(`        // Auto-instrumented: Property setter logging`);
                        instrumented.push(`        GameLogger.Info("STATE_CHANGE", new { path = "${propMatch[1]}", file = "${path.basename(filePath)}", line = ${i + 1} });`);
                    }
                }
                
                // Detect method calls that might change state
                if (trimmed.includes('=') && (trimmed.includes('Chips') || trimmed.includes('Money') || trimmed.includes('State'))) {
                    instrumented.push(`        // Auto-instrumented: State change logging`);
                    instrumented.push(`        GameLogger.Info("STATE_CHANGE", new { file = "${path.basename(filePath)}", line = ${i + 1} });`);
                }
                
                instrumented.push(line);
            }
            
            // Write instrumented file (with backup)
            const backupPath = filePath + '.pre-instrument-backup';
            if (!fs.existsSync(backupPath)) {
                fs.copyFileSync(filePath, backupPath);
            }
            
            fs.writeFileSync(filePath, instrumented.join('\n'), 'utf8');
            this.instrumentedFiles.add(filePath);
            
            this.emit('fileInstrumented', { file: filePath, linesAdded: instrumented.length - lines.length });
            
            return { success: true, linesAdded: instrumented.length - lines.length };
        } catch (error) {
            this.emit('instrumentationError', { file: filePath, error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Learn what logging is actually useful
     */
    async learnFromUsage(logPath, issueType) {
        // Track which logged data is actually used to solve issues
        if (!this.usefulLogging.has(logPath)) {
            this.usefulLogging.set(logPath, { count: 0, lastUsed: Date.now(), issueTypes: [] });
        }
        
        const entry = this.usefulLogging.get(logPath);
        entry.count++;
        entry.lastUsed = Date.now();
        if (!entry.issueTypes.includes(issueType)) {
            entry.issueTypes.push(issueType);
        }
        
        // Save to database
        if (this.stateStore && this.stateStore.getDatabaseManager) {
            try {
                const dbManager = this.stateStore.getDatabaseManager();
                if (dbManager) {
                    const pool = dbManager.getPool();
                    await pool.execute(`
                        INSERT INTO learning_knowledge 
                        (type, topic, content, source, timestamp, useful)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                        useful = 1,
                        timestamp = VALUES(timestamp)
                    `, [
                        'logging_usefulness',
                        logPath,
                        JSON.stringify(entry),
                        'code_analysis',
                        Date.now(),
                        1
                    ]);
                }
            } catch (error) {
                // Ignore database errors
            }
        }
    }

    /**
     * Instrument all files in a directory
     */
    async instrumentDirectory(dirPath, extensions = ['.js', '.ts', '.cs']) {
        const results = [];
        
        const files = this._getFilesRecursive(dirPath, extensions);
        
        for (const file of files) {
            if (file.endsWith('.js') || file.endsWith('.ts')) {
                const result = await this.instrumentJavaScriptFile(file);
                results.push({ file, ...result });
            } else if (file.endsWith('.cs')) {
                const result = await this.instrumentCSharpFile(file);
                results.push({ file, ...result });
            }
        }
        
        return results;
    }

    /**
     * Get all files recursively
     */
    _getFilesRecursive(dirPath, extensions) {
        const files = [];
        
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                // Skip node_modules, .git, etc.
                if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                    continue;
                }
                
                if (entry.isDirectory()) {
                    files.push(...this._getFilesRecursive(fullPath, extensions));
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (extensions.includes(ext)) {
                        files.push(fullPath);
                    }
                }
            }
        } catch (error) {
            // Ignore errors
        }
        
        return files;
    }
}

module.exports = CodeAnalysisInstrumentation;
