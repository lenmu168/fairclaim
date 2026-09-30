import { useState, type PropsWithChildren } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useLanguage } from '../i18n'
import { palette, radii, typography } from '../theme/tokens'
export const colors = {
  bg: palette.background,
  card: palette.surface,
  border: palette.border,
  green: palette.lime,
  teal: palette.cyan,
  text: palette.text,
  muted: palette.textSecondary,
  red: palette.blocked,
}
export const NAV_DOCK_HEIGHT = 68
export const NAV_CONTENT_GAP = 18
export function Page({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets()
  const bottomContentPadding = NAV_DOCK_HEIGHT + insets.bottom + NAV_CONTENT_GAP
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="cyan-atmosphere" cx="82%" cy="8%" rx="72%" ry="44%">
              <Stop offset="0" stopColor="#38DCF2" stopOpacity="0.16" />
              <Stop offset="0.52" stopColor="#38DCF2" stopOpacity="0.035" />
              <Stop offset="1" stopColor="#05070B" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="violet-atmosphere" cx="8%" cy="64%" rx="56%" ry="34%">
              <Stop offset="0" stopColor="#826BFF" stopOpacity="0.075" />
              <Stop offset="1" stopColor="#05070B" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#cyan-atmosphere)" />
          <Rect width="100%" height="100%" fill="url(#violet-atmosphere)" />
        </Svg>
        {[28, 92, 156, 220, 284, 348].map((left) => (
          <View
            key={left}
            style={{
              position: 'absolute',
              top: 0,
              left,
              bottom: 0,
              width: 1,
              backgroundColor: 'rgba(102,224,213,0.035)',
            }}
          />
        ))}
        {[120, 260, 400, 540, 680, 820].map((top) => (
          <View
            key={top}
            style={{
              position: 'absolute',
              top,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: 'rgba(102,224,213,0.025)',
            }}
          />
        ))}
      </View>
      <ScrollView
        contentContainerStyle={[s.page, { paddingBottom: bottomContentPadding }]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}
export function Label({ children }: PropsWithChildren) {
  return <Text style={s.label}>{children}</Text>
}
export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[s.card, style]}>{children}</View>
}
export function Button({
  title,
  onPress,
  disabled,
  loading,
  secondary,
}: {
  title: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  secondary?: boolean
}) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 })
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout
        setBounds((current) => (current.width === width && current.height === height ? current : { width, height }))
      }}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.78, transform: [{ scale: 0.985 }] },
      ]}
    >
      {!secondary && bounds.width > 0 && bounds.height > 0 && (
        <Svg pointerEvents="none" width={bounds.width} height={bounds.height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="primary-button" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#68F5C2" />
              <Stop offset="0.58" stopColor="#38DCF2" />
              <Stop offset="1" stopColor="#826BFF" />
            </LinearGradient>
          </Defs>
          <Rect width={bounds.width} height={bounds.height} rx={radii.md} fill="url(#primary-button)" />
        </Svg>
      )}
      {loading && <ActivityIndicator color={secondary ? colors.green : colors.bg} />}
      <Text style={[s.buttonText, secondary && { color: colors.text }]}>{title}</Text>
    </Pressable>
  )
}
export function DevBanner({ active }: { active?: boolean }) {
  const { copy } = useLanguage()
  return active ? (
    <View style={s.banner}>
      <Text style={{ color: palette.warning, fontWeight: '900', letterSpacing: 0.8 }}>{copy.modes.bypass}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{copy.modes.bypassBody}</Text>
    </View>
  ) : null
}
export function VerifyOnlyBanner({ active }: { active?: boolean }) {
  const { copy } = useLanguage()
  return active ? (
    <View style={[s.banner, { borderColor: palette.cyan }]}>
      <Text style={{ color: palette.cyan, fontWeight: '900', letterSpacing: 1 }}>{copy.modes.verifyOnly}</Text>
      <Text style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>{copy.modes.verifyOnlyBody}</Text>
      <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>{copy.modes.noFunds}</Text>
    </View>
  ) : null
}
export function ClaimTestBanner({ active }: { active?: boolean }) {
  const { copy } = useLanguage()
  return active ? (
    <View
      style={[
        s.banner,
        {
          backgroundColor: '#070B11',
          borderColor: 'rgba(104,245,194,0.46)',
          paddingHorizontal: 11,
          paddingVertical: 9,
          gap: 4,
        },
      ]}
    >
      <View style={s.row}>
        <Text style={{ color: palette.mint, fontWeight: '800', fontSize: 10, letterSpacing: 0.9 }}>
          {copy.modes.claimTest}
        </Text>
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: palette.mint }} />
      </View>
      <Text style={{ color: colors.muted, fontSize: 10, lineHeight: 14 }}>{copy.modes.demoSafety}</Text>
    </View>
  ) : null
}
export const s = StyleSheet.create({
  page: { padding: 18, gap: 17 },
  brand: { color: colors.text, fontSize: 17, fontWeight: '900', letterSpacing: 3 },
  label: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: typography.trackingLabel,
    textTransform: 'uppercase',
  },
  title: { color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: '900', letterSpacing: -1.25 },
  h2: { color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.7 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  value: { color: colors.text, fontSize: 15, fontWeight: '700' },
  card: {
    backgroundColor: 'rgba(13,20,29,0.94)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 18,
    gap: 14,
    shadowColor: palette.cyan,
    shadowOpacity: 0.045,
    shadowRadius: 14,
    elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  divider: { height: 1, backgroundColor: colors.border },
  button: {
    minHeight: 56,
    width: '100%',
    borderRadius: radii.md,
    padding: 16,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: palette.cyan,
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 4,
  },
  secondary: { backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: colors.border },
  buttonText: {
    color: colors.bg,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: typography.trackingButton,
    textAlign: 'center',
  },
  banner: {
    padding: 15,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.warning,
    borderRadius: radii.md,
    gap: 6,
  },
  error: { color: colors.red, fontSize: 14, lineHeight: 21 },
  pill: {
    borderRadius: radii.pill,
    backgroundColor: 'rgba(104,245,194,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(104,245,194,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: { color: palette.mint, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
})
