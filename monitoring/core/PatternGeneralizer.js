/**
 * Pattern Generalizer - Extract General Patterns from Specific Instances
 * 
 * Converts specific patterns (exact line numbers, full paths, exact values)
 * into generalized patterns (categories, types, structures) that can match
 * similar situations.
 */

class PatternGeneralizer {
    /**
     * Generalize a file path to file type
     */
    static generalizeFilePath(filePath) {
        if (!filePath) return null;
        
        // Extract file extension
        const ext = filePath.split('.').pop()?.toLowerCase();
        
        // Map to file type
        const fileTypeMap = {
            'ps1': 'powershell_script',
            'js': 'javascript_file',
            'ts': 'typescript_file',
            'json': 'json_file',
            'md': 'markdown_file',
            'cs': 'csharp_file',
            'py': 'python_file'
        };
        
        return fileTypeMap[ext] || 'unknown_file';
    }
    
    /**
     * Generalize an error message to error category
     */
    static generalizeErrorMessage(errorMessage) {
        if (!errorMessage) return null;
        
        const msg = errorMessage.toLowerCase();
        
        // Extract error category
        if (msg.includes('missing') && (msg.includes('catch') || msg.includes('finally'))) {
            return 'try_catch_finally_structure';
        }
        if (msg.includes('missing closing') || msg.includes('missing \'}\'')) {
            return 'missing_closing_brace';
        }
        if (msg.includes('syntax error') || msg.includes('syntaxerror')) {
            return 'syntax_error';
        }
        if (msg.includes('typeerror') || msg.includes('type error')) {
            return 'type_error';
        }
        if (msg.includes('referenceerror') || msg.includes('reference error')) {
            return 'reference_error';
        }
        if (msg.includes('undefined') || msg.includes('null')) {
            return 'null_undefined_error';
        }
        if (msg.includes('timeout') || msg.includes('timed out')) {
            return 'timeout_error';
        }
        if (msg.includes('permission') || msg.includes('access denied')) {
            return 'permission_error';
        }
        
        // Extract error type from common patterns
        const errorTypeMatch = msg.match(/(\w+error|\w+exception)/i);
        if (errorTypeMatch) {
            return errorTypeMatch[1].toLowerCase().replace('error', '_error').replace('exception', '_exception');
        }
        
        return 'unknown_error';
    }
    
    /**
     * Generalize a line number to line category (not exact number)
     */
    static generalizeLineNumber(lineNumber) {
        // Don't store exact line numbers - they're too specific
        // Instead, return null to indicate line number shouldn't be part of pattern
        return null;
    }
    
    /**
     * Generalize a numeric value to category
     */
    static categorizeNumber(value, thresholds = { low: 10, medium: 100, high: 1000 }) {
        if (value === null || value === undefined) return 'unknown';
        if (value === 0) return 'zero';
        if (value < thresholds.low) return 'low';
        if (value < thresholds.medium) return 'medium';
        if (value < thresholds.high) return 'high';
        return 'very_high';
    }
    
    /**
     * Generalize state pattern - only create if state is relevant
     */
    static generalizeStatePattern(state, issueType) {
        // Only create state patterns for issues where state is relevant
        const stateRelevantIssues = [
            'chip_mismatch',
            'chip_integrity',
            'player_state',
            'game_state',
            'table_state',
            'balance_error'
        ];
        
        const isStateRelevant = stateRelevantIssues.some(relevant => 
            issueType && issueType.toLowerCase().includes(relevant)
        );
        
        if (!isStateRelevant) {
            return null; // Don't create state pattern for irrelevant issues
        }
        
        // Generalize state values to categories
        const features = [];
        
        if (state.chips) {
            const chipTotal = state.chips.total || 0;
            const chipCategory = this.categorizeNumber(chipTotal);
            features.push(`chips:${chipCategory}`);
        }
        
        if (state.players) {
            const playerCount = Object.keys(state.players || {}).length;
            const playerCategory = this.categorizeNumber(playerCount, { low: 2, medium: 5, high: 10 });
            features.push(`players:${playerCategory}`);
        }
        
        if (state.phase) {
            features.push(`phase:${state.phase}`); // Phase is already categorical
        }
        
        return features.length > 0 ? features.join('|') : null;
    }
    
    /**
     * Generalize a fix description to fix category
     */
    static generalizeFixDescription(fixDescription) {
        if (!fixDescription) return null;
        
        const desc = fixDescription.toLowerCase();
        
        // Extract fix category
        if (desc.includes('try') && (desc.includes('catch') || desc.includes('finally'))) {
            return 'fix_try_catch_finally_structure';
        }
        if (desc.includes('brace') || desc.includes('closing')) {
            return 'fix_missing_brace';
        }
        if (desc.includes('syntax')) {
            return 'fix_syntax_error';
        }
        if (desc.includes('type') || desc.includes('undefined')) {
            return 'fix_type_error';
        }
        if (desc.includes('import') || desc.includes('require')) {
            return 'fix_import_error';
        }
        if (desc.includes('async') || desc.includes('await')) {
            return 'fix_async_error';
        }
        
        return 'fix_unknown';
    }
    
    /**
     * Create minimal context object (no exact values)
     */
    static createMinimalContext(originalContext, issueType) {
        const minimal = {
            fileType: this.generalizeFilePath(originalContext.file),
            errorCategory: this.generalizeErrorMessage(originalContext.errors?.[0]),
            fixCategory: this.generalizeFixDescription(originalContext.fixes?.[0]),
            component: originalContext.component ? this.generalizeFilePath(originalContext.component) : null,
            severity: originalContext.severity || 'unknown'
        };
        
        // Remove null values
        Object.keys(minimal).forEach(key => {
            if (minimal[key] === null) delete minimal[key];
        });
        
        return minimal;
    }
    
    /**
     * Calculate similarity between two patterns (0-1 score)
     */
    static calculatePatternSimilarity(pattern1, pattern2) {
        if (!pattern1 || !pattern2) return 0;
        
        // Exact match
        if (pattern1 === pattern2) return 1.0;
        
        // Extract pattern parts
        const parts1 = pattern1.split(':');
        const parts2 = pattern2.split(':');
        
        // Type match (first part)
        if (parts1[0] === parts2[0]) {
            // Same type, check value similarity
            const value1 = parts1.slice(1).join(':');
            const value2 = parts2.slice(1).join(':');
            
            // Exact value match
            if (value1 === value2) return 1.0;
            
            // Category match (e.g., both "low", both "zero")
            if (value1 === value2) return 1.0;
            
            // Partial match (one contains the other)
            if (value1.includes(value2) || value2.includes(value1)) {
                return 0.7;
            }
            
            // Same type but different values
            return 0.3;
        }
        
        // Different types, check if related
        const type1 = parts1[0];
        const type2 = parts2[0];
        
        // Related types (e.g., issueType and fixMethod for same issue)
        if ((type1 === 'issueType' && type2 === 'fixMethod') || 
            (type1 === 'fixMethod' && type2 === 'issueType')) {
            return 0.5;
        }
        
        return 0.0;
    }
    
    /**
     * Find best matching pattern from a list
     */
    static findBestMatch(targetPattern, candidatePatterns, minSimilarity = 0.5) {
        let bestMatch = null;
        let bestScore = 0;
        
        for (const candidate of candidatePatterns) {
            const patternKey = Array.isArray(candidate) ? candidate[0] : candidate;
            const score = this.calculatePatternSimilarity(targetPattern, patternKey);
            
            if (score > bestScore && score >= minSimilarity) {
                bestScore = score;
                bestMatch = candidate;
            }
        }
        
        return bestMatch ? { pattern: bestMatch, score: bestScore } : null;
    }
}

module.exports = PatternGeneralizer;
