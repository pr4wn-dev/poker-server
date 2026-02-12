/**
 * CrewManager - Handles crew/gang system
 * 
 * Players form crews with roles (leader/officer/member).
 * Crew tags display at tables. Crews have stats, levels, and perks.
 */

const { v4: uuidv4 } = require('uuid');
const database = require('../database/Database');
const gameLogger = require('../utils/GameLogger');

// Crew perks unlocked at each level
const CREW_PERKS = {
    2: { name: 'Tag Color', description: 'Customize crew tag color' },
    5: { name: 'XP Bonus', description: '+5% XP bonus for all members', xpBonus: 0.05 },
    10: { name: 'Crew Emblem', description: 'Crew emblem displayed at tables' },
    15: { name: 'Drop Rate Bonus', description: '+10% item drop rate', dropRateBonus: 0.10 },
    20: { name: 'Private Tables', description: 'Create crew-only tables' },
    25: { name: 'Robbery Bonus', description: '+10% robbery success with crew backup', robberyBonus: 0.10 }
};

// XP required per crew level
const XP_PER_LEVEL = 1000;

class CrewManager {
    /**
     * Create a new crew
     */
    static async createCrew(creatorId, name, tag, description, emblemColor) {
        if (!name || name.length < 3 || name.length > 50) {
            return { success: false, error: 'Crew name must be 3-50 characters' };
        }
        if (!tag || tag.length < 2 || tag.length > 5) {
            return { success: false, error: 'Crew tag must be 2-5 characters' };
        }

        // Check if player is already in a crew
        const existing = await database.queryOne(
            'SELECT crew_id FROM crew_members WHERE player_id = ?', [creatorId]
        );
        if (existing) {
            return { success: false, error: 'You are already in a crew. Leave your current crew first.' };
        }

        // Check if name or tag is taken
        const nameTaken = await database.queryOne('SELECT id FROM crews WHERE name = ?', [name]);
        if (nameTaken) return { success: false, error: 'Crew name is already taken' };

        const tagTaken = await database.queryOne('SELECT id FROM crews WHERE tag = ?', [tag.toUpperCase()]);
        if (tagTaken) return { success: false, error: 'Crew tag is already taken' };

        const crewId = uuidv4();
        const upperTag = tag.toUpperCase();

        await database.query(`
            INSERT INTO crews (id, name, tag, description, emblem_color, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [crewId, name, upperTag, description || '', emblemColor || '#00ffff', creatorId]);

        // Add creator as leader
        await database.query(`
            INSERT INTO crew_members (crew_id, player_id, role)
            VALUES (?, ?, 'leader')
        `, [crewId, creatorId]);

        // Initialize crew stats
        await database.query(`
            INSERT INTO crew_stats (crew_id) VALUES (?)
        `, [crewId]);

        gameLogger.gameEvent('CREW', 'Crew created', { crewId, name, tag: upperTag, creatorId });

        return { success: true, crewId, name, tag: upperTag };
    }

    /**
     * Get crew info with members
     */
    static async getCrew(crewId) {
        const crew = await database.queryOne('SELECT * FROM crews WHERE id = ?', [crewId]);
        if (!crew) return { success: false, error: 'Crew not found' };

        const members = await database.query(`
            SELECT cm.*, u.username, u.xp 
            FROM crew_members cm 
            JOIN users u ON cm.player_id = u.id 
            WHERE cm.crew_id = ? 
            ORDER BY FIELD(cm.role, 'leader', 'officer', 'member'), cm.joined_at ASC
        `, [crewId]);

        const stats = await database.queryOne(
            'SELECT * FROM crew_stats WHERE crew_id = ?', [crewId]
        );

        // Calculate crew level
        const crewLevel = Math.floor((crew.crew_xp || 0) / XP_PER_LEVEL) + 1;
        
        // Get active perks
        const activePerks = Object.entries(CREW_PERKS)
            .filter(([level]) => crewLevel >= parseInt(level))
            .map(([level, perk]) => ({ level: parseInt(level), ...perk }));

        return {
            success: true,
            crew: {
                ...crew,
                level: crewLevel,
                xpToNextLevel: XP_PER_LEVEL - ((crew.crew_xp || 0) % XP_PER_LEVEL),
                memberCount: members.length,
                members: members.map(m => ({
                    playerId: m.player_id,
                    username: m.username,
                    role: m.role,
                    xp: m.xp,
                    joinedAt: m.joined_at
                })),
                stats: stats || {},
                activePerks
            }
        };
    }

    /**
     * Get a player's crew
     */
    static async getPlayerCrew(playerId) {
        const membership = await database.queryOne(
            'SELECT crew_id FROM crew_members WHERE player_id = ?', [playerId]
        );
        if (!membership) return { success: true, crew: null };
        return CrewManager.getCrew(membership.crew_id);
    }

    /**
     * Invite a player to a crew (officer+ only)
     */
    static async inviteToCrew(inviterId, targetPlayerId) {
        const membership = await database.queryOne(
            'SELECT cm.crew_id, cm.role, c.name, c.tag FROM crew_members cm JOIN crews c ON cm.crew_id = c.id WHERE cm.player_id = ?',
            [inviterId]
        );
        if (!membership) return { success: false, error: 'You are not in a crew' };
        if (membership.role === 'member') return { success: false, error: 'Only officers and leaders can invite' };

        // Check if target is already in a crew
        const targetMembership = await database.queryOne(
            'SELECT crew_id FROM crew_members WHERE player_id = ?', [targetPlayerId]
        );
        if (targetMembership) return { success: false, error: 'That player is already in a crew' };

        // Check member count
        const crew = await database.queryOne('SELECT max_members FROM crews WHERE id = ?', [membership.crew_id]);
        const memberCount = await database.queryOne(
            'SELECT COUNT(*) as cnt FROM crew_members WHERE crew_id = ?', [membership.crew_id]
        );
        if (memberCount.cnt >= (crew?.max_members || 20)) {
            return { success: false, error: 'Crew is full' };
        }

        return {
            success: true,
            crewId: membership.crew_id,
            crewName: membership.name,
            crewTag: membership.tag
        };
    }

    /**
     * Join a crew (after being invited)
     */
    static async joinCrew(playerId, crewId) {
        // Check if already in a crew
        const existing = await database.queryOne(
            'SELECT crew_id FROM crew_members WHERE player_id = ?', [playerId]
        );
        if (existing) return { success: false, error: 'You are already in a crew' };

        // Check crew exists and isn't full
        const crew = await database.queryOne('SELECT * FROM crews WHERE id = ?', [crewId]);
        if (!crew) return { success: false, error: 'Crew not found' };

        const memberCount = await database.queryOne(
            'SELECT COUNT(*) as cnt FROM crew_members WHERE crew_id = ?', [crewId]
        );
        if (memberCount.cnt >= (crew.max_members || 20)) {
            return { success: false, error: 'Crew is full' };
        }

        await database.query(`
            INSERT INTO crew_members (crew_id, player_id, role)
            VALUES (?, ?, 'member')
        `, [crewId, playerId]);

        gameLogger.gameEvent('CREW', 'Player joined crew', { crewId, playerId, crewName: crew.name });

        return { success: true, crewId, crewName: crew.name, crewTag: crew.tag };
    }

    /**
     * Leave a crew
     */
    static async leaveCrew(playerId) {
        const membership = await database.queryOne(
            'SELECT cm.*, c.name FROM crew_members cm JOIN crews c ON cm.crew_id = c.id WHERE cm.player_id = ?',
            [playerId]
        );
        if (!membership) return { success: false, error: 'You are not in a crew' };

        if (membership.role === 'leader') {
            // Leader leaving — disband or transfer
            const memberCount = await database.queryOne(
                'SELECT COUNT(*) as cnt FROM crew_members WHERE crew_id = ?', [membership.crew_id]
            );
            if (memberCount.cnt > 1) {
                // Transfer leadership to next officer or longest member
                const nextLeader = await database.queryOne(`
                    SELECT player_id FROM crew_members 
                    WHERE crew_id = ? AND player_id != ?
                    ORDER BY FIELD(role, 'officer', 'member'), joined_at ASC
                    LIMIT 1
                `, [membership.crew_id, playerId]);
                
                if (nextLeader) {
                    await database.query(
                        'UPDATE crew_members SET role = ? WHERE crew_id = ? AND player_id = ?',
                        ['leader', membership.crew_id, nextLeader.player_id]
                    );
                }
            } else {
                // Last member — disband
                await database.query('DELETE FROM crew_stats WHERE crew_id = ?', [membership.crew_id]);
                await database.query('DELETE FROM crew_members WHERE crew_id = ?', [membership.crew_id]);
                await database.query('DELETE FROM crews WHERE id = ?', [membership.crew_id]);
                gameLogger.gameEvent('CREW', 'Crew disbanded', { crewId: membership.crew_id, crewName: membership.name });
                return { success: true, disbanded: true };
            }
        }

        await database.query(
            'DELETE FROM crew_members WHERE player_id = ?', [playerId]
        );

        gameLogger.gameEvent('CREW', 'Player left crew', { crewId: membership.crew_id, playerId });
        return { success: true };
    }

    /**
     * Promote or demote a crew member (leader only)
     */
    static async promoteMember(leaderId, targetPlayerId, newRole) {
        const leaderMembership = await database.queryOne(
            'SELECT crew_id, role FROM crew_members WHERE player_id = ?', [leaderId]
        );
        if (!leaderMembership || leaderMembership.role !== 'leader') {
            return { success: false, error: 'Only the crew leader can change roles' };
        }

        if (!['officer', 'member'].includes(newRole)) {
            return { success: false, error: 'Invalid role. Must be officer or member.' };
        }

        // Check officer cap (max 3)
        if (newRole === 'officer') {
            const officerCount = await database.queryOne(
                'SELECT COUNT(*) as cnt FROM crew_members WHERE crew_id = ? AND role = ?',
                [leaderMembership.crew_id, 'officer']
            );
            if (officerCount.cnt >= 3) {
                return { success: false, error: 'Maximum 3 officers allowed' };
            }
        }

        await database.query(
            'UPDATE crew_members SET role = ? WHERE crew_id = ? AND player_id = ?',
            [newRole, leaderMembership.crew_id, targetPlayerId]
        );

        return { success: true, newRole };
    }

    /**
     * Kick a member (leader/officer)
     */
    static async kickMember(kickerId, targetPlayerId) {
        const kickerMembership = await database.queryOne(
            'SELECT crew_id, role FROM crew_members WHERE player_id = ?', [kickerId]
        );
        if (!kickerMembership || kickerMembership.role === 'member') {
            return { success: false, error: 'Only officers and leaders can kick members' };
        }

        const targetMembership = await database.queryOne(
            'SELECT role FROM crew_members WHERE crew_id = ? AND player_id = ?',
            [kickerMembership.crew_id, targetPlayerId]
        );
        if (!targetMembership) return { success: false, error: 'Player is not in your crew' };

        // Officers can't kick other officers or the leader
        if (kickerMembership.role === 'officer' && targetMembership.role !== 'member') {
            return { success: false, error: 'Officers can only kick regular members' };
        }

        await database.query(
            'DELETE FROM crew_members WHERE crew_id = ? AND player_id = ?',
            [kickerMembership.crew_id, targetPlayerId]
        );

        gameLogger.gameEvent('CREW', 'Player kicked from crew', {
            crewId: kickerMembership.crew_id, kickerId, targetPlayerId
        });

        return { success: true };
    }

    /**
     * Add XP to a crew (called when members earn XP)
     */
    static async addCrewXP(playerId, xpAmount) {
        const membership = await database.queryOne(
            'SELECT crew_id FROM crew_members WHERE player_id = ?', [playerId]
        );
        if (!membership) return;

        await database.query(
            'UPDATE crews SET crew_xp = crew_xp + ? WHERE id = ?',
            [xpAmount, membership.crew_id]
        );
    }

    /**
     * Update crew stats after a hand
     */
    static async updateCrewStats(playerId, handsPlayed, handsWon, chipsWon) {
        const membership = await database.queryOne(
            'SELECT crew_id FROM crew_members WHERE player_id = ?', [playerId]
        );
        if (!membership) return;

        await database.query(`
            UPDATE crew_stats SET
                total_hands_played = total_hands_played + ?,
                total_hands_won = total_hands_won + ?,
                total_chips_won = total_chips_won + ?
            WHERE crew_id = ?
        `, [handsPlayed, handsWon, chipsWon > 0 ? chipsWon : 0, membership.crew_id]);
    }

    /**
     * Get crew leaderboard
     */
    static async getCrewLeaderboard(limit = 20) {
        const rows = await database.query(`
            SELECT c.*, cs.total_hands_played, cs.total_hands_won, cs.total_chips_won,
                   cs.tournaments_won, cs.crew_wars_won, cs.crew_wars_lost,
                   (SELECT COUNT(*) FROM crew_members WHERE crew_id = c.id) as member_count
            FROM crews c
            LEFT JOIN crew_stats cs ON c.id = cs.crew_id
            ORDER BY c.crew_xp DESC
            LIMIT ?
        `, [limit]);

        return rows.map((row, index) => ({
            rank: index + 1,
            crewId: row.id,
            name: row.name,
            tag: row.tag,
            level: Math.floor((row.crew_xp || 0) / XP_PER_LEVEL) + 1,
            xp: row.crew_xp || 0,
            memberCount: row.member_count,
            totalHandsPlayed: row.total_hands_played || 0,
            totalChipsWon: row.total_chips_won || 0,
            tournamentsWon: row.tournaments_won || 0
        }));
    }

    /**
     * Get crew tag for a player (for display at tables)
     */
    static async getPlayerCrewTag(playerId) {
        const result = await database.queryOne(`
            SELECT c.tag FROM crew_members cm 
            JOIN crews c ON cm.crew_id = c.id 
            WHERE cm.player_id = ?
        `, [playerId]);
        return result?.tag || null;
    }

    /**
     * Get crew perks for a player's crew
     */
    static async getCrewPerks(playerId) {
        const membership = await database.queryOne(
            'SELECT c.crew_xp FROM crew_members cm JOIN crews c ON cm.crew_id = c.id WHERE cm.player_id = ?',
            [playerId]
        );
        if (!membership) return { xpBonus: 0, dropRateBonus: 0, robberyBonus: 0 };

        const crewLevel = Math.floor((membership.crew_xp || 0) / XP_PER_LEVEL) + 1;
        let xpBonus = 0, dropRateBonus = 0, robberyBonus = 0;

        for (const [level, perk] of Object.entries(CREW_PERKS)) {
            if (crewLevel >= parseInt(level)) {
                if (perk.xpBonus) xpBonus += perk.xpBonus;
                if (perk.dropRateBonus) dropRateBonus += perk.dropRateBonus;
                if (perk.robberyBonus) robberyBonus += perk.robberyBonus;
            }
        }

        return { xpBonus, dropRateBonus, robberyBonus };
    }
}

module.exports = CrewManager;
