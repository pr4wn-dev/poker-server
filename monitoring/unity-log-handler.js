/**
 * Unity Log Handler - Captures all Unity console logs and sends to server
 * 
 * This module handles Unity log events and ensures all Unity logging
 * goes through the centralized gameLogger system
 */

const gameLogger = require('../src/utils/GameLogger');

class UnityLogHandler {
    constructor(socketHandler) {
        this.socketHandler = socketHandler;
        this.setupUnityLogCapture();
    }
    
    /**
     * Setup Unity log capture via socket events
     */
    setupUnityLogCapture() {
        if (!this.socketHandler || !this.socketHandler.io) {
            gameLogger.error('MONITORING', '[UNITY_LOG_HANDLER] SETUP_FAILED', {
                error: 'SocketHandler not available'
            });
            return;
        }
        
        // This will be called from SocketHandler when Unity sends log events
        // The actual socket event handler is in SocketHandler.js
    }
    
    /**
     * Handle Unity log event from client
     * Called by SocketHandler when Unity emits 'report_unity_log'
     */
    handleUnityLog(userId, username, logData) {
        const { level, message, stackTrace, context } = logData;
        
        // Map Unity log levels to our system
        let logLevel = 'GAME';
        if (level === 'Error' || level === 'Exception') {
            logLevel = 'ERROR';
        } else if (level === 'Warning') {
            logLevel = 'WARNING';
        } else if (level === 'Debug') {
            logLevel = 'DEBUG';
        }
        
        // Log to centralized system
        gameLogger.writeLog(logLevel, 'UNITY_CLIENT', message, {
            userId,
            username,
            level,
            stackTrace,
            context,
            source: 'unity_console'
        });
        
        // If it's an error, also check if it should trigger issue detection
        if (level === 'Error' || level === 'Exception') {
            // The issue detector will pick this up from game.log
            gameLogger.error('UNITY_CLIENT', '[UNITY_ERROR]', {
                userId,
                username,
                message,
                stackTrace,
                context,
                action: 'Unity error logged - issue detector will process'
            });
        }
    }
}

module.exports = UnityLogHandler;
