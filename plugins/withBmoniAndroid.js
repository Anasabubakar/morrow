const { withProjectBuildGradle, withGradleProperties } = require('@expo/config-plugins');

const MAVEN_BLOCK = `
    maven {
        url "https://bkey-inc.github.io/package-distribution/maven"
        content { includeGroup "me.bkey.ip" }
    }`;

// BMONI's Android signer AAR ships an arm64-v8a slice only; the RN SDK docs
// require pinning reactNativeArchitectures to that single ABI or the native
// library fails to load at runtime on any other arch.
function withBmoniAndroid(config) {
  config = withProjectBuildGradle(config, config => {
    if (config.modResults.language !== 'groovy') return config;
    if (!config.modResults.contents.includes('bkey-inc.github.io')) {
      config.modResults.contents = config.modResults.contents.replace(
        /allprojects\s*{\s*repositories\s*{/,
        match => `${match}${MAVEN_BLOCK}`
      );
    }
    return config;
  });

  config = withGradleProperties(config, config => {
    const key = 'reactNativeArchitectures';
    const existing = config.modResults.find(item => item.type === 'property' && item.key === key);
    if (existing) {
      existing.value = 'arm64-v8a';
    } else {
      config.modResults.push({ type: 'property', key, value: 'arm64-v8a' });
    }
    return config;
  });

  return config;
}

module.exports = withBmoniAndroid;
