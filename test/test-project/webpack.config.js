// @ts-check

const path = require('path');
const { StartServerPlugin } = require('../..');

/** @type {import('webpack').Configuration} */
module.exports = {
  mode: 'development',
  context: __dirname,
  target: 'node',
  plugins: [new StartServerPlugin({ once: true })],
  output: {
    path: path.join(__dirname, 'build'),
    filename: 'server.js',
  },
};
