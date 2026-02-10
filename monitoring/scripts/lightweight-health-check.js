#!/usr/bin/env node
/**
 * Lightweight Health Check
 * 
 * Based on learning system recommendation: "Use lightweight health check endpoints"
 * This script checks system health WITHOUT loading full AIMonitorCore
 */

const path = require('path');
const DatabaseManager = require('../core/DatabaseManager');

const projectRoot = path.resolve(__dirname, '../..');

async function healthCheck(component) {
    const checks = {
        database: false,
        learningSystem: false,
        patterns: false
    };
    
    try {
        // Check database connection (lightweight)
        const dbManager = new DatabaseManager(projectRoot);
        await dbManager.initialize();
        const pool = dbManager.getPool();
        await pool.execute('SELECT 1');
        checks.database = true;
        
        // Check learning patterns exist (lightweight query)
        if (component === 'learning' || component === 'all') {
            const [patterns] = await pool.execute(`
                SELECT COUNT(*) as count FROM learning_patterns 
                WHERE pattern_key IN ('memory_heap_overflow', 'null_reference_state', 'verification_memory_overflow')
            `);
            checks.learningSystem = patterns[0].count >= 3;
            checks.patterns = patterns[0].count >= 3;
        }
        
        await dbManager.pool.end();
        
        return {
            success: true,
            checks: checks,
            message: 'Health check passed'
        };
    } catch (error) {
        return {
            success: false,
            checks: checks,
            error: error.message,
            message: 'Health check failed'
        };
    }
}

async function main() {
    const component = process.argv[2] || 'all';
    const result = await healthCheck(component);
    console.log(JSON.stringify(result));
    process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
    main().catch(error => {
        console.log(JSON.stringify({
            success: false,
            error: error.message,
            message: 'Health check failed'
        }));
        process.exit(1);
    });
}

module.exports = { healthCheck };
