module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // Reanimated 4: the worklets plugin moved to react-native-worklets. Must stay last.
    plugins: ['react-native-worklets/plugin'],
  };
};
