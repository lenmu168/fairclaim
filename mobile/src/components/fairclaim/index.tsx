import Ionicons from '@expo/vector-icons/Ionicons'
import { useState, type PropsWithChildren, type ReactNode } from 'react'
import { Pressable, Text, View, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useLanguage } from '../../i18n'
import { short } from '../../lib/api'
import { palette, radii, spacing } from '../../theme/tokens'
import { Card, Label, s } from '../ui'
import { FairClaimLogo } from './FairClaimLogo'

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 38,
        padding: 2,
        borderRadius: radii.pill,
        backgroundColor: 'rgba(8,13,20,0.84)',
        borderWidth: 1,
        borderColor: palette.borderBright,
      }}
    >
      {(['en', 'zh'] as const).map((value) => (
        <Pressable
          key={value}
          accessibilityRole="button"
          accessibilityState={{ selected: language === value }}
          onPress={() => setLanguage(value)}
          style={{
            minWidth: 38,
            height: 32,
            paddingHorizontal: 8,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radii.pill,
            backgroundColor: language === value ? 'rgba(56,220,242,0.12)' : 'transparent',
            borderWidth: language === value ? 1 : 0,
            borderColor: palette.borderBright,
          }}
        >
          <Text
            style={{
              color: language === value ? palette.mint : palette.textSecondary,
              fontSize: 10,
              fontWeight: '800',
            }}
          >
            {value === 'en' ? 'EN' : '中文'}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

export function BrandHeader({ devControl }: { devControl?: ReactNode } = {}) {
  const { copy } = useLanguage()
  return (
    <View style={[s.row, { minHeight: 46, alignItems: 'center' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, flexShrink: 1 }}>
        <View style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <FairClaimLogo size={40} />
        </View>
        <View style={{ flexShrink: 1, alignItems: 'flex-start' }}>
          <Text style={{ color: palette.text, fontSize: 21, lineHeight: 25, fontWeight: '900', letterSpacing: -0.7 }}>
            Fair<Text style={{ color: palette.cyan }}>Claim</Text>
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: palette.textSecondary,
              fontSize: 8,
              lineHeight: 11,
              fontWeight: '800',
              letterSpacing: 1.35,
            }}
          >
            {copy.brand.descriptor}
          </Text>
        </View>
      </View>
      <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <LanguageToggle />
        {devControl}
      </View>
    </View>
  )
}

export function StatusBadge({ label, tone = 'success' }: { label: string; tone?: 'success' | 'blocked' | 'neutral' }) {
  const color = tone === 'success' ? palette.mint : tone === 'blocked' ? palette.blocked : palette.cyan
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: radii.pill,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: `${color}12`,
        borderWidth: 1,
        borderColor: `${color}44`,
      }}
    >
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>{label}</Text>
    </View>
  )
}

export function TrustGrid({
  items,
}: {
  items: { icon: keyof typeof Ionicons.glyphMap; label: string; tone?: 'mint' | 'cyan' | 'violet' }[]
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 7 }}>
      {items.map((item) => {
        const color = item.tone === 'violet' ? palette.violet : item.tone === 'cyan' ? palette.cyan : palette.mint
        return (
          <View
            key={item.label}
            style={{
              flex: 1,
              minWidth: 0,
              height: 84,
              alignItems: 'center',
              paddingHorizontal: 6,
              paddingVertical: 8,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: 'rgba(102,224,213,0.10)',
              backgroundColor: 'rgba(13,20,29,0.64)',
            }}
          >
            <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={item.icon} size={18} color={color} />
            </View>
            <View style={{ height: 28, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-start' }}>
              <Text
                numberOfLines={2}
                style={{
                  color: palette.textSecondary,
                  fontSize: 9,
                  lineHeight: 13,
                  fontWeight: '800',
                  textAlign: 'center',
                  letterSpacing: 0.45,
                  includeFontPadding: false,
                }}
              >
                {item.label}
              </Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

export function ProtocolAtmosphere({ success = false }: { success?: boolean }) {
  const height = success ? 170 : 128
  return (
    <View
      style={{
        height,
        overflow: 'hidden',
        borderRadius: radii.lg,
        backgroundColor: '#050A12',
      }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 360 170" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="horizon" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#050A12" stopOpacity="1" />
            <Stop offset="0.58" stopColor="#071625" stopOpacity="1" />
            <Stop offset="1" stopColor="#05070B" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="hero-detail-fade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#2B8FEF" stopOpacity="0.32" />
            <Stop offset="0.58" stopColor="#2B8FEF" stopOpacity="0.3" />
            <Stop offset="0.68" stopColor="#2B8FEF" stopOpacity="0.08" />
            <Stop offset="0.74" stopColor="#2B8FEF" stopOpacity="0" />
            <Stop offset="1" stopColor="#2B8FEF" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="hero-success-detail-fade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#2B8FEF" stopOpacity="0.24" />
            <Stop offset="0.32" stopColor="#2B8FEF" stopOpacity="0.04" />
            <Stop offset="0.4" stopColor="#2B8FEF" stopOpacity="0" />
            <Stop offset="0.6" stopColor="#2B8FEF" stopOpacity="0" />
            <Stop offset="0.68" stopColor="#2B8FEF" stopOpacity="0.04" />
            <Stop offset="1" stopColor="#2B8FEF" stopOpacity="0.24" />
          </LinearGradient>
          <LinearGradient id="hero-grid-fade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#2B8FEF" stopOpacity="0.08" />
            <Stop offset="0.58" stopColor="#2B8FEF" stopOpacity="0.08" />
            <Stop offset="0.68" stopColor="#2B8FEF" stopOpacity="0.02" />
            <Stop offset="0.74" stopColor="#2B8FEF" stopOpacity="0" />
            <Stop offset="1" stopColor="#2B8FEF" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width="360" height="170" fill="url(#horizon)" />
        <Path
          d="M0 139 38 119 68 136 105 111 138 140 178 122 216 142 258 115 294 138 329 123 360 140"
          fill="none"
          stroke={success ? 'url(#hero-success-detail-fade)' : 'url(#hero-detail-fade)'}
          strokeWidth="1.1"
        />
        <Path
          d="M0 145 48 132 83 143 121 127 157 146 198 133 232 147 276 129 315 144 360 134"
          fill="none"
          stroke={success ? 'url(#hero-success-detail-fade)' : 'url(#hero-detail-fade)'}
          strokeWidth="0.9"
        />
        {!success &&
          [30, 76, 122, 168, 214].map((x) => (
            <Path key={x} d={`M180 126 ${x} 170`} stroke="#2B8FEF" strokeOpacity="0.09" strokeWidth="0.8" />
          ))}
        {[138, 150, 160, 168].map((y) => (
          <Path
            key={y}
            d={`M0 ${y}h360`}
            stroke={success ? 'url(#hero-success-detail-fade)' : 'url(#hero-grid-fade)'}
            strokeWidth="0.8"
          />
        ))}
      </Svg>
      <View
        style={{
          position: 'absolute',
          right: success ? 104 : 19,
          bottom: success ? 20 : 16,
        }}
      >
        <FairClaimLogo size={success ? 117 : 67} />
      </View>
    </View>
  )
}

export type ClaimRightState = 'available' | 'used' | 'blocked' | 'unavailable'

export function ClaimRightIndicator({ state }: { state: ClaimRightState }) {
  const { copy } = useLanguage()
  const unavailable = state === 'unavailable'
  const used = state === 'used' || state === 'blocked'
  const color =
    state === 'blocked' ? palette.blocked : unavailable ? palette.textMuted : used ? palette.cyan : palette.mint
  return (
    <View
      style={{
        minWidth: 124,
        paddingVertical: 4,
        paddingLeft: 14,
        borderLeftWidth: 2,
        borderLeftColor: color,
        gap: 5,
      }}
    >
      <Label>{copy.access.claimRight}</Label>
      <Text
        style={{
          color: unavailable ? palette.textSecondary : palette.text,
          fontSize: unavailable ? 18 : 31,
          lineHeight: unavailable ? 23 : 34,
          fontWeight: '900',
          letterSpacing: unavailable ? 0.2 : -1.4,
        }}
      >
        {unavailable ? copy.access.statusUnavailable : state === 'blocked' ? copy.access.used : '01 / 01'}
      </Text>
      <Text style={{ color, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }}>
        {unavailable
          ? copy.access.serverRequired
          : state === 'available'
            ? copy.access.available
            : state === 'blocked'
              ? copy.access.alreadyUsed
              : copy.access.used}
      </Text>
    </View>
  )
}

export function GenesisAccessCard({
  campaignId,
  campaignStatus,
  campaignActive,
  state,
  verified,
}: {
  campaignId?: string
  campaignStatus: string
  campaignActive: boolean
  state: ClaimRightState
  verified: boolean
}) {
  const { copy } = useLanguage()
  const activeColor =
    state === 'blocked'
      ? palette.blocked
      : state === 'unavailable'
        ? palette.textMuted
        : verified
          ? palette.mint
          : palette.cyan
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 })
  return (
    <View
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout
        setCardSize((current) => (current.width === width && current.height === height ? current : { width, height }))
      }}
      style={{
        overflow: 'hidden',
        borderRadius: radii.xl,
        backgroundColor: palette.surfaceStrong,
        padding: 18,
        gap: 15,
        shadowColor: activeColor,
        shadowOpacity: 0.07,
        shadowRadius: 14,
        elevation: 2,
      }}
    >
      {cardSize.width > 0 && cardSize.height > 0 && (
        <Svg
          pointerEvents="none"
          width={cardSize.width}
          height={cardSize.height}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <Defs>
            <LinearGradient id="credential-edge" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#68F5C2" stopOpacity="0.9" />
              <Stop offset="0.5" stopColor="#38DCF2" stopOpacity="0.5" />
              <Stop offset="1" stopColor="#826BFF" stopOpacity="0.62" />
            </LinearGradient>
            <LinearGradient id="credential-grid-fade" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#38DCF2" stopOpacity="0.11" />
              <Stop offset="0.52" stopColor="#38DCF2" stopOpacity="0.1" />
              <Stop offset="0.64" stopColor="#38DCF2" stopOpacity="0.025" />
              <Stop offset="0.72" stopColor="#38DCF2" stopOpacity="0" />
              <Stop offset="0.92" stopColor="#38DCF2" stopOpacity="0" />
              <Stop offset="1" stopColor="#38DCF2" stopOpacity="0.045" />
            </LinearGradient>
          </Defs>
          {[38, 82, 126, 170, 214, 258].map((top) => (
            <Path key={top} d={`M0 ${top}H${cardSize.width}`} stroke="url(#credential-grid-fade)" strokeWidth="1" />
          ))}
          {[58, 146].map((left) => (
            <Path
              key={left}
              d={`M${left} 0V${cardSize.height}`}
              stroke="#38DCF2"
              strokeOpacity="0.045"
              strokeWidth="1"
            />
          ))}
          <Path d={`M234 0V48 M234 158V${cardSize.height}`} stroke="#38DCF2" strokeOpacity="0.035" strokeWidth="1" />
          <Rect
            x={0.75}
            y={0.75}
            width={Math.max(cardSize.width - 1.5, 0)}
            height={Math.max(cardSize.height - 1.5, 0)}
            rx={radii.xl - 0.75}
            fill="none"
            stroke="url(#credential-edge)"
            strokeWidth={1.5}
          />
        </Svg>
      )}
      <View style={s.row}>
        <Label>{copy.access.microLabel}</Label>
        <StatusBadge
          label={verified ? copy.access.verified : campaignStatus}
          tone={verified ? 'success' : campaignActive ? 'neutral' : 'blocked'}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: '60%', gap: 5 }}>
          <Text style={{ color: palette.text, fontSize: 21, lineHeight: 26, fontWeight: '800', letterSpacing: -0.9 }}>
            {copy.access.title}
          </Text>
          <Text style={{ color: palette.textSecondary, fontSize: 13, lineHeight: 18 }}>{copy.access.subtitle}</Text>
        </View>
        <View
          style={{
            width: '40%',
            height: 76,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FairClaimLogo size={67} outerColor="#E8EBEE" />
        </View>
      </View>
      <ClaimRightIndicator state={state} />
      <View>
        {[
          [
            copy.access.sgt,
            state === 'unavailable' ? copy.access.unavailable : verified ? copy.access.verified : copy.access.required,
          ],
          [copy.access.eligibility, copy.access.deviceUnique],
          [copy.access.protection, copy.access.protectionValue.toUpperCase()],
          [copy.access.network, 'SOLANA MAINNET'],
        ].map(([label, value], index) => (
          <View
            key={label}
            style={{
              minHeight: 43,
              height: 43,
              flexDirection: 'row',
              alignItems: 'center',
              borderTopWidth: index === 0 ? 1 : 0,
              borderBottomWidth: 1,
              borderColor: palette.border,
            }}
          >
            <View style={{ width: '42%', justifyContent: 'center' }}>
              <Label>{label}</Label>
            </View>
            <View style={{ width: '58%', flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: index === 0 ? activeColor : palette.cyan,
                }}
              />
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: palette.text,
                  fontSize: 10,
                  lineHeight: 14,
                  fontWeight: '800',
                  textAlign: 'right',
                }}
              >
                {value}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ height: 1, backgroundColor: palette.border }} />
      <View style={{ gap: 5 }}>
        <Label>{copy.access.campaignId}</Label>
        <Text numberOfLines={1} style={{ color: palette.textSecondary, fontSize: 10, fontFamily: 'monospace' }}>
          {campaignId ? short(campaignId) : '—'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <Text style={{ color: palette.mint, fontSize: 9, fontWeight: '800' }}>● {copy.access.deviceLinked}</Text>
        <Text style={{ color: palette.cyan, fontSize: 9, fontWeight: '800' }}>● {copy.access.fairclaimProtected}</Text>
      </View>
    </View>
  )
}

export function DataRow({ label, value, selectable = false }: { label: string; value: string; selectable?: boolean }) {
  return (
    <View style={{ gap: 5 }}>
      <Text
        style={{
          color: palette.textSecondary,
          fontSize: 9,
          fontWeight: '800',
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Text selectable={selectable} style={{ color: palette.text, fontSize: 14, fontWeight: '700', lineHeight: 20 }}>
        {value}
      </Text>
    </View>
  )
}

export function SecuritySummaryRow({
  icon,
  label,
  value,
  selectable = false,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
  selectable?: boolean
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: palette.border,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(56,220,242,0.07)',
        }}
      >
        <Ionicons name={icon} size={14} color={palette.cyan} />
      </View>
      <Text style={{ width: 88, color: palette.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.45 }}>
        {label}
      </Text>
      <Text
        selectable={selectable}
        style={{ flex: 1, color: palette.text, fontSize: 11, lineHeight: 16, fontWeight: '600' }}
      >
        {value}
      </Text>
    </View>
  )
}

export function VerifiedIdentityCard({
  eyebrow,
  title,
  rows,
}: {
  eyebrow: string
  title: string
  rows: { label: string; value: string; selectable?: boolean }[]
}) {
  return (
    <Card style={{ borderColor: palette.borderBright, backgroundColor: palette.surfaceStrong }}>
      <View style={s.row}>
        <View style={{ gap: 7, flexShrink: 1 }}>
          <Label>{eyebrow}</Label>
          <Text style={[s.h2, { color: palette.mint }]}>{title}</Text>
        </View>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(104,245,194,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(104,245,194,0.32)',
          }}
        >
          <FairClaimLogo size={30} />
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: palette.border }} />
      <View style={{ gap: spacing.lg }}>
        {rows.map((row) => (
          <DataRow key={row.label} {...row} />
        ))}
      </View>
    </Card>
  )
}

export function SecurityRecordCard({
  eyebrow,
  title,
  subtitle,
  tone = 'success',
  children,
  style,
}: PropsWithChildren<{
  eyebrow: string
  title: string
  subtitle?: string
  tone?: 'success' | 'blocked'
  style?: ViewStyle
}>) {
  const color = tone === 'blocked' ? palette.blocked : palette.mint
  return (
    <Card style={{ borderColor: `${color}66`, backgroundColor: palette.surfaceStrong, ...style }}>
      <View style={s.row}>
        <View style={{ gap: 8, flex: 1 }}>
          <Label>{eyebrow}</Label>
          <Text style={[s.h2, { color }]}>{title}</Text>
          {!!subtitle && <Text style={s.body}>{subtitle}</Text>}
        </View>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: `${color}66`,
            backgroundColor: `${color}12`,
          }}
        >
          {tone === 'blocked' ? (
            <Ionicons name="lock-closed-outline" size={25} color={color} />
          ) : (
            <FairClaimLogo size={29} />
          )}
        </View>
      </View>
      {children}
    </Card>
  )
}

export function MetricCard({
  label,
  value,
  loading = false,
  tone = 'mint',
  supportingText,
}: {
  label: string
  value?: string | number
  loading?: boolean
  tone?: 'mint' | 'cyan' | 'violet' | 'muted'
  supportingText?: string
}) {
  const color =
    tone === 'cyan'
      ? palette.cyan
      : tone === 'violet'
        ? palette.violet
        : tone === 'muted'
          ? palette.textMuted
          : palette.mint
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        height: 154,
        backgroundColor: palette.surfaceStrong,
        borderWidth: 1,
        borderColor: tone === 'muted' ? 'rgba(150,163,178,0.065)' : palette.border,
        borderRadius: radii.lg,
        padding: 14,
        gap: 8,
      }}
    >
      <View style={{ height: 28, justifyContent: 'flex-start' }}>
        <Label>{label}</Label>
      </View>
      <View style={{ minHeight: 48, justifyContent: 'flex-start' }}>
        {loading ? (
          <MetricSkeleton compact />
        ) : (
          <Text
            style={{
              color,
              fontSize: tone === 'muted' ? 20 : 30,
              lineHeight: 34,
              fontWeight: '900',
              letterSpacing: -1.2,
            }}
          >
            {value}
          </Text>
        )}
      </View>
      {!!supportingText && (
        <Text numberOfLines={3} style={{ color: palette.textMuted, fontSize: 9, lineHeight: 13 }}>
          {supportingText}
        </Text>
      )}
    </View>
  )
}

export function MetricSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <View accessibilityLabel="Loading metric" style={{ gap: compact ? 6 : 9, paddingVertical: compact ? 4 : 8 }}>
      <View
        style={{
          width: compact ? '58%' : '42%',
          height: compact ? 20 : 36,
          borderRadius: 8,
          backgroundColor: 'rgba(104,245,194,0.09)',
          borderWidth: 1,
          borderColor: 'rgba(104,245,194,0.10)',
        }}
      />
      <View
        style={{
          width: compact ? '82%' : '64%',
          height: 5,
          borderRadius: 3,
          backgroundColor: 'rgba(150,163,178,0.10)',
        }}
      />
    </View>
  )
}
