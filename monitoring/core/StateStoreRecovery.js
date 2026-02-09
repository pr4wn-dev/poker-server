/**
 * State Store Recovery - Extract learning data from corrupted files
 * 
 * When state file is corrupted, we need to preserve learning data
 * before starting fresh. This module extracts learning patterns,
 * knowledge, and other critical learning data from corrupted JSON.
 */

const fs = require('fs');
const path = require('path');

class StateStoreRecovery {
    /**
     * Extract learning data from corrupted state file
     * Uses regex to find learning sections even if JSON is corrupted
     */
    static extractLearningData(corruptedFilePath) {
        const recovered = {
            patterns: [],
            knowledge: [],
            improvements: [],
            aiCompliance: [],
            workflowViolations: [],
            prompts: [],
            success: false,
            errors: []
        };

        try {
            if (!fs.existsSync(corruptedFilePath)) {
                return recovered;
            }

            const content = fs.readFileSync(corruptedFilePath, 'utf8');
            
            // Try to extract learning.patterns
            try {
                // Look for patterns array - try multiple strategies
                const patternsMatch = content.match(/"patterns"\s*:\s*\[(.*?)\]/s);
                if (patternsMatch) {
                    // Try to parse just the patterns section
                    const patternsJson = '[' + patternsMatch[1] + ']';
                    try {
                        const parsed = JSON.parse(patternsJson);
                        if (Array.isArray(parsed)) {
                            recovered.patterns = parsed;
                        }
                    } catch (e) {
                        // Try to extract individual pattern entries
                        const patternEntries = patternsMatch[1].match(/\["([^"]+)",\s*\{[^}]+\}\]/g);
                        if (patternEntries) {
                            patternEntries.forEach(entry => {
                                try {
                                    const parsed = JSON.parse(entry);
                                    if (Array.isArray(parsed) && parsed.length === 2) {
                                        recovered.patterns.push(parsed);
                                    }
                                } catch (e) {
                                    // Skip this entry
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                recovered.errors.push('Failed to extract patterns: ' + e.message);
            }

            // Try to extract learning.knowledge
            try {
                const knowledgeMatch = content.match(/"knowledge"\s*:\s*\[(.*?)\]/s);
                if (knowledgeMatch) {
                    const knowledgeJson = '[' + knowledgeMatch[1] + ']';
                    try {
                        const parsed = JSON.parse(knowledgeJson);
                        if (Array.isArray(parsed)) {
                            recovered.knowledge = parsed;
                        }
                    } catch (e) {
                        // Try to extract individual knowledge items
                        const knowledgeItems = knowledgeMatch[1].match(/\{[^}]+\}/g);
                        if (knowledgeItems) {
                            knowledgeItems.forEach(item => {
                                try {
                                    const parsed = JSON.parse(item);
                                    recovered.knowledge.push(parsed);
                                } catch (e) {
                                    // Skip this item
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                recovered.errors.push('Failed to extract knowledge: ' + e.message);
            }

            // Try to extract learning.improvements
            try {
                const improvementsMatch = content.match(/"improvements"\s*:\s*\[(.*?)\]/s);
                if (improvementsMatch) {
                    const improvementsJson = '[' + improvementsMatch[1] + ']';
                    try {
                        const parsed = JSON.parse(improvementsJson);
                        if (Array.isArray(parsed)) {
                            recovered.improvements = parsed;
                        }
                    } catch (e) {
                        // Try to extract individual improvement items
                        const improvementItems = improvementsMatch[1].match(/\{[^}]+\}/g);
                        if (improvementItems) {
                            improvementItems.forEach(item => {
                                try {
                                    const parsed = JSON.parse(item);
                                    recovered.improvements.push(parsed);
                                } catch (e) {
                                    // Skip this item
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                recovered.errors.push('Failed to extract improvements: ' + e.message);
            }

            // Try to extract ai.workflowViolations
            try {
                const violationsMatch = content.match(/"workflowViolations"\s*:\s*\[(.*?)\]/s);
                if (violationsMatch) {
                    const violationsJson = '[' + violationsMatch[1] + ']';
                    try {
                        const parsed = JSON.parse(violationsJson);
                        if (Array.isArray(parsed)) {
                            recovered.workflowViolations = parsed;
                        }
                    } catch (e) {
                        // Try to extract individual violations
                        const violationItems = violationsMatch[1].match(/\{[^}]+\}/g);
                        if (violationItems) {
                            violationItems.forEach(item => {
                                try {
                                    const parsed = JSON.parse(item);
                                    recovered.workflowViolations.push(parsed);
                                } catch (e) {
                                    // Skip this item
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                recovered.errors.push('Failed to extract workflow violations: ' + e.message);
            }

            // Try to extract ai.prompts
            try {
                const promptsMatch = content.match(/"prompts"\s*:\s*\[(.*?)\]/s);
                if (promptsMatch) {
                    const promptsJson = '[' + promptsMatch[1] + ']';
                    try {
                        const parsed = JSON.parse(promptsJson);
                        if (Array.isArray(parsed)) {
                            recovered.prompts = parsed;
                        }
                    } catch (e) {
                        // Try to extract individual prompts
                        const promptItems = promptsMatch[1].match(/\{[^}]+\}/g);
                        if (promptItems) {
                            promptItems.forEach(item => {
                                try {
                                    const parsed = JSON.parse(item);
                                    recovered.prompts.push(parsed);
                                } catch (e) {
                                    // Skip this item
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                recovered.errors.push('Failed to extract prompts: ' + e.message);
            }

            // Try to extract learning.aiCompliance
            try {
                const complianceMatch = content.match(/"aiCompliance"\s*:\s*\[(.*?)\]/s);
                if (complianceMatch) {
                    const complianceJson = '[' + complianceMatch[1] + ']';
                    try {
                        const parsed = JSON.parse(complianceJson);
                        if (Array.isArray(parsed)) {
                            recovered.aiCompliance = parsed;
                        }
                    } catch (e) {
                        // Try to extract individual compliance records
                        const complianceItems = complianceMatch[1].match(/\{[^}]+\}/g);
                        if (complianceItems) {
                            complianceItems.forEach(item => {
                                try {
                                    const parsed = JSON.parse(item);
                                    recovered.aiCompliance.push(parsed);
                                } catch (e) {
                                    // Skip this item
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                recovered.errors.push('Failed to extract compliance: ' + e.message);
            }

            // Mark as successful if we recovered anything
            if (recovered.patterns.length > 0 || 
                recovered.knowledge.length > 0 || 
                recovered.improvements.length > 0 ||
                recovered.workflowViolations.length > 0 ||
                recovered.prompts.length > 0 ||
                recovered.aiCompliance.length > 0) {
                recovered.success = true;
            }

        } catch (error) {
            recovered.errors.push('Recovery failed: ' + error.message);
        }

        return recovered;
    }

    /**
     * Save recovered learning data to a separate file
     */
    static saveRecoveredData(recoveredData, outputPath) {
        try {
            const data = {
                recovered: true,
                timestamp: Date.now(),
                patterns: recoveredData.patterns,
                knowledge: recoveredData.knowledge,
                improvements: recoveredData.improvements,
                aiCompliance: recoveredData.aiCompliance,
                workflowViolations: recoveredData.workflowViolations,
                prompts: recoveredData.prompts,
                errors: recoveredData.errors
            };
            
            fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Load recovered learning data from file
     */
    static loadRecoveredData(recoveredFilePath) {
        try {
            if (!fs.existsSync(recoveredFilePath)) {
                return null;
            }
            
            const content = fs.readFileSync(recoveredFilePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            return null;
        }
    }
}

module.exports = StateStoreRecovery;
