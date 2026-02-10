/**
 * Database Manager - MySQL Connection and Query Handler
 * 
 * Manages MySQL connections, queries, and transactions for BrokenPromise
 * Replaces JSON file storage with indexed database queries
 */

const mysql = require('mysql2/promise');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

class DatabaseManager {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        this.pool = null;
        this.dbName = process.env.DB_NAME || 'poker';
        this.initialized = false;
    }

    /**
     * Initialize database connection pool
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Create connection pool
            this.pool = mysql.createPool({
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT) || 3306,
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: this.dbName,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 0
            });

            // Test connection
            const connection = await this.pool.getConnection();
            await connection.ping();
            connection.release();

            // Ensure tables exist
            await this.ensureTables();

            this.initialized = true;
        } catch (error) {
            throw new Error(`Database initialization failed: ${error.message}`);
        }
    }

    /**
     * Ensure all tables exist (create if not)
     */
    async ensureTables() {
        const schemaPath = path.join(__dirname, '../database/schema.sql');
        const fs = require('fs');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Get raw connection for multi-statement execution
        const connection = await this.pool.getConnection();
        
        try {
            // Execute schema as single multi-statement query
            // Remove comments and split by semicolon
            const cleanSchema = schema
                .replace(/--.*$/gm, '') // Remove single-line comments
                .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.toLowerCase().startsWith('use ') && !s.toLowerCase().startsWith('create database'));
            
            for (const statement of cleanSchema) {
                if (statement.length > 0) {
                    try {
                        await connection.query(statement);
                    } catch (error) {
                        // Ignore "table already exists" errors
                        if (!error.message.includes('already exists') && !error.message.includes('Duplicate')) {
                            console.error('Schema execution error:', error.message);
                            console.error('Statement:', statement.substring(0, 100));
                            throw error;
                        }
                    }
                }
            }
        } finally {
            connection.release();
        }
    }

    /**
     * Get state value by path
     */
    async getState(path) {
        if (!this.initialized) await this.initialize();
        
        const [rows] = await this.pool.execute(
            'SELECT value FROM state WHERE path = ?',
            [path]
        );
        
        if (rows.length === 0) return null;
        try {
            return JSON.parse(rows[0].value);
        } catch (e) {
            return rows[0].value;
        }
    }

    /**
     * Update state value by path
     */
    async updateState(path, value) {
        if (!this.initialized) await this.initialize();
        
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        const timestamp = Date.now();
        
        await this.pool.execute(
            'INSERT INTO state (path, value, updated_at) VALUES (?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE value = ?, updated_at = ?',
            [path, valueStr, timestamp, valueStr, timestamp]
        );

        // Log state change (for on-demand EventLog)
        await this.logStateChange(path, null, value);
    }

    /**
     * Log state change (for on-demand EventLog generation)
     */
    async logStateChange(path, oldValue, newValue, correlatedIssueId = null) {
        if (!this.initialized) await this.initialize();
        
        // Only log critical paths (game.*, issues.*, learning.*, ai.*)
        if (!this.shouldLogPath(path)) return;

        const oldHash = oldValue ? this.hashValue(oldValue) : null;
        const newHash = newValue ? this.hashValue(newValue) : null;
        const timestamp = Date.now();

        // Store full values only for critical paths (game.*, issues.*)
        // Store hash only for learning.*, ai.*
        const storeFullValue = path.startsWith('game.') || path.startsWith('issues.');

        await this.pool.execute(
            'INSERT INTO state_changes (path, old_value_hash, new_value_hash, timestamp, correlated_issue_id) ' +
            'VALUES (?, ?, ?, ?, ?)',
            [path, oldHash, newHash, timestamp, correlatedIssueId]
        );

        // Keep only last 200 events per path (auto-cleanup)
        await this.pool.execute(
            'DELETE FROM state_changes WHERE path = ? AND id NOT IN ' +
            '(SELECT id FROM (SELECT id FROM state_changes WHERE path = ? ORDER BY timestamp DESC LIMIT 200) AS keep)',
            [path, path]
        );
    }

    /**
     * Check if path should be logged (only critical paths)
     */
    shouldLogPath(path) {
        return path.startsWith('game.') ||
               path.startsWith('issues.') ||
               path.startsWith('learning.') ||
               path.startsWith('ai.');
    }

    /**
     * Hash value for storage (saves space)
     */
    hashValue(value) {
        const str = typeof value === 'string' ? value : JSON.stringify(value);
        return crypto.createHash('sha256').update(str).digest('hex');
    }

    /**
     * Get state history (replaces EventLog)
     */
    async getStateHistory(path, timeRange = null) {
        if (!this.initialized) await this.initialize();
        
        let query = 'SELECT * FROM state_changes WHERE path = ? OR path LIKE ?';
        const params = [path, `${path}.%`];
        
        if (timeRange) {
            const startTime = Date.now() - timeRange;
            query += ' AND timestamp > ?';
            params.push(startTime);
        }
        
        query += ' ORDER BY timestamp DESC LIMIT 200';
        
        const [rows] = await this.pool.execute(query, params);
        return rows;
    }

    /**
     * Get all state paths (for migration)
     */
    async getAllStatePaths() {
        if (!this.initialized) await this.initialize();
        
        const [rows] = await this.pool.execute('SELECT path FROM state');
        return rows.map(r => r.path);
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.initialized = false;
        }
    }

    /**
     * Get database connection pool (for direct queries)
     */
    getPool() {
        if (!this.initialized) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.pool;
    }
}

module.exports = DatabaseManager;
