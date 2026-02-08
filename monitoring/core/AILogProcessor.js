/**
 * AI Log Processor - AI Understands All Logs
 * 
 * AI reads and processes ALL logs automatically.
 * Human never needs to read logs.
 * AI extracts structured data, identifies patterns, builds knowledge.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const EventEmitter = require('events');

class AILogProcessor extends EventEmitter {
    constructor(projectRoot, stateStore) {
        super();
        this.projectRoot = projectRoot;
        this.stateStore = stateStore;
        this.logFile = path.join(projectRoot, 'logs', 'game.log');
        
        // Processed logs by source
        this.logs = {
            server: [],
            unity: [],
            database: [],
            game: [],
            monitoring: []
        };
        
        // Patterns AI has learned
        this.patterns = new Map();
        
        // Last read position
        this.lastPosition = 0;
        
        // Processing stats
        this.stats = {
            totalProcessed: 0,
            errorsFound: 0,
            warningsFound: 0,
            patternsDetected: 0,
            lastProcessed: null
        };
        
        // Start processing
        this.start();
    }
    
    /**
     * Start processing logs
     */
    start() {
        // Process existing logs
        this.processExistingLogs();
        
        // Watch for new logs
        this.watchLogFile();
    }
    
    /**
     * Process existing logs
     */
    async processExistingLogs() {
        try {
            if (!fs.existsSync(this.logFile)) {
                return;
            }
            
            const stats = fs.statSync(this.logFile);
            this.lastPosition = stats.size;
            
            // Read last 1000 lines to catch up
            const lines = await this.readLastLines(1000);
            
            for (const line of lines) {
                this.processLine(line);
            }
        } catch (error) {
            console.error('Error processing existing logs:', error);
        }
    }
    
    /**
     * Watch log file for new entries
     */
    watchLogFile() {
        // Check for new logs every second
        setInterval(() => {
            this.checkForNewLogs();
        }, 1000);
    }
    
    /**
     * Check for new logs
     */
    async checkForNewLogs() {
        try {
            if (!fs.existsSync(this.logFile)) {
                return;
            }
            
            const stats = fs.statSync(this.logFile);
            
            // File was rotated/cleared
            if (stats.size < this.lastPosition) {
                this.lastPosition = 0;
            }
            
            // New content available
            if (stats.size > this.lastPosition) {
                const newContent = await this.readFromPosition(this.lastPosition);
                const lines = newContent.split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    this.processLine(line);
                }
                
                this.lastPosition = stats.size;
            }
        } catch (error) {
            console.error('Error checking for new logs:', error);
        }
    }
    
    /**
     * Process a single log line
     * AI extracts structured data, identifies patterns
     */
    processLine(line) {
        if (!line || !line.trim()) {
            return;
        }
        
        this.stats.totalProcessed++;
        this.stats.lastProcessed = Date.now();
        
        // Parse log line
        const parsed = this.parseLogLine(line);
        
        if (!parsed) {
            return;
        }
        
        // Categorize by source
        const source = this.categorizeSource(parsed);
        
        // Store in appropriate category
        if (this.logs[source]) {
            this.logs[source].push(parsed);
            
            // Keep only last 1000 logs per category
            if (this.logs[source].length > 1000) {
                this.logs[source] = this.logs[source].slice(-1000);
            }
        }
        
        // Detect patterns
        this.detectPatterns(parsed);
        
        // Extract structured data
        this.extractStructuredData(parsed);
        
        // Check for errors/warnings
        if (parsed.level === 'error') {
            this.stats.errorsFound++;
            this.emit('error', parsed);
        } else if (parsed.level === 'warning') {
            this.stats.warningsFound++;
            this.emit('warning', parsed);
        }
        
        // Emit processed log
        this.emit('logProcessed', parsed);
        
        // Update state store with log info
        this.updateStateStore(parsed);
    }
    
    /**
     * Parse log line into structured data
     */
    parseLogLine(line) {
        try {
            // Try to parse structured log format: [timestamp] [source] [level] message
            const match = line.match(/\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.+)/);
            
            if (match) {
                return {
                    timestamp: this.parseTimestamp(match[1]),
                    source: match[2],
                    level: match[3].toLowerCase(),
                    message: match[4],
                    raw: line,
                    parsed: true
                };
            }
            
            // Try alternative format: [timestamp] [source] message
            const match2 = line.match(/\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.+)/);
            
            if (match2) {
                return {
                    timestamp: this.parseTimestamp(match2[1]),
                    source: match2[2],
                    level: this.inferLevel(match2[3]),
                    message: match2[3],
                    raw: line,
                    parsed: true
                };
            }
            
            // Fallback: treat as unstructured
            return {
                timestamp: Date.now(),
                source: 'unknown',
                level: this.inferLevel(line),
                message: line,
                raw: line,
                parsed: false
            };
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Parse timestamp
     */
    parseTimestamp(timestampStr) {
        try {
            // Try ISO format
            const date = new Date(timestampStr);
            if (!isNaN(date.getTime())) {
                return date.getTime();
            }
            
            // Try custom format: YYYY-MM-DD HH:mm:ss
            const match = timestampStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
            if (match) {
                const [, year, month, day, hour, minute, second, millisecond] = match;
                return new Date(
                    parseInt(year),
                    parseInt(month) - 1,
                    parseInt(day),
                    parseInt(hour),
                    parseInt(minute),
                    parseInt(second),
                    parseInt(millisecond || 0)
                ).getTime();
            }
            
            return Date.now();
        } catch (error) {
            return Date.now();
        }
    }
    
    /**
     * Infer log level from message
     */
    inferLevel(message) {
        const lower = message.toLowerCase();
        
        if (lower.includes('error') || lower.includes('exception') || lower.includes('failed')) {
            return 'error';
        } else if (lower.includes('warning') || lower.includes('warn')) {
            return 'warning';
        } else if (lower.includes('debug')) {
            return 'debug';
        } else {
            return 'info';
        }
    }
    
    /**
     * Categorize log by source
     */
    categorizeSource(parsed) {
        const source = parsed.source.toLowerCase();
        
        if (source.includes('server') || source.includes('http') || source.includes('api')) {
            return 'server';
        } else if (source.includes('unity') || source.includes('game') || source.includes('ui')) {
            return 'unity';
        } else if (source.includes('database') || source.includes('mysql') || source.includes('db')) {
            return 'database';
        } else if (source.includes('monitor') || source.includes('investigation')) {
            return 'monitoring';
        } else {
            return 'game';
        }
    }
    
    /**
     * Detect patterns in logs
     * AI learns what patterns lead to what issues
     */
    detectPatterns(parsed) {
        // Detect error patterns
        if (parsed.level === 'error') {
            const pattern = this.extractPattern(parsed.message);
            if (pattern) {
                if (!this.patterns.has(pattern)) {
                    this.patterns.set(pattern, {
                        count: 0,
                        firstSeen: parsed.timestamp,
                        lastSeen: parsed.timestamp,
                        examples: []
                    });
                }
                
                const patternData = this.patterns.get(pattern);
                patternData.count++;
                patternData.lastSeen = parsed.timestamp;
                
                if (patternData.examples.length < 10) {
                    patternData.examples.push(parsed);
                }
                
                this.stats.patternsDetected++;
                this.emit('patternDetected', { pattern, data: patternData });
            }
        }
    }
    
    /**
     * Extract pattern from message
     */
    extractPattern(message) {
        // Extract key parts: error type, location, context
        // Example: "CHIP_MISMATCH in Table.bet() - pot: 1000, expected: 1500"
        // Pattern: "CHIP_MISMATCH in Table.bet()"
        
        // Try to extract error type
        const errorTypeMatch = message.match(/([A-Z_]+)/);
        if (errorTypeMatch) {
            const errorType = errorTypeMatch[1];
            
            // Try to extract location
            const locationMatch = message.match(/(?:in|at|from)\s+([\w.]+(?:\(\))?)/);
            if (locationMatch) {
                return `${errorType} in ${locationMatch[1]}`;
            }
            
            return errorType;
        }
        
        return null;
    }
    
    /**
     * Extract structured data from log
     */
    extractStructuredData(parsed) {
        // Extract chip amounts
        const chipMatch = parsed.message.match(/(\d+(?:\.\d+)?)\s*chips?/i);
        if (chipMatch) {
            parsed.chips = parseFloat(chipMatch[1]);
        }
        
        // Extract table IDs
        const tableIdMatch = parsed.message.match(/table[:\s]+([a-f0-9-]{36})/i);
        if (tableIdMatch) {
            parsed.tableId = tableIdMatch[1];
        }
        
        // Extract player IDs
        const playerIdMatch = parsed.message.match(/player[:\s]+([a-f0-9-]{36})/i);
        if (playerIdMatch) {
            parsed.playerId = playerIdMatch[1];
        }
        
        // Extract operation types
        const operationMatch = parsed.message.match(/(bet|call|raise|fold|check|all[-_]?in)/i);
        if (operationMatch) {
            parsed.operation = operationMatch[1].toLowerCase();
        }
        
        // Extract phase
        const phaseMatch = parsed.message.match(/(pre[-_]?flop|flop|turn|river|showdown)/i);
        if (phaseMatch) {
            parsed.phase = phaseMatch[1].toLowerCase();
        }
    }
    
    /**
     * Update state store with log information
     */
    updateStateStore(parsed) {
        // Update system logs
        const source = this.categorizeSource(parsed);
        if (source === 'server' || source === 'database' || source === 'unity') {
            const systemState = this.stateStore.getState(`system.${source}`);
            if (systemState) {
                systemState.logs.push(parsed);
                if (systemState.logs.length > 100) {
                    systemState.logs = systemState.logs.slice(-100);
                }
                systemState.lastCheck = Date.now();
            }
        }
    }
    
    /**
     * Query logs - AI can ask questions
     */
    queryLogs(question) {
        // Parse question to understand what AI wants
        const lower = question.toLowerCase();
        
        // "What errors occurred in the last hour?"
        if (lower.includes('error') && (lower.includes('last') || lower.includes('recent'))) {
            const timeRange = this.parseTimeRange(question);
            return this.getErrors(timeRange);
        }
        
        // "What was the state when X happened?"
        if (lower.includes('state') && lower.includes('when')) {
            const event = this.extractEvent(question);
            return this.getStateAtEvent(event);
        }
        
        // "What patterns lead to Y?"
        if (lower.includes('pattern') && lower.includes('lead')) {
            const issue = this.extractIssue(question);
            return this.getPatternsForIssue(issue);
        }
        
        // Default: search logs
        return this.searchLogs(question);
    }
    
    /**
     * Get errors in time range
     */
    getErrors(timeRange = null) {
        let errors = [];
        
        for (const source of Object.keys(this.logs)) {
            errors = errors.concat(
                this.logs[source].filter(log => {
                    if (log.level !== 'error') return false;
                    if (timeRange) {
                        const now = Date.now();
                        return log.timestamp >= (now - timeRange);
                    }
                    return true;
                })
            );
        }
        
        return errors.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    /**
     * Search logs
     */
    searchLogs(query) {
        const results = [];
        const lowerQuery = query.toLowerCase();
        
        for (const source of Object.keys(this.logs)) {
            for (const log of this.logs[source]) {
                if (log.message.toLowerCase().includes(lowerQuery) ||
                    log.source.toLowerCase().includes(lowerQuery)) {
                    results.push(log);
                }
            }
        }
        
        return results.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    /**
     * Parse time range from question
     */
    parseTimeRange(question) {
        const lower = question.toLowerCase();
        
        if (lower.includes('hour')) return 3600000;
        if (lower.includes('minute')) {
            const match = question.match(/(\d+)\s*minute/);
            return match ? parseInt(match[1]) * 60000 : 60000;
        }
        if (lower.includes('day')) {
            const match = question.match(/(\d+)\s*day/);
            return match ? parseInt(match[1]) * 86400000 : 86400000;
        }
        
        return null;
    }
    
    /**
     * Extract event from question
     */
    extractEvent(question) {
        // Simple extraction - can be enhanced
        return question;
    }
    
    /**
     * Get state at event
     */
    getStateAtEvent(event) {
        // Find logs matching event
        const matchingLogs = this.searchLogs(event);
        if (matchingLogs.length > 0) {
            const log = matchingLogs[0];
            return {
                log,
                state: this.stateStore.getStateHistory(null, log.timestamp)
            };
        }
        return null;
    }
    
    /**
     * Extract issue from question
     */
    extractIssue(question) {
        // Simple extraction - can be enhanced
        return question;
    }
    
    /**
     * Get patterns for issue
     */
    getPatternsForIssue(issue) {
        const results = [];
        
        for (const [pattern, data] of this.patterns.entries()) {
            if (pattern.toLowerCase().includes(issue.toLowerCase())) {
                results.push({ pattern, data });
            }
        }
        
        return results;
    }
    
    /**
     * Read last N lines from file
     */
    async readLastLines(count) {
        return new Promise((resolve, reject) => {
            const lines = [];
            const fileStream = fs.createReadStream(this.logFile);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            
            rl.on('line', (line) => {
                lines.push(line);
                if (lines.length > count) {
                    lines.shift();
                }
            });
            
            rl.on('close', () => {
                resolve(lines);
            });
            
            rl.on('error', reject);
        });
    }
    
    /**
     * Read from position
     */
    async readFromPosition(position) {
        return new Promise((resolve, reject) => {
            const fileStream = fs.createReadStream(this.logFile, { start: position });
            let content = '';
            
            fileStream.on('data', (chunk) => {
                content += chunk.toString();
            });
            
            fileStream.on('end', () => {
                resolve(content);
            });
            
            fileStream.on('error', reject);
        });
    }
    
    /**
     * Get processing stats
     */
    getStats() {
        return {
            ...this.stats,
            logsBySource: {
                server: this.logs.server.length,
                unity: this.logs.unity.length,
                database: this.logs.database.length,
                game: this.logs.game.length,
                monitoring: this.logs.monitoring.length
            },
            patternsDetected: this.patterns.size
        };
    }
}

module.exports = AILogProcessor;
