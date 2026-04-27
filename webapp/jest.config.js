// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const config = {
    testPathIgnorePatterns: [
        '/node_modules/',
        '/non_npm_dependencies/',
        '/mattermost-webapp/',
    ],
    clearMocks: true,
    collectCoverage: true,
    collectCoverageFrom: [
        './src/**/*.{js,jsx,ts,tsx}',
        '!./src/segmenter/**',
    ],
    coverageReporters: [
        'text',
        'text-summary',
        'lcov',
    ],
    moduleNameMapper: {
        '^.+\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': 'identity-obj-proxy',
        '^.+\\.(css|less|scss)$': 'identity-obj-proxy',
        '^.*i18n.*\\.(json)$': '<rootDir>/tests/i18n_mock.json',
        '^bundle-loader\\?lazy\\!(.*)$': '$1',
        '^@mattermost/types/(.*)$': '<rootDir>/mattermost-webapp/webapp/platform/types/src/$1',
        '^@mattermost/client$': '<rootDir>/mattermost-webapp/webapp/platform/client/src/index',
        '^@mattermost/client/(.*)$': '<rootDir>/mattermost-webapp/webapp/platform/client/src/$1',
        '^mattermost-redux(.*)$': '<rootDir>/mattermost-webapp/webapp/channels/src/packages/mattermost-redux/src$1',
        '^reselect': '<rootDir>/mattermost-webapp/webapp/channels/src/packages/mattermost-redux/src/selectors/create_selector/index',
        '^src/segmenter$': '<rootDir>/src/segmenter/__mocks__/index.ts',
    },
    moduleDirectories: [
        '',
        'node_modules',
        'non_npm_dependencies',
    ],
    reporters: [
        'default',
        'jest-junit',
    ],
    transformIgnorePatterns: [
        'node_modules/(?!react-native|react-router|mattermost-webapp|semver-parser|@mattermost/calls-common)',
    ],
    setupFiles: [
        'jest-canvas-mock',
    ],
    setupFilesAfterEnv: [
        '<rootDir>/src/setup_jest.ts',
    ],
    testEnvironment: 'jsdom',
    testEnvironmentOptions: {
        url: 'http://localhost:8065',
    },
};

module.exports = config;
