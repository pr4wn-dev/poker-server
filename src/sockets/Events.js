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
    
    // Client -> Server: Side Pot
    START_SIDE_POT: 'start_side_pot',
    SUBMIT_TO_SIDE_POT: 'submit_to_side_pot',
    OPT_OUT_SIDE_POT: 'opt_out_side_pot',
    APPROVE_SIDE_POT_ITEM: 'approve_side_pot_item',
    DECLINE_SIDE_POT_ITEM: 'decline_side_pot_item',

    // Server -> Client
    TABLE_CREATED: 'table_created',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left',
    PLAYER_DISCONNECTED: 'player_disconnected',
    PLAYER_ACTION: 'player_action',
    TABLE_STATE: 'table_state',
    CHAT_MESSAGE: 'chat',
    
    // Server -> Client: Side Pot
    SIDE_POT_STARTED: 'side_pot_started',
    SIDE_POT_SUBMISSION: 'side_pot_submission',
    SIDE_POT_ITEM_APPROVED: 'side_pot_item_approved',
    SIDE_POT_ITEM_DECLINED: 'side_pot_item_declined',
    YOUR_SIDE_POT_APPROVED: 'your_side_pot_approved',
    YOUR_SIDE_POT_DECLINED: 'your_side_pot_declined',
    SIDE_POT_AWARDED: 'side_pot_awarded',

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

