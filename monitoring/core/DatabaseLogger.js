/**
 * Database Logger - Writes logs to MySQL database instead of files
 * 
 * Replaces file-based logging with indexed database storage
 * Enables fast queries, no file rotation, better performance
 */

const DatabaseManager = require('./DatabaseManager');
const path = require('path');

class DatabaseLogger {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        this.dbManager = new DatabaseManager(projectRoot);
        this.initialized = false;
        this.batchSize = 100; // Batch writes for performance
        this.batch = [];
        this.batchTimeout = null;
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        if (this.initialized) return;
        await this.dbManager.initialize();
        this.initialized = true;
    }

    /**
     * Write log entry to database
     */
    async writeLog(level, category, message, data = null) {
        // CRITICAL: Skip CARDS category logging - too verbose
        if (category === 'CARDS') {
            return;
        }

        if (!this.initialized) {
            await this.initialize();
        }

        // For terminal commands, store full output in metadata
        let metadata = data ? JSON.stringify(data) : null;
        if (category === 'terminal_command' && data?.output) {
            // Store full output in metadata (TEXT field can handle large data)
            metadata = JSON.stringify({
                command: data.command || null,
                output: data.output, // Full output with stack traces
                exitCode: data.exitCode || null,
                timestamp: data.timestamp || Date.now()
            });
        }
        
        const logEntry = {
            source: this._determineSource(category),
            level: level,
            message: message,
            timestamp: Date.now(),
            file_path: data?.file || null,
            line_number: data?.line || null,
            metadata: metadata
        };

        // Add to batch
        this.batch.push(logEntry);

        // Flush batch if full
        if (this.batch.length >= this.batchSize) {
            await this._flushBatch();
        } else {
            // Schedule flush after timeout
            if (this.batchTimeout) {
                clearTimeout(this.batchTimeout);
            }
            this.batchTimeout = setTimeout(() => this._flushBatch(), 1000);
        }
    }

    /**
     * Flush batch to database
     */
    async _flushBatch() {
        if (this.batch.length === 0) return;

        try {
            const pool = this.dbManager.getPool();
            if (!pool || pool._closed) {
                // Pool is closed, clear batch to prevent memory leak
                this.batch = [];
                return;
            }
            
            const values = this.batch.map(entry => [
                entry.source,
                entry.level,
                entry.message,
                entry.timestamp,
                entry.file_path,
                entry.line_number,
                entry.metadata
            ]);

            await pool.query(`
                INSERT INTO log_processed 
                (source, level, message, timestamp, file_path, line_number, metadata)
                VALUES ?
            `, [values]);

            this.batch = [];
        } catch (error) {
            // Silently fail - don't block application
            this.batch = [];
        }
    }

    /**
     * Flush all pending logs to database (called on shutdown)
     * Ensures no data loss when system shuts down
     */
    async flush() {
        // Clear any pending timeout
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }
        
        // Flush remaining batch
        await this._flushBatch();
    }

    /**
     * Determine log source from category
     */
    _determineSource(category) {
        if (category.includes('SERVER') || category.includes('SOCKET')) return 'server';
        if (category.includes('UNITY') || category.includes('CLIENT')) return 'unity';
        if (category.includes('DATABASE') || category.includes('DB')) return 'database';
        if (category.includes('GAME') || category.includes('TABLE') || category.includes('PLAYER')) return 'game';
        if (category.includes('MONITOR') || category.includes('BROKENPROMISE')) return 'monitoring';
        return 'other';
    }

    /**
     * Get logs from database
     */
    async getLogs(source = null, level = null, timeRange = null, limit = 1000) {
        if (!this.initialized) await this.initialize();

        const pool = this.dbManager.getPool();
        let query = 'SELECT * FROM log_processed WHERE 1=1';
        const params = [];

        if (source) {
            query += ' AND source = ?';
            params.push(source);
        }

        if (level) {
            query += ' AND level = ?';
            params.push(level);
        }

        if (timeRange) {
            const startTime = Date.now() - timeRange;
            query += ' AND timestamp > ?';
            params.push(startTime);
        }

        query += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);

        const [rows] = await pool.execute(query, params);
        return rows;
    }

    /**
     * Clear old logs (keep last N days)
     */
    async clearOldLogs(daysToKeep = 30) {
        if (!this.initialized) await this.initialize();

        const pool = this.dbManager.getPool();
        const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

        await pool.execute(
            'DELETE FROM log_processed WHERE timestamp < ?',
            [cutoffTime]
        );
    }
}

module.exports = DatabaseLogger;
