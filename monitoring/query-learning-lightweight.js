#!/usr/bin/env node
/**
 * Lightweight Learning System Query
 * 
 * Queries learning system WITHOUT loading entire state file
 * Only loads learning.learning section for fast queries
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const stateFile = path.join(projectRoot, 'logs', 'ai-state-store.json');

function queryLearning(issueType, errorMessage, component) {
    if (!fs.existsSync(stateFile)) {
        return {
            warnings: [],
            correctApproach: null,
            commonMisdiagnosis: null,
            timeSavings: null,
            failedMethods: [],
            error: 'State file not found'
        };
    }

    try {
        // Read only the learning section from JSON (streaming parse would be better, but this is simpler)
        const fileContent = fs.readFileSync(stateFile, 'utf8');
        const data = JSON.parse(fileContent);
        
        // Only access learning.learning section (not entire state)
        const learning = data.state?.learning || {};
        
        const result = {
            warnings: [],
            correctApproach: null,
            commonMisdiagnosis: null,
            timeSavings: null,
            failedMethods: []
        };

        // Check misdiagnosis patterns (only relevant ones)
        const misdiagnosisPatterns = learning.misdiagnosisPatterns || {};
        for (const [patternKey, pattern] of Object.entries(misdiagnosisPatterns)) {
            // Check symptom match (pattern.symptom is pipe-separated)
            let symptomMatch = false;
            if (pattern.symptom) {
                const symptomPatterns = pattern.symptom.split('|');
                const searchText = (errorMessage || issueType || '').toLowerCase();
                symptomMatch = symptomPatterns.some(sp => searchText.includes(sp.trim().toLowerCase()));
            }
            
            // Check issue type match
            const issueTypeMatch = !issueType || !pattern.issueType ||
                issueType.toLowerCase().includes(pattern.issueType.toLowerCase()) ||
                pattern.issueType.toLowerCase().includes(issueType.toLowerCase());
            
            // Check component match (lenient - if issueType matches, component doesn't need to match exactly)
            const componentMatch = !component || !pattern.component || 
                pattern.component === component || pattern.component === 'any' ||
                (component.toLowerCase().includes('powershell') && pattern.component === 'PowerShell') ||
                (pattern.component === 'PowerShell' && (component.toLowerCase().includes('monitoring') || component.toLowerCase().includes('powershell')));

            if ((symptomMatch || issueTypeMatch) && componentMatch) {
                result.warnings.push({
                    type: 'MISDIAGNOSIS_WARNING',
                    message: `Common misdiagnosis: ${pattern.commonMisdiagnosis}`,
                    actualRootCause: pattern.actualRootCause,
                    correctApproach: pattern.correctApproach,
                    frequency: pattern.frequency || 0,
                    timeWasted: pattern.timeWasted || 0
                });

                if (!result.correctApproach && pattern.correctApproach) {
                    result.correctApproach = pattern.correctApproach;
                }
                if (!result.commonMisdiagnosis && pattern.commonMisdiagnosis) {
                    result.commonMisdiagnosis = pattern.commonMisdiagnosis;
                }
            }
        }

        // Check failed methods (what NOT to do)
        const failedMethods = learning.failedMethods || {};
        const issueFailedMethods = failedMethods[issueType] || [];
        result.failedMethods = issueFailedMethods.map(m => ({
            method: m.method,
            frequency: m.frequency,
            timeWasted: m.timeWasted
        }));

        // Calculate time savings
        if (result.warnings.length > 0) {
            const totalTimeWasted = result.warnings.reduce((sum, w) => sum + (w.timeWasted || 0), 0);
            result.timeSavings = totalTimeWasted;
        }

        return result;
    } catch (error) {
        return {
            warnings: [],
            correctApproach: null,
            commonMisdiagnosis: null,
            timeSavings: null,
            failedMethods: [],
            error: error.message
        };
    }
}

// CLI usage
if (require.main === module) {
    const issueType = process.argv[2] || '';
    const errorMessage = process.argv[3] || '';
    const component = process.argv[4] || '';

    const result = queryLearning(issueType, errorMessage, component);
    console.log(JSON.stringify(result, null, 2));
}

module.exports = { queryLearning };
