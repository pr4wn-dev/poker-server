/**
 * Setup Script - Run this once to initialize the database
 * Usage: npm run setup
 */

require('dotenv').config();
const db = require('./database/Database');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

async function setup() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║              POKER SERVER - SETUP WIZARD                     ║
╠══════════════════════════════════════════════════════════════╣
║  This script will initialize your database and tables.       ║
║  Make sure MySQL is running (WAMP/XAMPP).                    ║
╚══════════════════════════════════════════════════════════════╝
    `);

    // Check environment
    console.log('Configuration:');
    console.log(`  Database Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`  Database Port: ${process.env.DB_PORT || '3306'}`);
    console.log(`  Database Name: ${process.env.DB_NAME || 'poker_game'}`);
    console.log(`  Database User: ${process.env.DB_USER || 'root'}`);
    console.log('');

    const proceed = await ask('Proceed with setup? (y/n): ');
    if (proceed.toLowerCase() !== 'y') {
        console.log('Setup cancelled.');
        rl.close();
        process.exit(0);
    }

    console.log('');
    console.log('Connecting to MySQL...');

    const success = await db.initialize();

    if (success) {
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║              SETUP COMPLETE - READY TO PLAY!                 ║');
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log('║  All database tables have been created.                      ║');
        console.log('║                                                              ║');
        console.log('║  Start the server with:  npm start                           ║');
        console.log('║  Or for development:     npm run dev                         ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
    } else {
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║                    SETUP FAILED                              ║');
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log('║  Could not connect to MySQL. Please check:                   ║');
        console.log('║  1. MySQL is running (start WAMP/XAMPP)                      ║');
        console.log('║  2. Database credentials in .env file                        ║');
        console.log('║  3. MySQL port is correct (default: 3306)                    ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
    }

    await db.close();
    rl.close();
    process.exit(success ? 0 : 1);
}

setup().catch(err => {
    console.error('Setup error:', err);
    rl.close();
    process.exit(1);
});






