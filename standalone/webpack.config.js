/* eslint-disable @typescript-eslint/no-var-requires */

const exec = require('child_process').exec;
const path = require('path');

const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

const PLUGIN_ID = require('../plugin.json').id;

const NPM_TARGET = process.env.npm_lifecycle_event; //eslint-disable-line no-process-env
let mode = 'production';
let devtool = false;
let contentSecurity = 'script-src \'self\'';
if (NPM_TARGET === 'debug' || NPM_TARGET === 'debug:watch') {
    mode = 'development';
    devtool = 'eval-cheap-module-source-map';
    contentSecurity += ' \'unsafe-eval\'';
}

const plugins = [
    new webpack.ProvidePlugin({
        process: 'process/browser.js',
    }),
    new HtmlWebpackPlugin({
        title: 'Calls Widget',
        template: path.join(__dirname, '/src/widget/index.html'),
        filename: 'widget.html',
        publicPath: '',
        inject: 'head',
        meta: {
            'Content-Security-Policy': {'http-equiv': 'Content-Security-Policy', content: contentSecurity},
        },
        chunks: ['widget'],
    }),
    new HtmlWebpackPlugin({
        title: 'Calls Recording',
        template: path.join(__dirname, '/src/recording/index.html'),
        filename: 'recording.html',
        publicPath: '',
        inject: 'head',
        meta: {
            'Content-Security-Policy': {'http-equiv': 'Content-Security-Policy', content: contentSecurity},
        },
        chunks: ['recording'],
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
    entry: {
        widget: './src/widget/index.tsx',
        recording: './src/recording/index.tsx',
    },
    output: {
        devtoolNamespace: PLUGIN_ID,
        path: path.join(__dirname, '/dist'),
        publicPath: 'auto',
        filename: '[name].[contenthash].js',
        clean: true,
    },
    resolve: {
        alias: {
            src: path.resolve(__dirname, './src/'),
            '@mattermost/types': path.resolve(__dirname, '../webapp/mattermost-webapp/webapp/platform/types/src/'),
            '@mattermost/client': path.resolve(__dirname, '../webapp/mattermost-webapp/webapp/platform/client/src/'),
            'mattermost-redux': path.resolve(__dirname, '../webapp/mattermost-webapp/webapp/channels/src/packages/mattermost-redux/src/'),
            reselect: path.resolve(__dirname, '../webapp/mattermost-webapp/webapp/channels/src/packages/mattermost-redux/src/selectors/create_selector/index'),
            'mattermost-webapp': path.resolve(__dirname, '../webapp/mattermost-webapp/webapp/channels/src/'),
            plugin: path.resolve(__dirname, '../webapp/src'),
            utils: path.resolve(__dirname, '../webapp/mattermost-webapp/webapp/channels/src/sass/utils/'),
            images: path.resolve(__dirname, '../webapp/mattermost-webapp/webapp/channels/src/images/'),
            react: path.resolve(__dirname, './node_modules/react'),
            'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
            'react-bootstrap': path.resolve(__dirname, './node_modules/react-bootstrap'),
            bootstrap: path.resolve(__dirname, './node_modules/bootstrap'),
            'react-redux': path.resolve(__dirname, './node_modules/react-redux'),
            'react-intl': path.resolve(__dirname, './node_modules/react-intl'),
            redux: path.resolve(__dirname, './node_modules/redux'),
        },
        fallback: {
            src: path.resolve(__dirname, '../webapp/src'),
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
                        options: {
                            sassOptions: {
                                includePaths: [path.join(__dirname, 'node_modules/mattermost-webapp'),
                                    path.join(__dirname, 'node_modules/mattermost-webapp/sass')],
                            },
                        },
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
                type: 'javascript/auto',
                test: /\.json$/,
                include: [
                    path.resolve(__dirname, './i18n'),
                    path.resolve(__dirname, '../webapp/i18n'),
                ],
                exclude: [/en\.json$/],
                use: [
                    {
                        loader: 'file-loader?name=i18n/[name].[contenthash].[ext]',
                    },
                ],
            },
        ],
    },
    devtool,
    mode,
    plugins,
};
