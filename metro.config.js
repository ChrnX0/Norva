// Metro's defaults, plus the two things this app needs on the web.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `expo-sqlite` runs on the web through a WebAssembly build of SQLite, and its
// worker imports the .wasm file directly. Metro treats unknown extensions as
// source unless told otherwise, so without this the web bundle cannot resolve
// the database at all.
config.resolver.assetExts.push('wasm');

module.exports = config;
