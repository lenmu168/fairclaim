import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createSolanaMainnet, MobileWalletProvider } from '@wallet-ui/react-native-kit'
import { Tabs } from 'expo-router/js-tabs'
import { StatusBar } from 'expo-status-bar'
import Ionicons from '@expo/vector-icons/Ionicons'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { FairClaimRouteIcon } from '../components/fairclaim/FairClaimLogo'
import { colors, NAV_DOCK_HEIGHT } from '../components/ui'
import { LanguageProvider, useLanguage } from '../i18n'
import { SIWS_URI } from '../lib/api'
import { palette } from '../theme/tokens'
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })
// The public URL configures MWA's chain only. All entitlement reads use the backend.
const cluster = createSolanaMainnet({ url: 'https://api.mainnet-beta.solana.com' })
const identity = { name: 'FairClaim', ...(SIWS_URI ? { uri: SIWS_URI } : {}) }
function Navigation() {
  const { copy } = useLanguage()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: palette.mint,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: 'rgba(8,13,20,0.97)',
          borderTopColor: palette.border,
          borderTopWidth: 1,
          height: NAV_DOCK_HEIGHT,
          paddingTop: 7,
          shadowColor: palette.cyan,
          shadowOpacity: 0.14,
          shadowRadius: 16,
          elevation: 12,
        },
        tabBarLabelStyle: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: copy.tabs.claim,
          tabBarIcon: ({ color, size }) => <FairClaimRouteIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="builder"
        options={{
          title: copy.tabs.builder,
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <MobileWalletProvider cluster={cluster} identity={identity}>
            <StatusBar style="light" />
            <Navigation />
          </MobileWalletProvider>
        </QueryClientProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  )
}
