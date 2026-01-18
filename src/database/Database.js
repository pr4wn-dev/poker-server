/**
 * Database - MySQL connection and auto-migration
 * Tables are created automatically on startup if they don't exist
 */

const mysql = require('mysql2/promise');

class Database {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    /**
     * Initialize database connection and create tables
     */
    async initialize() {
        const config = {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        };

        try {
            // First connect without database to create it if needed
            const tempPool = mysql.createPool(config);
            const dbName = process.env.DB_NAME || 'poker_game';
            
            await tempPool.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
            await tempPool.end();

            // Now connect to the actual database
            this.pool = mysql.createPool({
                ...config,
                database: dbName
            });

            // Test connection
            const connection = await this.pool.getConnection();
            console.log('[Database] Connected to MySQL');
            connection.release();

            // Run migrations
            await this.runMigrations();
            
            this.isConnected = true;
            return true;
        } catch (error) {
            console.error('[Database] Connection failed:', error.message);
            console.error('[Database] Make sure MySQL is running (WAMP/XAMPP)');
            return false;
        }
    }

    /**
     * Run all table migrations
     */
    async runMigrations() {
        console.log('[Database] Running migrations...');

        // Users table
        await this.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                chips BIGINT DEFAULT 20000000,
                adventure_coins INT DEFAULT 0,
                xp INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                is_banned BOOLEAN DEFAULT FALSE,
                INDEX idx_username (username),
                INDEX idx_email (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        
        // Add XP column if it doesn't exist (migration for existing DBs)
        try {
            await this.query('ALTER TABLE users ADD COLUMN xp INT DEFAULT 0');
        } catch (e) {
            // Column already exists, ignore
        }
        
        // Migration: Upgrade chips column to BIGINT and set minimum chips to 20 million
        try {
            await this.query('ALTER TABLE users MODIFY COLUMN chips BIGINT DEFAULT 20000000');
            // Update any users with less than 20 million chips to have 20 million
            const result = await this.query('UPDATE users SET chips = 20000000 WHERE chips < 20000000');
            if (result.affectedRows > 0) {
                console.log(`[Database] Updated ${result.affectedRows} users to 20 million starting chips`);
            }
        } catch (e) {
            // Migration already applied or column doesn't exist yet
        }

        // User stats table
        await this.query(`
            CREATE TABLE IF NOT EXISTS user_stats (
                user_id VARCHAR(36) PRIMARY KEY,
                hands_played INT DEFAULT 0,
                hands_won INT DEFAULT 0,
                biggest_pot INT DEFAULT 0,
                royal_flushes INT DEFAULT 0,
                tournaments_won INT DEFAULT 0,
                total_winnings BIGINT DEFAULT 0,
                total_losses BIGINT DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Adventure progress table
        await this.query(`
            CREATE TABLE IF NOT EXISTS adventure_progress (
                user_id VARCHAR(36) PRIMARY KEY,
                current_area VARCHAR(50) DEFAULT 'area_tutorial',
                total_wins INT DEFAULT 0,
                total_losses INT DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        
        // Boss defeat counts (for rare drop tracking)
        await this.query(`
            CREATE TABLE IF NOT EXISTS boss_defeat_counts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                boss_id VARCHAR(50) NOT NULL,
                defeat_count INT DEFAULT 0,
                last_defeated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_boss_count (user_id, boss_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Bosses defeated table
        await this.query(`
            CREATE TABLE IF NOT EXISTS bosses_defeated (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                boss_id VARCHAR(50) NOT NULL,
                defeated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_boss (user_id, boss_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Inventory table
        await this.query(`
            CREATE TABLE IF NOT EXISTS inventory (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                template_id VARCHAR(100) NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                item_type VARCHAR(50) NOT NULL,
                rarity VARCHAR(20) NOT NULL,
                icon VARCHAR(100),
                uses_remaining INT DEFAULT 1,
                max_uses INT DEFAULT 1,
                base_value INT DEFAULT 0,
                obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                obtained_from VARCHAR(100),
                is_tradeable BOOLEAN DEFAULT TRUE,
                is_gambleable BOOLEAN DEFAULT TRUE,
                is_equipped BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_items (user_id),
                INDEX idx_item_type (item_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Friends table
        await this.query(`
            CREATE TABLE IF NOT EXISTS friends (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                friend_id VARCHAR(36) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_friendship (user_id, friend_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Friend requests table
        await this.query(`
            CREATE TABLE IF NOT EXISTS friend_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                from_user_id VARCHAR(36) NOT NULL,
                to_user_id VARCHAR(36) NOT NULL,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_request (from_user_id, to_user_id),
                FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Blocked users table
        await this.query(`
            CREATE TABLE IF NOT EXISTS blocked_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                blocked_id VARCHAR(36) NOT NULL,
                blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_block (user_id, blocked_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Game sessions (for analytics/history)
        await this.query(`
            CREATE TABLE IF NOT EXISTS game_sessions (
                id VARCHAR(36) PRIMARY KEY,
                table_name VARCHAR(100),
                game_type VARCHAR(20) DEFAULT 'multiplayer',
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ended_at TIMESTAMP NULL,
                total_hands INT DEFAULT 0,
                total_pot BIGINT DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Hand history (optional, for replay/analytics)
        await this.query(`
            CREATE TABLE IF NOT EXISTS hand_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_id VARCHAR(36),
                hand_number INT,
                winner_id VARCHAR(36),
                pot_amount INT,
                winning_hand VARCHAR(50),
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE SET NULL,
                INDEX idx_session (session_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        console.log('[Database] Migrations complete - all tables ready');
    }

    /**
     * Execute a query
     */
    async query(sql, params = []) {
        if (!this.pool) {
            throw new Error('Database not initialized');
        }
        const [results] = await this.pool.query(sql, params);
        return results;
    }

    /**
     * Execute a query and return first row
     */
    async queryOne(sql, params = []) {
        const results = await this.query(sql, params);
        return results[0] || null;
    }

    /**
     * Close the connection pool
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            console.log('[Database] Connection closed');
        }
    }
}

// Singleton instance
const database = new Database();

module.exports = database;

