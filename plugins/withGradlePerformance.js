const { withGradleProperties } = require("@expo/config-plugins");

/**
 * Config plugin to add Gradle performance optimization properties
 * These properties will persist across npx expo prebuild runs
 */
module.exports = function withGradlePerformance(config) {
  return withGradleProperties(config, (config) => {
    // Performance optimization properties
    const performanceProps = [
      {
        type: "property",
        key: "org.gradle.jvmargs",
        value:
          "-Xmx4g -XX:+UseParallelGC -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8",
      },
      {
        type: "property",
        key: "org.gradle.parallel",
        value: "true",
      },
      {
        type: "property",
        key: "org.gradle.caching",
        value: "true",
      },
      {
        type: "property",
        key: "org.gradle.configureondemand",
        value: "true",
      },
      {
        type: "property",
        key: "android.nonTransitiveRClass",
        value: "true",
      },
    ];

    // Add each property to the gradle.properties file
    performanceProps.forEach((prop) => {
      // Remove existing property if it exists to avoid duplicates
      config.modResults = config.modResults.filter(
        (item) => item.key !== prop.key
      );
      // Add the new property
      config.modResults.push(prop);
    });

    return config;
  });
};
