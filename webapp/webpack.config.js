/* eslint-disable @typescript-eslint/no-var-requires */

const exec = require('child_process').exec;
const path = require('path');

const webpack = require('webpack');

const PLUGIN_ID = require('../plugin.json').id;

const NPM_TARGET = process.env.npm_lifecycle_event; //eslint-disable-line no-process-env
let mode = 'production';
let devtool = false;
if (NPM_TARGET === 'debug' || NPM_TARGET === 'debug:watch') {
    mode = 'development';
    devtool = 'eval-cheap-module-source-map';
}

const plugins = [
    new webpack.ProvidePlugin({
        process: 'process/browser.js',
    }),
];

if (NPM_TARGET === 'build:watch' || NPM_TARGET === 'debug:watch') {
    plugins.push({
        apply: (compiler) => {
            compiler.hooks.watchRun.tap('WatchStartPlugin', () => {
                // eslint-disable-next-line no-console
                console.log('Change detected. Rebuilding webapp.');
            });
            compiler.hooks.afterEmit.tap('AfterEmitPlugin', () => {
                exec('cd .. && make deploy-from-watch', (err, stdout, stderr) => {
                    if (stdout) {
                        process.stdout.write(stdout);
                    }
                    if (stderr) {
                        process.stderr.write(stderr);
                    }
                });
            });
        },
    });
}

module.exports = {
    entry: [
        './src/index.tsx',
    ],
    resolve: {
        alias: {
            src: path.resolve(__dirname, './src/'),
            '@mattermost/types': path.resolve(__dirname, './mattermost-webapp/webapp/platform/types/src/'),
            '@mattermost/client': path.resolve(__dirname, './mattermost-webapp/webapp/platform/client/src/'),
            'mattermost-redux': path.resolve(__dirname, './mattermost-webapp/webapp/channels/src/packages/mattermost-redux/src/'),
            reselect: path.resolve(__dirname, './mattermost-webapp/webapp/channels/src/packages/mattermost-redux/src/selectors/create_selector/index'),
        },
        modules: [
            'src',
            'node_modules',
        ],
        extensions: ['*', '.js', '.jsx', '.ts', '.tsx'],
        symlinks: false,
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx|ts|tsx)$/,
                exclude: /node_modules\/(?!(mattermost-webapp)\/).*/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        cacheDirectory: true,

                        // Babel configuration is in babel.config.js because jest requires it to be there.
                    },
                },
            },
            {
                test: /\.(scss|css)$/,
                use: [
                    'style-loader',
                    {
                        loader: 'css-loader',
                    },
                    {
                        loader: 'sass-loader',
                    },
                ],
            },
            {
                test: /\.(png|eot|tiff|svg|woff2|woff|ttf|gif|mp3|wav|jpg)$/,
                use: [
                    {
                        loader: 'file-loader',
                        options: {
                            name: 'files/[contenthash].[ext]',
                        },
                    },
                ],
            },
            {
                resourceQuery: /inline/,
                type: 'asset/inline',
            },
        ],
    },
    externals: {
        react: 'React',
        'react-dom': 'ReactDOM',
        redux: 'Redux',
        luxon: 'Luxon',
        'react-redux': 'ReactRedux',
        'prop-types': 'PropTypes',
        'react-bootstrap': 'ReactBootstrap',
        'react-router-dom': 'ReactRouterDom',
        'react-intl': 'ReactIntl',
    },
    output: {
        devtoolNamespace: PLUGIN_ID,
        path: path.join(__dirname, '/dist'),
        publicPath: '/',
        filename: 'main.js',
    },
    devtool,
    mode,
    plugins,
};
