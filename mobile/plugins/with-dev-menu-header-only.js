const { withAndroidManifest } = require('expo/config-plugins')

module.exports = (config) =>
  withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0]
    if (!app) return mod

    const name = 'EXDevMenuShowFloatingActionButton'
    const entries = app['meta-data'] ?? []
    const existing = entries.find((entry) => entry.$?.['android:name'] === name)
    if (existing) {
      existing.$['android:value'] = 'false'
    } else {
      entries.push({ $: { 'android:name': name, 'android:value': 'false' } })
    }
    app['meta-data'] = entries
    return mod
  })
