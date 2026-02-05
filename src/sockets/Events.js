/**
 * Socket Events Reference
 * ========================
 * This file documents all WebSocket events for the poker server.
 * Use this as a reference when implementing the Unity client.
 */

/**
 * CLIENT -> SERVER EVENTS
 * =======================
 * 
 * 'register' - Register a new player
 *   Send: { playerName: string }
 *   Response: { success: boolean, playerId?: string, error?: string }
 * 
 * 'get_tables' - Get list of available tables
 *   Send: (no data)
 *   Response: { success: boolean, tables: TableInfo[] }
 * 
 * 'create_table' - Create a new table
 *   Send: { name?: string, maxPlayers?: number, smallBlind?: number, bigBlind?: number, isPrivate?: boolean }
 *   Response: { success: boolean, tableId?: string, error?: string }
 * 
 * 'join_table' - Join an existing table
 *   Send: { tableId: string, seatIndex?: number }
 *   Response: { success: boolean, seatIndex?: number, state?: TableState, error?: string }
 * 
 * 'leave_table' - Leave current table
 *   Send: (no data)
 *   Response: { success: boolean, error?: string }
 * 
 * 'action' - Perform a game action
 *   Send: { action: 'fold'|'check'|'call'|'bet'|'raise'|'allin', amount?: number }
 *   Response: { success: boolean, action?: string, amount?: number, error?: string }
 * 
 * 'chat' - Send a chat message
 *   Send: { message: string }
 *   Response: (none)
 */

/**
 * SERVER -> CLIENT EVENTS
 * =======================
 * 
 * 'table_created' - New table was created
 *   Receive: TableInfo
 * 
 * 'player_joined' - Player joined your table
 *   Receive: { playerId: string, name: string, seatIndex: number }
 * 
 * 'player_left' - Player left your table
 *   Receive: { playerId: string }
 * 
 * 'player_disconnected' - Player disconnected from your table
 *   Receive: { playerId: string }
 * 
 * 'player_action' - Player performed an action
 *   Receive: { playerId: string, action: string, amount?: number }
 * 
 * 'table_state' - Full table state update
 *   Receive: TableState
 * 
 * 'chat' - Chat message received
 *   Receive: { playerId: string, name: string, message: string }
 */

/**
 * DATA TYPES
 * ==========
 * 
 * TableInfo {
 *   id: string
 *   name: string
 *   playerCount: number
 *   maxPlayers: number
 *   smallBlind: number
 *   bigBlind: number
 *   isPrivate: boolean
 * }
 * 
 * TableState {
 *   id: string
 *   name: string
 *   phase: 'waiting'|'preflop'|'flop'|'turn'|'river'|'showdown'
 *   pot: number
 *   communityCards: Card[]
 *   currentBet: number
 *   dealerIndex: number
 *   currentPlayerIndex: number
 *   seats: (SeatInfo|null)[]
 * }
 * 
 * SeatInfo {
 *   index: number
 *   playerId: string
 *   name: string
 *   chips: number
 *   currentBet: number
 *   isFolded: boolean
 *   isAllIn: boolean
 *   isConnected: boolean
 *   cards: Card[]|null[]  // null for hidden cards
 * }
 * 
 * Card {
 *   rank: '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'|'A'
 *   suit: 'hearts'|'diamonds'|'clubs'|'spades'
 * }
 */

// Export event names as constants for consistency
module.exports = {
    // Client -> Server: Auth
    REGISTER: 'register',
    LOGIN: 'login',
    LOGOUT: 'logout',
    
    // Client -> Server: Lobby
    GET_TABLES: 'get_tables',
    CREATE_TABLE: 'create_table',
    JOIN_TABLE: 'join_table',
    LEAVE_TABLE: 'leave_table',
    ACTION: 'action',
    CHAT: 'chat',
    
    // Client -> Server: Item Ante ("For Keeps" - players put items in, winner takes all)
    // NOTE: Keeping old event names for backward compatibility with Unity client
    START_SIDE_POT: 'start_side_pot',  // Actually starts item ante
    SUBMIT_TO_SIDE_POT: 'submit_to_side_pot',  // Actually submits to item ante
    OPT_OUT_SIDE_POT: 'opt_out_side_pot',  // Actually opts out of item ante
    APPROVE_SIDE_POT_ITEM: 'approve_side_pot_item',  // Actually approves item ante item
    DECLINE_SIDE_POT_ITEM: 'decline_side_pot_item',  // Actually declines item ante item
    
    // Client -> Server: Adventure
    GET_WORLD_MAP: 'get_world_map',
    GET_AREA_BOSSES: 'get_area_bosses',
    START_ADVENTURE: 'start_adventure',
    ADVENTURE_ACTION: 'adventure_action',
    FORFEIT_ADVENTURE: 'forfeit_adventure',
    GET_ACTIVE_SESSION: 'get_active_session',
    USE_XP_ITEM: 'use_xp_item',
    
    // Client -> Server: Tournaments
    GET_AREA_TOURNAMENTS: 'get_area_tournaments',
    GET_ALL_TOURNAMENTS: 'get_all_tournaments',
    REGISTER_TOURNAMENT: 'register_tournament',
    UNREGISTER_TOURNAMENT: 'unregister_tournament',
    GET_TOURNAMENT_STATE: 'get_tournament_state',
    GET_MY_TOURNAMENT: 'get_my_tournament',
    GET_ELIGIBLE_SIDE_POT_ITEMS: 'get_eligible_side_pot_items',

    // Server -> Client
    TABLE_CREATED: 'table_created',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left',
    PLAYER_DISCONNECTED: 'player_disconnected',
    PLAYER_ACTION: 'player_action',
    TABLE_STATE: 'table_state',
    CHAT_MESSAGE: 'chat',
    
    // Server -> Client: Item Ante ("For Keeps")
    // NOTE: Keeping old event names for backward compatibility with Unity client
    SIDE_POT_STARTED: 'side_pot_started',  // Actually item ante started
    SIDE_POT_SUBMISSION: 'side_pot_submission',  // Actually item ante submission
    SIDE_POT_ITEM_APPROVED: 'side_pot_item_approved',  // Actually item ante item approved
    SIDE_POT_ITEM_DECLINED: 'side_pot_item_declined',  // Actually item ante item declined
    YOUR_SIDE_POT_APPROVED: 'your_side_pot_approved',  // Actually your item ante approved
    YOUR_SIDE_POT_DECLINED: 'your_side_pot_declined',  // Actually your item ante declined
    SIDE_POT_AWARDED: 'side_pot_awarded',  // Actually item ante awarded
    
    // Server -> Client: Adventure
    WORLD_MAP_STATE: 'world_map_state',
    AREA_BOSSES: 'area_bosses',
    ADVENTURE_STATE: 'adventure_state',
    ADVENTURE_RESULT: 'adventure_result',
    BOSS_TAUNT: 'boss_taunt',
    XP_GAINED: 'xp_gained',
    LEVEL_UP: 'level_up',
    RARE_DROP_OBTAINED: 'rare_drop_obtained',
    
    // Server -> Client: Tournaments
    TOURNAMENT_LIST: 'tournament_list',
    TOURNAMENT_STATE: 'tournament_state',
    TOURNAMENT_PLAYER_JOINED: 'tournament_player_joined',
    TOURNAMENT_PLAYER_LEFT: 'tournament_player_left',
    TOURNAMENT_STARTING: 'tournament_starting',
    TOURNAMENT_STARTED: 'tournament_started',
    TOURNAMENT_ELIMINATED: 'tournament_eliminated',
    TOURNAMENT_COMPLETED: 'tournament_completed',
    TOURNAMENT_BLIND_LEVEL_UP: 'tournament_blind_level_up',

    // Game Actions
    ACTIONS: {
        FOLD: 'fold',
        CHECK: 'check',
        CALL: 'call',
        BET: 'bet',
        RAISE: 'raise',
        ALL_IN: 'allin'
    },

    // Game Phases
    PHASES: {
        WAITING: 'waiting',
        PRE_FLOP: 'preflop',
        FLOP: 'flop',
        TURN: 'turn',
        RIVER: 'river',
        SHOWDOWN: 'showdown'
    }
};

