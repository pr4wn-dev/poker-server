module.exports = {
    env: {
        node: true,
        es2021: true
    },
    extends: 'eslint:recommended',
    rules: {
        // Enforce no console usage (except in allowed files)
        'no-console': ['error', {
            allow: [] // No console methods allowed
        }]
    },
    overrides: [
        {
            // Allow console.log only in CLI integration files
            files: ['monitoring/integration/cerberus-integration.js', 'monitoring/test-*.js'],
            rules: {
                'no-console': 'off' // Allow console in CLI tools
            }
        }
    ]
};
