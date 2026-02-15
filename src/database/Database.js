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
            const gameLogger = require('../utils/GameLogger');
            gameLogger.gameEvent('DATABASE', '[CONNECTION] CONNECTED', {});
            connection.release();

            // Run migrations
            await this.runMigrations();
            
            this.isConnected = true;
            return true;
        } catch (error) {
            const gameLogger = require('../utils/GameLogger');
            gameLogger.error('DATABASE', '[CONNECTION] FAILED', { error: error.message, stack: error.stack, message: 'Make sure MySQL is running (WAMP/XAMPP)' });
            return false;
        }
    }

    /**
     * Run all table migrations
     */
    async runMigrations() {
        const gameLogger = require('../utils/GameLogger');
        gameLogger.gameEvent('DATABASE', '[MIGRATIONS] STARTING', {});

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
        
        // Add active_character column for collectible character system
        try {
            await this.query("ALTER TABLE users ADD COLUMN active_character VARCHAR(100) DEFAULT 'the_kid'");
        } catch (e) {
            // Column already exists, ignore
        }
        
        // Add has_seen_intro column for opening cinematic
        try {
            await this.query("ALTER TABLE users ADD COLUMN has_seen_intro BOOLEAN DEFAULT FALSE");
        } catch (e) {
            // Column already exists, ignore
        }
        
        // Add karma column (legacy — being replaced by heat)
        try {
            await this.query("ALTER TABLE users ADD COLUMN karma INT DEFAULT 100");
        } catch (e) {
            // Column already exists, ignore
        }
        
        // Add heat column (Combat System — replaces karma)
        try {
            await this.query("ALTER TABLE users ADD COLUMN heat FLOAT DEFAULT 0");
        } catch (e) {}
        try {
            await this.query("ALTER TABLE users ADD COLUMN combat_wins INT DEFAULT 0");
        } catch (e) {}
        try {
            await this.query("ALTER TABLE users ADD COLUMN combat_losses INT DEFAULT 0");
        } catch (e) {}
        try {
            await this.query("ALTER TABLE users ADD COLUMN last_combat_at TIMESTAMP NULL");
        } catch (e) {}
        try {
            await this.query("ALTER TABLE users ADD COLUMN bruised_until TIMESTAMP NULL");
        } catch (e) {}
        try {
            await this.query("ALTER TABLE users ADD COLUMN coward_until TIMESTAMP NULL");
        } catch (e) {}
        
        // Add daily reward columns
        try {
            await this.query("ALTER TABLE users ADD COLUMN daily_streak INT DEFAULT 0");
        } catch (e) {}
        try {
            await this.query("ALTER TABLE users ADD COLUMN last_daily_reward TIMESTAMP NULL");
        } catch (e) {}
        
        // Add gems column
        try {
            await this.query("ALTER TABLE users ADD COLUMN gems INT DEFAULT 0");
        } catch (e) {}

        // Migration: Upgrade chips column to BIGINT and set minimum chips to 20 million
        try {
            await this.query('ALTER TABLE users MODIFY COLUMN chips BIGINT DEFAULT 20000000');
            // Update any users with less than 20 million chips to have 20 million
            const result = await this.query('UPDATE users SET chips = 20000000 WHERE chips < 20000000');
            if (result.affectedRows > 0) {
                gameLogger.gameEvent('DATABASE', '[MIGRATIONS] USERS_UPDATED', { affectedRows: result.affectedRows });
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

        // Add level/xp columns to user_stats (used by leaderboards)
        try {
            await this.query("ALTER TABLE user_stats ADD COLUMN level INT DEFAULT 1");
        } catch (e) {}
        try {
            await this.query("ALTER TABLE user_stats ADD COLUMN xp INT DEFAULT 0");
        } catch (e) {}

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
        
        // Add highest_level to adventure_progress
        try {
            await this.query("ALTER TABLE adventure_progress ADD COLUMN highest_level INT DEFAULT 1");
        } catch (e) {}

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

        // Add new columns for Power Score system (if they don't exist)
        try {
            await this.query(`
                ALTER TABLE inventory 
                ADD COLUMN IF NOT EXISTS power_score INT DEFAULT 0,
                ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'unknown',
                ADD COLUMN IF NOT EXISTS drop_rate DECIMAL(5,4) DEFAULT 0.5000,
                ADD COLUMN IF NOT EXISTS demand DECIMAL(5,2) DEFAULT 1.00
            `);
        } catch (err) {
            // MySQL doesn't support IF NOT EXISTS in ALTER TABLE
            // Try adding columns one by one
            const columns = [
                { name: 'power_score', def: 'INT DEFAULT 0' },
                { name: 'source', def: 'VARCHAR(50) DEFAULT \'unknown\'' },
                { name: 'drop_rate', def: 'DECIMAL(5,4) DEFAULT 0.5000' },
                { name: 'demand', def: 'DECIMAL(5,2) DEFAULT 1.00' }
            ];
            
            for (const col of columns) {
                try {
                    await this.query(`ALTER TABLE inventory ADD COLUMN ${col.name} ${col.def}`);
                } catch (e) {
                    // Column already exists, skip
                    if (!e.message.includes('Duplicate column name')) {
                        console.error(`Error adding column ${col.name}:`, e.message);
                    }
                }
            }
        }
        
        // Add combat bonus columns to inventory (for weapons/armor/gear)
        const combatCols = [
            { name: 'combat_atk', def: 'INT DEFAULT 0' },
            { name: 'combat_def', def: 'INT DEFAULT 0' },
            { name: 'combat_spd', def: 'INT DEFAULT 0' },
            { name: 'equipment_slot', def: "VARCHAR(20) DEFAULT NULL" }
        ];
        for (const col of combatCols) {
            try {
                await this.query(`ALTER TABLE inventory ADD COLUMN ${col.name} ${col.def}`);
            } catch (e) { /* already exists */ }
        }

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

        // Hand history — full hand data for stats, replays, analytics
        // DROP the old minimal hand_history if it exists and recreate with full schema
        // Check if old schema exists (has session_id but not table_id)
        try {
            const [columns] = await this.pool.query(`SHOW COLUMNS FROM hand_history LIKE 'table_id'`);
            if (columns.length === 0) {
                // Old schema — drop and recreate
                await this.query('DROP TABLE IF EXISTS hand_history');
                gameLogger.gameEvent('DATABASE', '[MIGRATIONS] Dropped old hand_history table for schema upgrade', {});
            }
        } catch (e) {
            // Table doesn't exist yet, that's fine
        }

        await this.query(`
            CREATE TABLE IF NOT EXISTS hand_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                table_id VARCHAR(36) NOT NULL,
                table_name VARCHAR(100),
                hand_number INT NOT NULL,
                player_id VARCHAR(36) NOT NULL,
                player_name VARCHAR(50),
                seat_index INT,
                hole_cards JSON,
                community_cards JSON,
                actions_taken JSON,
                final_hand_rank INT DEFAULT 0,
                final_hand_name VARCHAR(50),
                pot_size BIGINT DEFAULT 0,
                chips_won_lost BIGINT DEFAULT 0,
                was_winner BOOLEAN DEFAULT FALSE,
                went_to_showdown BOOLEAN DEFAULT FALSE,
                phase_reached VARCHAR(20) DEFAULT 'preflop',
                starting_hand_category VARCHAR(20),
                is_voluntary BOOLEAN DEFAULT FALSE,
                did_raise_preflop BOOLEAN DEFAULT FALSE,
                did_cbet BOOLEAN DEFAULT FALSE,
                cbet_success BOOLEAN DEFAULT FALSE,
                was_steal_attempt BOOLEAN DEFAULT FALSE,
                steal_success BOOLEAN DEFAULT FALSE,
                was_bluff BOOLEAN DEFAULT FALSE,
                bluff_success BOOLEAN DEFAULT FALSE,
                opponent_was_bluffing BOOLEAN DEFAULT FALSE,
                called_bluff_correctly BOOLEAN DEFAULT FALSE,
                had_draw_on_flop BOOLEAN DEFAULT FALSE,
                draw_completed BOOLEAN DEFAULT FALSE,
                was_behind_on_flop BOOLEAN DEFAULT FALSE,
                won_from_behind BOOLEAN DEFAULT FALSE,
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_player (player_id),
                INDEX idx_table (table_id),
                INDEX idx_played_at (played_at),
                INDEX idx_player_hand (player_id, final_hand_rank),
                INDEX idx_player_pocket (player_id, starting_hand_category)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Player stats — aggregated lifetime stats (cached, recomputable from hand_history)
        await this.query(`
            CREATE TABLE IF NOT EXISTS player_stats (
                player_id VARCHAR(36) PRIMARY KEY,
                hands_played INT DEFAULT 0,
                hands_won INT DEFAULT 0,
                total_chips_won BIGINT DEFAULT 0,
                total_chips_lost BIGINT DEFAULT 0,
                biggest_pot_won BIGINT DEFAULT 0,
                biggest_pot_lost BIGINT DEFAULT 0,
                best_session_profit BIGINT DEFAULT 0,
                worst_session_loss BIGINT DEFAULT 0,
                current_win_streak INT DEFAULT 0,
                current_lose_streak INT DEFAULT 0,
                longest_win_streak INT DEFAULT 0,
                longest_lose_streak INT DEFAULT 0,
                sessions_played INT DEFAULT 0,
                total_play_time_seconds INT DEFAULT 0,
                vpip_hands INT DEFAULT 0,
                pfr_hands INT DEFAULT 0,
                total_bets INT DEFAULT 0,
                total_raises INT DEFAULT 0,
                total_calls INT DEFAULT 0,
                total_folds INT DEFAULT 0,
                showdown_hands INT DEFAULT 0,
                showdown_wins INT DEFAULT 0,
                cbet_attempts INT DEFAULT 0,
                cbet_successes INT DEFAULT 0,
                steal_attempts INT DEFAULT 0,
                steal_successes INT DEFAULT 0,
                bluff_attempts INT DEFAULT 0,
                bluff_successes INT DEFAULT 0,
                bluff_detection_opportunities INT DEFAULT 0,
                bluff_detections INT DEFAULT 0,
                fold_to_bet_count INT DEFAULT 0,
                fold_to_bet_opportunities INT DEFAULT 0,
                river_draw_attempts INT DEFAULT 0,
                river_draw_hits INT DEFAULT 0,
                turn_draw_attempts INT DEFAULT 0,
                turn_draw_hits INT DEFAULT 0,
                flop_connect_hands INT DEFAULT 0,
                flop_total_hands INT DEFAULT 0,
                suckout_opportunities INT DEFAULT 0,
                suckout_wins INT DEFAULT 0,
                bad_beat_opportunities INT DEFAULT 0,
                bad_beat_losses INT DEFAULT 0,
                premium_hands_dealt INT DEFAULT 0,
                total_hands_dealt INT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Player hand type stats — per player per hand type (high_card through royal_flush)
        await this.query(`
            CREATE TABLE IF NOT EXISTS player_hand_type_stats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                player_id VARCHAR(36) NOT NULL,
                hand_type INT NOT NULL,
                hand_type_name VARCHAR(30) NOT NULL,
                times_made INT DEFAULT 0,
                times_won INT DEFAULT 0,
                times_lost INT DEFAULT 0,
                total_chips_won BIGINT DEFAULT 0,
                total_chips_lost BIGINT DEFAULT 0,
                last_hit_at TIMESTAMP NULL,
                UNIQUE KEY unique_player_hand_type (player_id, hand_type),
                FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_player_type (player_id, hand_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Player pocket stats — per player per starting hand combo
        await this.query(`
            CREATE TABLE IF NOT EXISTS player_pocket_stats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                player_id VARCHAR(36) NOT NULL,
                pocket_category VARCHAR(20) NOT NULL,
                times_dealt INT DEFAULT 0,
                times_played INT DEFAULT 0,
                times_won INT DEFAULT 0,
                times_folded INT DEFAULT 0,
                total_chips_won BIGINT DEFAULT 0,
                total_chips_lost BIGINT DEFAULT 0,
                UNIQUE KEY unique_player_pocket (player_id, pocket_category),
                FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_player_pocket (player_id, pocket_category)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Player sessions — track each play session
        await this.query(`
            CREATE TABLE IF NOT EXISTS player_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_id VARCHAR(36) NOT NULL,
                player_id VARCHAR(36) NOT NULL,
                table_id VARCHAR(36),
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP NULL,
                hands_played INT DEFAULT 0,
                chips_start BIGINT DEFAULT 0,
                chips_end BIGINT DEFAULT 0,
                profit_loss BIGINT DEFAULT 0,
                FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_player_sessions (player_id),
                INDEX idx_session (session_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Fire events — log when players go on fire
        await this.query(`
            CREATE TABLE IF NOT EXISTS fire_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                player_id VARCHAR(36) NOT NULL,
                table_id VARCHAR(36) NOT NULL,
                fire_level INT NOT NULL DEFAULT 1,
                hands_in_streak INT DEFAULT 0,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_player_fire (player_id),
                INDEX idx_table_fire (table_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Player titles — earned dynamic titles
        await this.query(`
            CREATE TABLE IF NOT EXISTS player_titles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                player_id VARCHAR(36) NOT NULL,
                title_id VARCHAR(50) NOT NULL,
                title_name VARCHAR(100) NOT NULL,
                title_category VARCHAR(30) NOT NULL,
                earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT FALSE,
                UNIQUE KEY unique_player_title (player_id, title_id),
                FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_player_titles (player_id),
                INDEX idx_active_title (player_id, is_active)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Achievements
        await this.query(`
            CREATE TABLE IF NOT EXISTS achievements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                player_id VARCHAR(36) NOT NULL,
                achievement_id VARCHAR(50) NOT NULL,
                achievement_name VARCHAR(100) NOT NULL,
                progress INT DEFAULT 0,
                target INT DEFAULT 1,
                completed_at TIMESTAMP NULL,
                reward_claimed BOOLEAN DEFAULT FALSE,
                UNIQUE KEY unique_player_achievement (player_id, achievement_id),
                FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_player_achievements (player_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // User achievements (unlocked achievements per player)
        await this.query(`
            CREATE TABLE IF NOT EXISTS user_achievements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                achievement_id VARCHAR(50) NOT NULL,
                unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_achievement (user_id, achievement_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_achievements (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Crews
        await this.query(`
            CREATE TABLE IF NOT EXISTS crews (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                tag VARCHAR(5) UNIQUE NOT NULL,
                description TEXT,
                emblem_color VARCHAR(7) DEFAULT '#00ffff',
                created_by VARCHAR(36) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                crew_level INT DEFAULT 1,
                crew_xp INT DEFAULT 0,
                max_members INT DEFAULT 20,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_crew_name (name),
                INDEX idx_crew_tag (tag)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Crew members
        await this.query(`
            CREATE TABLE IF NOT EXISTS crew_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                crew_id VARCHAR(36) NOT NULL,
                player_id VARCHAR(36) NOT NULL,
                role ENUM('leader', 'officer', 'member') DEFAULT 'member',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_crew_member (crew_id, player_id),
                UNIQUE KEY unique_player_crew (player_id),
                FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE CASCADE,
                FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_crew (crew_id),
                INDEX idx_player (player_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Crew stats
        await this.query(`
            CREATE TABLE IF NOT EXISTS crew_stats (
                crew_id VARCHAR(36) PRIMARY KEY,
                total_hands_played INT DEFAULT 0,
                total_hands_won INT DEFAULT 0,
                total_chips_won BIGINT DEFAULT 0,
                tournaments_won INT DEFAULT 0,
                robberies_successful INT DEFAULT 0,
                crew_wars_won INT DEFAULT 0,
                crew_wars_lost INT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Robbery log
        await this.query(`
            CREATE TABLE IF NOT EXISTS robbery_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                robber_id VARCHAR(36) NOT NULL,
                victim_id VARCHAR(36) NOT NULL,
                item_id VARCHAR(36),
                item_name VARCHAR(100),
                tool_used VARCHAR(50),
                success BOOLEAN DEFAULT FALSE,
                chip_penalty BIGINT DEFAULT 0,
                recovered BOOLEAN DEFAULT FALSE,
                recovered_at TIMESTAMP NULL,
                cooldown_until TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (robber_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (victim_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_robber (robber_id),
                INDEX idx_victim (victim_id),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Combat log — tracks all PvP combat encounters
        await this.query(`
            CREATE TABLE IF NOT EXISTS combat_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                challenger_id VARCHAR(36) NOT NULL,
                target_id VARCHAR(36) NOT NULL,
                winner_id VARCHAR(36),
                challenger_item_id VARCHAR(50),
                target_item_id VARCHAR(50),
                chips_transferred BIGINT DEFAULT 0,
                challenger_combat_score FLOAT,
                target_combat_score FLOAT,
                target_action ENUM('fight', 'flee', 'disconnect', 'timeout') NOT NULL,
                is_mutual BOOLEAN DEFAULT FALSE,
                source ENUM('in_game', 'friend', 'recent', 'leaderboard') NOT NULL DEFAULT 'in_game',
                table_id VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (challenger_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_challenger (challenger_id),
                INDEX idx_target (target_id),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Recent opponents — tracks who you've played poker with (for outside-game challenges)
        await this.query(`
            CREATE TABLE IF NOT EXISTS recent_opponents (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                opponent_id VARCHAR(36) NOT NULL,
                table_id VARCHAR(50),
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (opponent_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user (user_id),
                INDEX idx_played (played_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Notoriety history — tracks combat reputation changes over time
        await this.query(`
            CREATE TABLE IF NOT EXISTS heat_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                heat_before FLOAT NOT NULL,
                heat_after FLOAT NOT NULL,
                change_amount FLOAT NOT NULL,
                reason VARCHAR(100) NOT NULL,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_heat (user_id),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Events — seasonal/weekly game events
        await this.query(`
            CREATE TABLE IF NOT EXISTS events (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                event_type VARCHAR(30) NOT NULL,
                multipliers JSON,
                rewards JSON,
                start_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                end_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_active (is_active, start_date, end_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Daily rewards
        await this.query(`
            CREATE TABLE IF NOT EXISTS daily_rewards (
                player_id VARCHAR(36) PRIMARY KEY,
                last_claim_date DATE NULL,
                current_streak INT DEFAULT 0,
                total_claims INT DEFAULT 0,
                FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Spectator bets
        await this.query(`
            CREATE TABLE IF NOT EXISTS spectator_bets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                spectator_id VARCHAR(36) NOT NULL,
                table_id VARCHAR(36) NOT NULL,
                hand_number INT NOT NULL,
                bet_on_player_id VARCHAR(36) NOT NULL,
                amount BIGINT DEFAULT 0,
                result ENUM('pending', 'won', 'lost') DEFAULT 'pending',
                payout BIGINT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (spectator_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_spectator (spectator_id),
                INDEX idx_table_hand (table_id, hand_number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Saved hands — for replay system
        await this.query(`
            CREATE TABLE IF NOT EXISTS saved_hands (
                id INT AUTO_INCREMENT PRIMARY KEY,
                player_id VARCHAR(36) NOT NULL,
                hand_history_id INT NOT NULL,
                is_highlight BOOLEAN DEFAULT FALSE,
                label VARCHAR(100),
                saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_player_hand (player_id, hand_history_id),
                FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_player_saved (player_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Collusion flags — anti-cheat tracking
        await this.query(`
            CREATE TABLE IF NOT EXISTS collusion_flags (
                id INT AUTO_INCREMENT PRIMARY KEY,
                player1_id VARCHAR(36) NOT NULL,
                player2_id VARCHAR(36) NOT NULL,
                flag_type VARCHAR(30) NOT NULL,
                evidence JSON,
                severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'low',
                reviewed BOOLEAN DEFAULT FALSE,
                action_taken VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_players (player1_id, player2_id),
                INDEX idx_unreviewed (reviewed, severity)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        gameLogger.gameEvent('DATABASE', '[MIGRATIONS] COMPLETE', {});
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
            const gameLogger = require('../utils/GameLogger');
            gameLogger.gameEvent('DATABASE', '[CONNECTION] CLOSED', {});
        }
    }
}

// Singleton instance
const database = new Database();

module.exports = database;

