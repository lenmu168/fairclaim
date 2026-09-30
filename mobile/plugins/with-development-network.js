const { withAndroidManifest } = require('expo/config-plugins')
module.exports = (config) =>
  withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0]
    const allow =
      process.env.EAS_BUILD_PROFILE !== 'production' &&
      (process.env.EAS_BUILD_PROFILE === 'development' || process.env.ALLOW_LOCAL_HTTP === 'true')
    if (app) app.$['android:usesCleartextTraffic'] = allow ? 'true' : 'false'
    return mod
  })
