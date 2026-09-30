import type { ExpoConfig, ConfigContext } from 'expo/config'
export default ({ config }: ConfigContext): ExpoConfig => {
  const production = process.env.EAS_BUILD_PROFILE === 'production'
  if (production) {
    const api = new URL(process.env.EXPO_PUBLIC_API_URL ?? '')
    const siws = new URL(process.env.EXPO_PUBLIC_SIWS_URI ?? '')
    const domain = process.env.EXPO_PUBLIC_SIWS_DOMAIN
    const cleanOrigin = (url: URL) =>
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === '/' || url.pathname === '')
    if (!domain || !cleanOrigin(api) || !cleanOrigin(siws) || api.origin !== siws.origin || siws.host !== domain)
      throw new Error('Production requires one matching HTTPS API and SIWS origin.')
  }
  return {
    ...config,
    name: 'FairClaim',
    slug: 'fairclaim',
    scheme: 'fairclaim',
    version: '0.1.0',
    userInterfaceStyle: 'dark',
    android: { ...config.android, package: 'app.fairclaim.mobile' },
    plugins: [...(config.plugins ?? []), './plugins/with-development-network', './plugins/with-dev-menu-header-only'],
  }
}
