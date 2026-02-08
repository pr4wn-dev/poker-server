/**
 * PowerShell Syntax Validator
 * 
 * Validates PowerShell scripts before execution to catch:
 * - Syntax errors (parse errors)
 * - Structural issues (try/catch mismatches, brace imbalances)
 * - Quote problems (mismatched quotes, escaped characters)
 * - Special character issues (non-ASCII, encoding problems)
 * - Logic errors (unreachable code, missing catch blocks)
 * 
 * Integrates with learning system to learn from patterns.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const EventEmitter = require('events');
const gameLogger = require('../../src/utils/GameLogger');

const execAsync = promisify(exec);

class PowerShellSyntaxValidator extends EventEmitter {
    constructor(projectRoot, stateStore, issueDetector, learningEngine) {
        super();
        this.projectRoot = projectRoot;
        this.stateStore = stateStore;
        this.issueDetector = issueDetector;
        this.learningEngine = learningEngine;
        
        // Validation cache
        this.validationCache = new Map(); // filePath -> { result, timestamp }
        this.cacheTimeout = 60000; // 1 minute cache
        
        // Error patterns learned from previous validations
        this.errorPatterns = new Map(); // pattern -> { count, contexts, solutions }
        
        // Load learned patterns
        this.load();
    }
    
    /**
     * Validate PowerShell script
     * @param {string} filePath - Path to PowerShell script
     * @param {string} content - Optional: script content (if not provided, reads from file)
     * @returns {Promise<Object>} Validation result
     */
    async validateScript(filePath, content = null) {
        try {
            // Check cache
            const cached = this.validationCache.get(filePath);
            if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
                return cached.result;
            }
            
            // Read content if not provided
            if (!content) {
                if (!fs.existsSync(filePath)) {
                    const result = {
                        valid: false,
                        errors: [{
                            type: 'FILE_NOT_FOUND',
                            message: `File not found: ${filePath}`,
                            line: null,
                            column: null
                        }],
                        warnings: [],
                        structuralIssues: [],
                        quoteIssues: [],
                        specialCharIssues: []
                    };
                    this.cacheResult(filePath, result);
                    return result;
                }
                content = fs.readFileSync(filePath, 'utf8');
            }
            
            // Run comprehensive validation
            const result = {
                valid: true,
                errors: [],
                warnings: [],
                structuralIssues: [],
                quoteIssues: [],
                specialCharIssues: [],
                filePath,
                timestamp: Date.now()
            };
            
            // 1. PowerShell parser validation (most reliable)
            const parseResult = await this.validateWithParser(content, filePath);
            result.errors.push(...parseResult.errors);
            result.warnings.push(...parseResult.warnings);
            
            // 2. Structural analysis (try/catch, braces, etc.)
            const structuralResult = this.analyzeStructure(content);
            result.structuralIssues.push(...structuralResult.issues);
            if (structuralResult.issues.length > 0) {
                result.valid = false;
            }
            
            // 3. Quote analysis
            const quoteResult = this.analyzeQuotes(content);
            result.quoteIssues.push(...quoteResult.issues);
            if (quoteResult.issues.length > 0) {
                result.valid = false;
            }
            
            // 4. Special character analysis
            const specialCharResult = this.analyzeSpecialCharacters(content);
            result.specialCharIssues.push(...specialCharResult.issues);
            if (specialCharResult.issues.length > 0) {
                result.warnings.push(...specialCharResult.issues);
            }
            
            // 5. Logic analysis (unreachable code, missing catch blocks)
            const logicResult = this.analyzeLogic(content);
            result.warnings.push(...logicResult.warnings);
            
            // Update valid flag
            if (result.errors.length > 0 || result.structuralIssues.length > 0 || result.quoteIssues.length > 0) {
                result.valid = false;
            }
            
            // Learn from errors
            if (!result.valid) {
                await this.learnFromErrors(result, filePath);
            }
            
            // Cache result
            this.cacheResult(filePath, result);
            
            // Emit event
            this.emit('validated', { filePath, result });
            
            return result;
            
        } catch (error) {
            gameLogger.error('CERBERUS', '[POWERSHELL_VALIDATOR] VALIDATION_ERROR', {
                filePath,
                error: error.message,
                stack: error.stack
            });
            
            return {
                valid: false,
                errors: [{
                    type: 'VALIDATION_ERROR',
                    message: `Failed to validate script: ${error.message}`,
                    line: null,
                    column: null
                }],
                warnings: [],
                structuralIssues: [],
                quoteIssues: [],
                specialCharIssues: [],
                filePath,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * Validate using PowerShell parser (most reliable)
     */
    async validateWithParser(content, filePath) {
        const result = {
            errors: [],
            warnings: []
        };
        
        try {
            // Create temp file for validation
            const tempFile = path.join(this.projectRoot, 'logs', `temp-validation-${Date.now()}.ps1`);
            const tempDir = path.dirname(tempFile);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            fs.writeFileSync(tempFile, content, 'utf8');
            
            try {
                // Use PowerShell parser to validate
                const command = `powershell -NoProfile -Command "$ErrorActionPreference = 'Stop'; try { $null = [System.Management.Automation.PSParser]::Tokenize((Get-Content '${tempFile.replace(/'/g, "''")}' -Raw), [ref]\\$null); Write-Output 'VALID' } catch { Write-Output \"ERROR:$($_.Exception.Message)\" }"`;
                
                const { stdout, stderr } = await execAsync(command, {
                    timeout: 10000,
                    maxBuffer: 1024 * 1024
                });
                
                const output = stdout.trim();
                
                if (output === 'VALID') {
                    // Parser says it's valid, but check for warnings
                    if (stderr && stderr.trim()) {
                        result.warnings.push({
                            type: 'PARSER_WARNING',
                            message: stderr.trim(),
                            line: null,
                            column: null
                        });
                    }
                } else if (output.startsWith('ERROR:')) {
                    const errorMsg = output.substring(6);
                    // Parse error message to extract line/column if possible
                    const lineMatch = errorMsg.match(/At line:(\d+)/i);
                    const charMatch = errorMsg.match(/At char:(\d+)/i);
                    
                    result.errors.push({
                        type: 'PARSER_ERROR',
                        message: errorMsg,
                        line: lineMatch ? parseInt(lineMatch[1]) : null,
                        column: charMatch ? parseInt(charMatch[1]) : null,
                        rawError: errorMsg
                    });
                }
                
            } finally {
                // Clean up temp file
                try {
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }
                } catch (cleanupError) {
                    // Ignore cleanup errors
                }
            }
            
        } catch (error) {
            // If validation command fails, it might be a syntax error
            const errorOutput = error.stdout || error.stderr || error.message;
            if (errorOutput) {
                const lineMatch = errorOutput.match(/At line:(\d+)/i);
                const charMatch = errorOutput.match(/At char:(\d+)/i);
                
                result.errors.push({
                    type: 'PARSER_ERROR',
                    message: errorOutput.toString(),
                    line: lineMatch ? parseInt(lineMatch[1]) : null,
                    column: charMatch ? parseInt(charMatch[1]) : null,
                    rawError: errorOutput.toString()
                });
            } else {
                result.errors.push({
                    type: 'VALIDATION_FAILED',
                    message: `Failed to run PowerShell parser: ${error.message}`,
                    line: null,
                    column: null
                });
            }
        }
        
        return result;
    }
    
    /**
     * Analyze script structure (try/catch, braces, etc.)
     */
    analyzeStructure(content) {
        const result = {
            issues: []
        };
        
        const lines = content.split('\n');
        let braceCount = 0;
        let tryCount = 0;
        let catchCount = 0;
        let finallyCount = 0;
        const tryBlocks = []; // { line, hasCatch, hasFinally }
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;
            
            // Count braces
            const openBraces = (line.match(/\{/g) || []).length;
            const closeBraces = (line.match(/\}/g) || []).length;
            braceCount += openBraces - closeBraces;
            
            // Track try blocks
            if (/^\s*try\s*\{/.test(line)) {
                tryCount++;
                tryBlocks.push({ line: lineNum, hasCatch: false, hasFinally: false });
            }
            
            // Track catch blocks
            if (/^\s*\}\s*catch\s*\{/.test(line)) {
                catchCount++;
                if (tryBlocks.length > 0) {
                    tryBlocks[tryBlocks.length - 1].hasCatch = true;
                }
            }
            
            // Track finally blocks
            if (/^\s*\}\s*finally\s*\{/.test(line)) {
                finallyCount++;
                if (tryBlocks.length > 0) {
                    tryBlocks[tryBlocks.length - 1].hasFinally = true;
                }
            }
        }
        
        // Check brace balance
        if (braceCount !== 0) {
            result.issues.push({
                type: 'BRACE_IMBALANCE',
                message: `Unmatched braces: ${braceCount > 0 ? 'missing' : 'extra'} ${Math.abs(braceCount)} closing brace(s)`,
                line: null,
                severity: 'error'
            });
        }
        
        // Check try/catch pairing
        const totalCatchFinally = catchCount + finallyCount;
        if (tryCount !== totalCatchFinally) {
            result.issues.push({
                type: 'TRY_CATCH_MISMATCH',
                message: `Try blocks (${tryCount}) don't match catch/finally blocks (${catchCount} catch, ${finallyCount} finally)`,
                line: null,
                severity: 'error',
                details: {
                    tryCount,
                    catchCount,
                    finallyCount,
                    missing: tryCount - totalCatchFinally
                }
            });
        }
        
        // Check for try blocks without catch or finally
        const unmatchedTryBlocks = tryBlocks.filter(tb => !tb.hasCatch && !tb.hasFinally);
        if (unmatchedTryBlocks.length > 0) {
            result.issues.push({
                type: 'UNMATCHED_TRY',
                message: `Found ${unmatchedTryBlocks.length} try block(s) without catch or finally`,
                line: unmatchedTryBlocks[0].line,
                severity: 'error',
                details: {
                    unmatchedTryBlocks: unmatchedTryBlocks.map(tb => tb.line)
                }
            });
        }
        
        return result;
    }
    
    /**
     * Analyze quotes (mismatched, escaped, etc.)
     */
    analyzeQuotes(content) {
        const result = {
            issues: []
        };
        
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;
            
            // Count single quotes (accounting for escaped quotes)
            const singleQuotes = (line.match(/'/g) || []).length;
            const escapedSingleQuotes = (line.match(/''/g) || []).length;
            const actualSingleQuotes = singleQuotes - (escapedSingleQuotes * 2);
            
            // Count double quotes (accounting for escaped quotes)
            const doubleQuotes = (line.match(/"/g) || []).length;
            const escapedDoubleQuotes = (line.match(/\\"/g) || []).length;
            const actualDoubleQuotes = doubleQuotes - escapedDoubleQuotes;
            
            // Check for mismatched quotes
            if (actualSingleQuotes % 2 !== 0) {
                result.issues.push({
                    type: 'MISMATCHED_SINGLE_QUOTES',
                    message: `Mismatched single quotes on line ${lineNum}`,
                    line: lineNum,
                    severity: 'error'
                });
            }
            
            if (actualDoubleQuotes % 2 !== 0) {
                result.issues.push({
                    type: 'MISMATCHED_DOUBLE_QUOTES',
                    message: `Mismatched double quotes on line ${lineNum}`,
                    line: lineNum,
                    severity: 'error'
                });
            }
        }
        
        return result;
    }
    
    /**
     * Analyze special characters (non-ASCII, encoding issues)
     */
    analyzeSpecialCharacters(content) {
        const result = {
            issues: []
        };
        
        const lines = content.split('\n');
        const bytes = Buffer.from(content, 'utf8');
        
        // Check for non-ASCII characters (might cause issues)
        const nonAsciiChars = [];
        for (let i = 0; i < bytes.length; i++) {
            if (bytes[i] > 127) {
                const char = String.fromCharCode(bytes[i]);
                const lineNum = content.substring(0, i).split('\n').length;
                nonAsciiChars.push({
                    char,
                    byte: bytes[i],
                    position: i,
                    line: lineNum
                });
            }
        }
        
        if (nonAsciiChars.length > 0) {
            // Group by line
            const byLine = {};
            for (const char of nonAsciiChars) {
                if (!byLine[char.line]) {
                    byLine[char.line] = [];
                }
                byLine[char.line].push(char);
            }
            
            for (const [lineNum, chars] of Object.entries(byLine)) {
                result.issues.push({
                    type: 'NON_ASCII_CHARACTERS',
                    message: `Found ${chars.length} non-ASCII character(s) on line ${lineNum}`,
                    line: parseInt(lineNum),
                    severity: 'warning',
                    details: {
                        characters: chars.map(c => ({
                            char: c.char,
                            code: c.byte,
                            hex: `U+${c.byte.toString(16).padStart(4, '0')}`
                        }))
                    }
                });
            }
        }
        
        return result;
    }
    
    /**
     * Analyze logic (unreachable code, missing catch blocks, etc.)
     */
    analyzeLogic(content) {
        const result = {
            warnings: []
        };
        
        const lines = content.split('\n');
        
        // Check for common logic issues
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;
            
            // Check for return/break/continue after throw
            if (i > 0 && /throw/.test(lines[i - 1]) && /return|break|continue/.test(line)) {
                result.warnings.push({
                    type: 'UNREACHABLE_CODE',
                    message: `Potentially unreachable code after throw on line ${lineNum}`,
                    line: lineNum,
                    severity: 'warning'
                });
            }
        }
        
        return result;
    }
    
    /**
     * Learn from validation errors
     */
    async learnFromErrors(validationResult, filePath) {
        if (!this.learningEngine) return;
        
        // Extract error patterns
        const allErrors = [
            ...validationResult.errors,
            ...validationResult.structuralIssues,
            ...validationResult.quoteIssues
        ];
        
        for (const error of allErrors) {
            const pattern = this.extractPattern(error);
            
            if (!this.errorPatterns.has(pattern)) {
                this.errorPatterns.set(pattern, {
                    count: 0,
                    contexts: [],
                    solutions: [],
                    firstSeen: Date.now(),
                    lastSeen: Date.now()
                });
            }
            
            const patternData = this.errorPatterns.get(pattern);
            patternData.count++;
            patternData.lastSeen = Date.now();
            patternData.contexts.push({
                filePath,
                line: error.line,
                message: error.message,
                timestamp: Date.now()
            });
            
            // Keep only last 10 contexts
            if (patternData.contexts.length > 10) {
                patternData.contexts.shift();
            }
        }
        
        // Report to issue detector
        if (this.issueDetector && allErrors.length > 0) {
            this.issueDetector.detectIssue({
                type: 'POWERSHELL_SYNTAX_ERROR',
                severity: 'high',
                method: 'powerShellSyntaxValidator',
                details: {
                    filePath,
                    errorCount: validationResult.errors.length,
                    structuralCount: validationResult.structuralIssues.length,
                    quoteCount: validationResult.quoteIssues.length,
                    errors: allErrors.slice(0, 5) // First 5 errors
                }
            });
        }
        
        // Save learned patterns
        this.save();
    }
    
    /**
     * Extract pattern from error for learning
     */
    extractPattern(error) {
        // Normalize error message to extract pattern
        let pattern = error.type || 'UNKNOWN';
        
        if (error.message) {
            // Extract key phrases
            const keyPhrases = [
                'brace',
                'try',
                'catch',
                'quote',
                'syntax',
                'unexpected',
                'missing'
            ];
            
            for (const phrase of keyPhrases) {
                if (error.message.toLowerCase().includes(phrase)) {
                    pattern += `_${phrase}`;
                }
            }
        }
        
        return pattern;
    }
    
    /**
     * Get suggestions for fixing errors
     */
    getSuggestions(validationResult) {
        const suggestions = [];
        
        for (const error of validationResult.errors) {
            const pattern = this.extractPattern(error);
            const patternData = this.errorPatterns.get(pattern);
            
            if (patternData && patternData.solutions.length > 0) {
                suggestions.push({
                    error: error,
                    pattern: pattern,
                    solutions: patternData.solutions
                });
            }
        }
        
        return suggestions;
    }
    
    /**
     * Cache validation result
     */
    cacheResult(filePath, result) {
        this.validationCache.set(filePath, {
            result,
            timestamp: Date.now()
        });
    }
    
    /**
     * Clear cache for file
     */
    clearCache(filePath = null) {
        if (filePath) {
            this.validationCache.delete(filePath);
        } else {
            this.validationCache.clear();
        }
    }
    
    /**
     * Load learned patterns from state store
     */
    load() {
        try {
            const data = this.stateStore.getState('monitoring.powerShellValidator.patterns');
            if (data && data.patterns) {
                for (const [pattern, patternData] of Object.entries(data.patterns)) {
                    this.errorPatterns.set(pattern, patternData);
                }
            }
        } catch (error) {
            gameLogger.warn('CERBERUS', '[POWERSHELL_VALIDATOR] LOAD_ERROR', {
                error: error.message
            });
        }
    }
    
    /**
     * Save learned patterns to state store
     */
    save() {
        try {
            const patterns = {};
            for (const [pattern, patternData] of this.errorPatterns.entries()) {
                patterns[pattern] = patternData;
            }
            
            this.stateStore.updateState('monitoring.powerShellValidator.patterns', {
                patterns,
                lastUpdated: Date.now()
            });
        } catch (error) {
            gameLogger.warn('CERBERUS', '[POWERSHELL_VALIDATOR] SAVE_ERROR', {
                error: error.message
            });
        }
    }
    
    /**
     * Stop validator
     */
    stop() {
        this.save();
        this.validationCache.clear();
    }
}

module.exports = PowerShellSyntaxValidator;
