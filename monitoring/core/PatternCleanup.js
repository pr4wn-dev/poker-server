/**
 * Pattern Cleanup - Generalize Existing Bloated Patterns
 * 
 * Converts existing specific patterns (with exact values, line numbers, etc.)
 * into generalized patterns that can match similar situations.
 */

const PatternGeneralizer = require('./PatternGeneralizer');

class PatternCleanup {
    /**
     * Clean up and generalize existing patterns
     */
    static cleanupPatterns(patterns) {
        if (!Array.isArray(patterns)) {
            return [];
        }
        
        const cleaned = [];
        const seen = new Set(); // Track merged patterns
        
        for (const patternEntry of patterns) {
            if (!Array.isArray(patternEntry) || patternEntry.length < 2) {
                continue;
            }
            
            const [originalKey, originalData] = patternEntry;
            
            // Generalize the pattern key
            const generalizedKey = this.generalizePatternKey(originalKey);
            
            // Check if we've already seen this generalized pattern
            if (seen.has(generalizedKey)) {
                // Merge with existing pattern
                const existingIndex = cleaned.findIndex(([key]) => key === generalizedKey);
                if (existingIndex >= 0) {
                    const [, existingData] = cleaned[existingIndex];
                    cleaned[existingIndex] = [
                        generalizedKey,
                        this.mergePatternData(existingData, originalData)
                    ];
                }
                continue;
            }
            
            seen.add(generalizedKey);
            
            // Generalize the pattern data
            const generalizedData = this.generalizePatternData(originalData);
            
            cleaned.push([generalizedKey, generalizedData]);
        }
        
        return cleaned;
    }
    
    /**
     * Generalize a pattern key
     */
    static generalizePatternKey(patternKey) {
        if (!patternKey || typeof patternKey !== 'string') {
            return patternKey;
        }
        
        // Split by colon to get type and value
        const parts = patternKey.split(':');
        if (parts.length < 2) {
            return patternKey; // Can't generalize
        }
        
        const type = parts[0];
        const value = parts.slice(1).join(':');
        
        // Handle different pattern types
        if (type === 'state') {
            // Generalize state patterns (e.g., "chips:0|players:0" -> "chips:zero|players:zero")
            return this.generalizeStatePatternKey(value);
        }
        
        if (type === 'issueType') {
            // Issue types are already categorical, keep as-is
            return patternKey;
        }
        
        if (type === 'fixMethod') {
            // Fix methods are already categorical, keep as-is
            return patternKey;
        }
        
        if (type === 'log') {
            // Log patterns might have specific values, try to generalize
            return this.generalizeLogPatternKey(value);
        }
        
        // Unknown type, keep as-is
        return patternKey;
    }
    
    /**
     * Generalize state pattern key
     */
    static generalizeStatePatternKey(stateValue) {
        // Parse state pattern (e.g., "chips:0|players:0")
        const features = stateValue.split('|');
        const generalizedFeatures = [];
        
        for (const feature of features) {
            const [key, value] = feature.split(':');
            if (key && value !== undefined) {
                // Categorize numeric value
                const numValue = parseInt(value, 10);
                if (!isNaN(numValue)) {
                    const category = PatternGeneralizer.categorizeNumber(numValue);
                    generalizedFeatures.push(`${key}:${category}`);
                } else {
                    // Non-numeric value (like phase), keep as-is
                    generalizedFeatures.push(feature);
                }
            } else {
                // Can't parse, keep as-is
                generalizedFeatures.push(feature);
            }
        }
        
        return `state:${generalizedFeatures.join('|')}`;
    }
    
    /**
     * Generalize log pattern key
     */
    static generalizeLogPatternKey(logValue) {
        // Log patterns are already somewhat generalized, but we can improve
        // For now, keep as-is (could be enhanced later)
        return `log:${logValue}`;
    }
    
    /**
     * Generalize pattern data (remove excessive context)
     */
    static generalizePatternData(patternData) {
        if (!patternData || typeof patternData !== 'object') {
            return patternData;
        }
        
        const cleaned = {
            frequency: patternData.frequency || 0,
            successes: patternData.successes || 0,
            failures: patternData.failures || 0,
            successRate: patternData.successRate || 0,
            solutions: [],
            contexts: []
        };
        
        // Generalize solutions (keep only method and result)
        if (Array.isArray(patternData.solutions)) {
            cleaned.solutions = patternData.solutions
                .slice(-5) // Keep only last 5
                .map(sol => ({
                    method: sol.method,
                    result: sol.result,
                    timestamp: sol.timestamp
                }));
        }
        
        // Generalize contexts (remove exact values)
        if (Array.isArray(patternData.contexts)) {
            cleaned.contexts = patternData.contexts
                .slice(-5) // Keep only last 5
                .map(ctx => {
                    if (typeof ctx === 'object' && ctx !== null) {
                        // Use generalizer to create minimal context
                        return PatternGeneralizer.createMinimalContext(ctx, null);
                    }
                    return ctx;
                });
        }
        
        // Copy other useful fields
        if (patternData.method) {
            cleaned.method = patternData.method;
        }
        
        return cleaned;
    }
    
    /**
     * Merge two pattern data objects
     */
    static mergePatternData(data1, data2) {
        const merged = {
            frequency: (data1.frequency || 0) + (data2.frequency || 0),
            successes: (data1.successes || 0) + (data2.successes || 0),
            failures: (data1.failures || 0) + (data2.failures || 0),
            solutions: [],
            contexts: []
        };
        
        // Calculate success rate
        const totalAttempts = merged.successes + merged.failures;
        merged.successRate = totalAttempts > 0 ? merged.successes / totalAttempts : 0;
        
        // Merge solutions (keep most recent)
        const allSolutions = [
            ...(Array.isArray(data1.solutions) ? data1.solutions : []),
            ...(Array.isArray(data2.solutions) ? data2.solutions : [])
        ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        merged.solutions = allSolutions.slice(0, 5); // Keep only last 5
        
        // Merge contexts (keep most recent)
        const allContexts = [
            ...(Array.isArray(data1.contexts) ? data1.contexts : []),
            ...(Array.isArray(data2.contexts) ? data2.contexts : [])
        ];
        
        merged.contexts = allContexts.slice(-5); // Keep only last 5
        
        // Prefer method from data with higher success rate
        if (data1.method && data2.method) {
            merged.method = (data1.successRate || 0) >= (data2.successRate || 0) 
                ? data1.method 
                : data2.method;
        } else {
            merged.method = data1.method || data2.method;
        }
        
        return merged;
    }
}

module.exports = PatternCleanup;
