module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/server.js',
        '!src/setup.js',
        '!src/testing/**/*.js'
    ],
    coverageDirectory: 'coverage',
    verbose: true
};

