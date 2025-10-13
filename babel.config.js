module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "^@/(.+)": "./src/\\1",
          },
        },
      ],
      [
        "react-native-unistyles/plugin",
        {
          root: "src", // ✅ correct way to pass your root folder
        },
      ],
      // ✅ Only keep this, remove the old reanimated one
      "react-native-reanimated/plugin",
      "react-native-worklets-core/plugin",
    ],
  };
};
