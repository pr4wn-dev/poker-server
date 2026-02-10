#!/usr/bin/env node
const DatabaseManager = require('../core/DatabaseManager');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');

(async () => {
    const dm = new DatabaseManager(projectRoot);
    await dm.initialize();
    const pool = dm.getPool();
    
    const [rows] = await pool.execute(`
        SELECT pattern_key, issue_type, solution_method, frequency, success_rate, last_updated 
        FROM learning_patterns 
        WHERE issue_type LIKE '%http%' OR solution_method LIKE '%http%' 
        ORDER BY last_updated DESC 
        LIMIT 5
    `);
    
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
})();
