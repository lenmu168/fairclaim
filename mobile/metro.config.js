const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
config.cacheStores = ({ FileStore }) => [new FileStore({ root: path.join(__dirname, 'node_modules', '.cache', 'metro') })];
module.exports = config;
