/**
 * Terminal Error Monitor - Detects errors in AI terminal commands
 * 
 * Monitors terminal command outputs for errors and generates prompts
 * This ensures errors I make in terminal commands are captured and fixed
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const gameLogger = require('../../src/utils/GameLogger');

class TerminalErrorMonitor extends EventEmitter {
    constructor(stateStore, promptGenerator, learningEngine) {
        super();
        this.stateStore = stateStore;
        this.promptGenerator = promptGenerator;
        this.learningEngine = learningEngine;
        this.projectRoot = stateStore?.projectRoot || path.resolve(__dirname, '../..');
        
        // Error patterns to detect
        this.errorPatterns = [
            // JavaScript/Node.js errors
            {
                pattern: /SyntaxError:.*/i,
                type: 'syntax_error',
                severity: 'high',
                category: 'javascript'
            },
            {
                pattern: /ReferenceError:.*/i,
                type: 'reference_error',
                severity: 'high',
                category: 'javascript'
            },
            {
                pattern: /TypeError:.*/i,
                type: 'type_error',
                severity: 'high',
                category: 'javascript'
            },
            {
                pattern: /Error:.*/i,
                type: 'general_error',
                severity: 'medium',
                category: 'general'
            },
            {
                pattern: /Invalid string escape/i,
                type: 'syntax_error',
                severity: 'high',
                category: 'javascript',
                specific: 'string_escaping'
            },
            {
                pattern: /Cannot find module/i,
                type: 'module_error',
                severity: 'high',
                category: 'nodejs'
            },
            {
                pattern: /ENOENT:.*no such file or directory/i,
                type: 'file_not_found',
                severity: 'medium',
                category: 'filesystem'
            },
            {
                pattern: /EACCES:.*permission denied/i,
                type: 'permission_error',
                severity: 'high',
                category: 'filesystem'
            },
            // PowerShell errors
            {
                pattern: /Missing.*in.*statement/i,
                type: 'syntax_error',
                severity: 'high',
                category: 'powershell'
            },
            {
                pattern: /Unexpected token.*in expression/i,
                type: 'syntax_error',
                severity: 'high',
                category: 'powershell'
            },
            {
                pattern: /The string is missing the terminator/i,
                type: 'syntax_error',
                severity: 'high',
                category: 'powershell'
            },
            {
                pattern: /Cannot bind argument to parameter/i,
                type: 'parameter_error',
                severity: 'medium',
                category: 'powershell'
            },
            // Database errors
            {
                pattern: /Pool is closed/i,
                type: 'database_error',
                severity: 'high',
                category: 'database'
            },
            {
                pattern: /Connection.*refused/i,
                type: 'connection_error',
                severity: 'high',
                category: 'network'
            },
            {
                pattern: /Unable to connect to the remote server/i,
                type: 'connection_error',
                severity: 'high',
                category: 'network'
            },
            // Exit code errors
            {
                pattern: /exit code: (\d+)/i,
                type: 'exit_code_error',
                severity: 'medium',
                category: 'general',
                extractExitCode: true
            }
        ];
    }

    /**
     * Analyze terminal command output for errors
     */
    analyzeOutput(command, output, exitCode) {
        const errors = [];
        
        // Check exit code
        if (exitCode !== 0 && exitCode !== null && exitCode !== undefined) {
            errors.push({
                type: 'exit_code_error',
                severity: 'high',
                message: `Command exited with code ${exitCode}`,
                command: command,
                exitCode: exitCode
            });
        }
        
        // Check output for error patterns
        if (output) {
            const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
            
            for (const errorPattern of this.errorPatterns) {
                const matches = outputStr.match(errorPattern.pattern);
                if (matches) {
                    const error = {
                        type: errorPattern.type,
                        severity: errorPattern.severity,
                        category: errorPattern.category,
                        message: matches[0],
                        command: command,
                        pattern: errorPattern.pattern.toString()
                    };
                    
                    if (errorPattern.specific) {
                        error.specific = errorPattern.specific;
                    }
                    
                    if (errorPattern.extractExitCode && matches[1]) {
                        error.exitCode = parseInt(matches[1]);
                    }
                    
                    // Extract line number if present
                    const lineMatch = outputStr.match(/\[eval\]:(\d+)/i) || outputStr.match(/Line (\d+):/i);
                    if (lineMatch) {
                        error.lineNumber = parseInt(lineMatch[1]);
                    }
                    
                    errors.push(error);
                }
            }
        }
        
        return errors;
    }

    /**
     * Generate prompt for terminal error and write to file
     */
    async generatePromptForError(error, command, output) {
        if (!this.promptGenerator) {
            // Fallback: write directly to file
            this.writeErrorPromptDirectly(error, command, output);
            return;
        }

        // Create issue object for prompt generator
        const issue = {
            type: 'terminal_command_error',
            errorType: error.type,
            severity: error.severity,
            component: 'AI_Terminal_Command',
            file: error.lineNumber ? `[eval]:${error.lineNumber}` : 'terminal',
            errorMessage: error.message,
            message: `Terminal command error: ${error.message}`,
            command: command,
            output: output,
            category: error.category,
            specific: error.specific
        };

        // Get misdiagnosis prevention from learning system
        let misdiagnosisPrevention = { warnings: [], correctApproach: null };
        if (this.learningEngine && this.learningEngine.getMisdiagnosisPrevention) {
            try {
                misdiagnosisPrevention = await this.learningEngine.getMisdiagnosisPrevention(
                    error.type,
                    error.message,
                    'AI_Terminal_Command'
                );
            } catch (err) {
                // Ignore errors getting misdiagnosis - continue with prompt generation
            }
        }

        // Generate prompt
        const prompt = this.promptGenerator.generatePrompt(issue);
        
        if (prompt) {
            // Enhance prompt with terminal-specific context
            prompt.prompt = `TERMINAL COMMAND ERROR DETECTED

Command: ${command}
Error: ${error.message}
${error.lineNumber ? `Line: ${error.lineNumber}` : ''}
Category: ${error.category}
Severity: ${error.severity}

${misdiagnosisPrevention.warnings.length > 0 ? '⚠️  MISDIAGNOSIS WARNING:\n' + misdiagnosisPrevention.warnings.map(w => `   - ${w.message}`).join('\n') + '\n' : ''}
${misdiagnosisPrevention.correctApproach ? `✅ CORRECT APPROACH: ${misdiagnosisPrevention.correctApproach}\n` : ''}

Full Output:
${typeof output === 'string' ? output.substring(0, 2000) : JSON.stringify(output, null, 2).substring(0, 2000)}

${prompt.prompt}

Follow the workflow in @README.md (31-61) to fix this error.`;

            // Write to file
            this.promptGenerator.writePromptToFile(prompt);
            
            // Emit event
            this.emit('errorDetected', { error, command, prompt });
            
            return prompt;
        }
    }

    /**
     * Fallback: Write error prompt directly to file
     */
    writeErrorPromptDirectly(error, command, output) {
        const logsDir = path.join(this.projectRoot, 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        const promptFile = path.join(logsDir, 'prompts-for-user.txt');
        const timestamp = new Date().toISOString();
        
        const promptText = `═══════════════════════════════════════════════════════════════
  PROMPT FOR USER TO DELIVER TO AI
  Generated: ${timestamp}
  Type: terminal_command_error
═══════════════════════════════════════════════════════════════

TERMINAL COMMAND ERROR DETECTED

Command: ${command}
Error: ${error.message}
${error.lineNumber ? `Line: ${error.lineNumber}` : ''}
Category: ${error.category}
Severity: ${error.severity}

Full Output:
${typeof output === 'string' ? output.substring(0, 2000) : JSON.stringify(output, null, 2).substring(0, 2000)}

Fix this terminal command error. Follow the workflow in @README.md (31-61).

═══════════════════════════════════════════════════════════════
`;

        try {
            fs.appendFileSync(promptFile, promptText, 'utf8');
            gameLogger.info('MONITORING', '[TERMINAL_ERROR_MONITOR] Wrote error prompt to file', {
                errorType: error.type,
                command: command.substring(0, 100)
            });
        } catch (err) {
            gameLogger.error('MONITORING', '[TERMINAL_ERROR_MONITOR] Failed to write prompt', {
                error: err.message
            });
        }
    }

    /**
     * Monitor a terminal command (call this after run_terminal_cmd)
     */
    async monitorCommand(command, output, exitCode) {
        const errors = this.analyzeOutput(command, output, exitCode);
        
        if (errors.length > 0) {
            for (const error of errors) {
                await this.generatePromptForError(error, command, output);
            }
            
            return errors;
        }
        
        return [];
    }
}

module.exports = TerminalErrorMonitor;
