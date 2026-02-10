#!/usr/bin/env node
/**
 * Query Learning Patterns from Database
 * 
 * Safe way to query learning patterns without string escaping issues
 * Use this instead of node -e with complex SQL queries
 */

const DatabaseManager = require('../core/DatabaseManager');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');

// Get search term from command line args
const searchTerm = process.argv[2] || '';

(async () => {
    const dm = new DatabaseManager(projectRoot);
    await dm.initialize();
    const pool = dm.getPool();
    
    let query;
    let params;
    
    if (searchTerm) {
        // Search for patterns matching the term
        query = `
            SELECT pattern_key, issue_type, solution_method, frequency, success_rate, last_updated 
            FROM learning_patterns 
            WHERE issue_type LIKE ? OR solution_method LIKE ?
            ORDER BY last_updated DESC 
            LIMIT 20
        `;
        const searchPattern = `%${searchTerm}%`;
        params = [searchPattern, searchPattern];
    } else {
        // Get all recent patterns
        query = `
            SELECT pattern_key, issue_type, solution_method, frequency, success_rate, last_updated 
            FROM learning_patterns 
            ORDER BY last_updated DESC 
            LIMIT 20
        `;
        params = [];
    }
    
    const [rows] = await pool.execute(query, params);
    
    console.log(JSON.stringify({
        searchTerm: searchTerm || 'all',
        count: rows.length,
        patterns: rows
    }, null, 2));
    
    process.exit(0);
})().catch(error => {
    console.error(JSON.stringify({
        error: error.message,
        stack: error.stack
    }, null, 2));
    process.exit(1);
});
