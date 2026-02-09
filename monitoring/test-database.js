#!/usr/bin/env node
/**
 * Database Verification Test
 * Tests MySQL database connectivity and configuration
 */

const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function testDatabase() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        waitForConnections: true,
        connectionLimit: 1
    };

    const dbName = process.env.DB_NAME || 'poker_game';
    
    const result = {
        success: false,
        message: '',
        details: {}
    };

    try {
        // Test 1: Connect to MySQL server (without database)
        result.details.step1_connect = 'Testing MySQL server connection...';
        const tempPool = mysql.createPool(config);
        
        // Test connection
        const connection = await tempPool.getConnection();
        result.details.step1_connect = '✓ MySQL server is running';
        connection.release();
        
        // Test 2: Check if database exists
        result.details.step2_database = 'Checking if database exists...';
        const [databases] = await tempPool.query('SHOW DATABASES LIKE ?', [dbName]);
        
        if (databases.length > 0) {
            result.details.step2_database = `✓ Database '${dbName}' exists`;
        } else {
            result.details.step2_database = `⚠ Database '${dbName}' does not exist (will be created on server start)`;
        }
        
        // Test 3: Connect to the actual database
        result.details.step3_connect_db = 'Connecting to database...';
        const dbPool = mysql.createPool({
            ...config,
            database: dbName
        });
        
        const dbConnection = await dbPool.getConnection();
        result.details.step3_connect_db = `✓ Connected to database '${dbName}'`;
        dbConnection.release();
        
        // Test 4: Test a simple query
        result.details.step4_query = 'Testing database query...';
        const [rows] = await dbPool.query('SELECT 1 as test');
        if (rows && rows.length > 0 && rows[0].test === 1) {
            result.details.step4_query = '✓ Database query successful';
        } else {
            throw new Error('Query test failed');
        }
        
        // Test 5: Check if tables exist
        result.details.step5_tables = 'Checking tables...';
        const [tables] = await dbPool.query('SHOW TABLES');
        const tableCount = tables.length;
        result.details.step5_tables = `✓ Found ${tableCount} table(s)`;
        result.details.tableCount = tableCount;
        
        if (tableCount > 0) {
            const tableNames = tables.map(t => Object.values(t)[0]);
            result.details.tables = tableNames;
        }
        
        await dbPool.end();
        await tempPool.end();
        
        result.success = true;
        result.message = `Database is working - ${tableCount} table(s) found`;
        
    } catch (error) {
        result.success = false;
        result.message = `Database connection failed: ${error.message}`;
        result.error = error.message;
        result.details.error = error.message;
        
        // Provide helpful error messages
        if (error.code === 'ECONNREFUSED') {
            result.details.suggestion = 'MySQL server is not running. Start WAMP/XAMPP MySQL service.';
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            result.details.suggestion = 'Database credentials incorrect. Check DB_USER and DB_PASSWORD in .env file.';
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            result.details.suggestion = `Database '${dbName}' does not exist. Run 'npm run setup' or start the server to create it.`;
        } else {
            result.details.suggestion = 'Check MySQL is running and .env configuration is correct.';
        }
    }
    
    return result;
}

// Run test if called directly
if (require.main === module) {
    testDatabase().then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
    }).catch(error => {
        console.log(JSON.stringify({
            success: false,
            message: `Test failed: ${error.message}`,
            error: error.message
        }, null, 2));
        process.exit(1);
    });
}

module.exports = { testDatabase };
