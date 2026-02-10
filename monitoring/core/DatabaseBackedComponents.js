/**
 * Database-Backed Components - Helper functions for migrating in-memory data to database
 */

const DatabaseManager = require('./DatabaseManager');

class DatabaseBackedComponents {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        this.dbManager = new DatabaseManager(projectRoot);
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        await this.dbManager.initialize();
        this.initialized = true;
    }

    /**
     * Save AI action to database
     */
    async saveAIAction(action) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        await pool.execute(`
            INSERT INTO ai_actions 
            (action_type, issue_type, component, file, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            action.type || action.actionType,
            action.issueType,
            action.component,
            action.file || action.filePath,
            JSON.stringify(action),
            Date.now()
        ]);
    }

    /**
     * Save decision to database
     */
    async saveDecision(decision) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        await pool.execute(`
            INSERT INTO ai_decisions 
            (decision_type, decision_data, outcome, timestamp)
            VALUES (?, ?, ?, ?)
        `, [
            decision.type || 'unknown',
            JSON.stringify(decision),
            decision.outcome || null,
            Date.now()
        ]);
    }

    /**
     * Save shared knowledge to database
     */
    async saveSharedKnowledge(knowledge) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        await pool.execute(`
            INSERT INTO ai_shared_knowledge 
            (knowledge_type, content, source, useful, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `, [
            knowledge.type || 'unknown',
            JSON.stringify(knowledge),
            knowledge.source || 'ai_collaboration',
            knowledge.useful !== false ? 1 : 0,
            Date.now()
        ]);
    }

    /**
     * Save anomaly metric to database
     */
    async saveAnomalyMetric(metricName, value) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        await pool.execute(`
            INSERT INTO anomaly_metrics 
            (metric_name, metric_value, timestamp)
            VALUES (?, ?, ?)
        `, [
            metricName,
            value,
            Date.now()
        ]);
    }

    /**
     * Save anomaly detection to database
     */
    async saveAnomaly(anomaly) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        await pool.execute(`
            INSERT INTO anomaly_detections 
            (metric_name, anomaly_type, severity, details, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `, [
            anomaly.metricName,
            anomaly.type,
            anomaly.severity || 'medium',
            JSON.stringify(anomaly),
            Date.now()
        ]);
    }

    /**
     * Save log pattern to database
     */
    async saveLogPattern(pattern) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        await pool.execute(`
            INSERT INTO log_patterns 
            (pattern_key, pattern, source, frequency, last_seen, details)
            VALUES (?, ?, ?, 1, ?, ?)
            ON DUPLICATE KEY UPDATE
            frequency = frequency + 1,
            last_seen = VALUES(last_seen)
        `, [
            pattern.key,
            pattern.pattern,
            pattern.source || 'unknown',
            Date.now(),
            JSON.stringify(pattern)
        ]);
    }

    /**
     * Update log processing stats
     */
    async updateLogStats(statKey, increment = 1) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        await pool.execute(`
            INSERT INTO log_processing_stats 
            (stat_key, stat_value, last_updated)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
            stat_value = stat_value + ?,
            last_updated = VALUES(last_updated)
        `, [
            statKey,
            increment,
            Date.now(),
            increment
        ]);
    }

    /**
     * Get recent AI actions
     */
    async getRecentAIActions(limit = 100) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        const [rows] = await pool.execute(`
            SELECT * FROM ai_actions 
            ORDER BY timestamp DESC 
            LIMIT ?
        `, [limit]);
        
        return rows.map(row => ({
            ...JSON.parse(row.details),
            id: row.id,
            timestamp: row.timestamp
        }));
    }

    /**
     * Get recent decisions
     */
    async getRecentDecisions(limit = 100) {
        if (!this.initialized) await this.initialize();
        
        const pool = this.dbManager.getPool();
        const [rows] = await pool.execute(`
            SELECT * FROM ai_decisions 
            ORDER BY timestamp DESC 
            LIMIT ?
        `, [limit]);
        
        return rows.map(row => ({
            ...JSON.parse(row.decision_data),
            id: row.id,
            timestamp: row.timestamp
        }));
    }
}

module.exports = DatabaseBackedComponents;
