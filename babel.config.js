/**
 * Reanimated's worklets plugin has to be last in the list. Without it the
 * spring physics that carry this app's motion silently fall back to nothing.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
