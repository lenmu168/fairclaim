import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { openMenu } from 'expo-dev-client'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useQuery } from '@tanstack/react-query'
import { api, short, type Campaign, type Stats } from '../lib/api'
import { BrandHeader, MetricCard, MetricSkeleton, StatusBadge } from '../components/fairclaim'
import { Button, Card, DevBanner, Label, Page, s } from '../components/ui'
import { useLanguage } from '../i18n'
import { palette, radii } from '../theme/tokens'

const DEFAULT_ATTEMPT_COUNT = 4

function attemptColor(result: string) {
  if (result === 'SUCCESS') return palette.mint
  if (result === 'DUPLICATE_BLOCKED' || result === 'ERROR') return palette.blocked
  if (result === 'NO_SGT') return palette.textSecondary
  return palette.warning
}

function attemptLabel(result: string) {
  return result.replaceAll('_', ' ')
}

export default function BuilderPage() {
  const { copy } = useLanguage()
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const campaign = useQuery({
    queryKey: ['campaign', 'seeker-genesis-access'],
    queryFn: () => api<Campaign>('/api/campaigns/seeker-genesis-access'),
  })
  const stats = useQuery({
    queryKey: ['stats', campaign.data?.id],
    enabled: !!campaign.data,
    queryFn: () => api<Stats>(`/api/campaigns/${encodeURIComponent(campaign.data!.id)}/stats`),
  })
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<{ status: 'ok'; devSgtBypass: boolean }>('/health'),
    refetchInterval: 30_000,
  })
  useFocusEffect(
    useCallback(() => {
      void health.refetch()
      if (campaign.data) void stats.refetch()
    }, [campaign.data, health.refetch, stats.refetch]),
  )
  const data = stats.data
  const healthReady = health.isSuccess && health.isFetchedAfterMount && !health.isError && !health.isRefetchError
  const serverUnavailable =
    !healthReady || campaign.isError || campaign.isRefetchError || stats.isError || stats.isRefetchError
  const staleData = serverUnavailable && !!data
  const attempts = data?.recentAttempts ?? []
  const visibleAttempts = historyExpanded ? attempts : attempts.slice(0, DEFAULT_ATTEMPT_COUNT)
  const canToggleHistory = attempts.length > DEFAULT_ATTEMPT_COUNT
  return (
    <Page>
      <BrandHeader
        devControl={
          __DEV__ ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.dev.toggle}
              onPress={openMenu}
              style={({ pressed }) => ({
                width: 34,
                height: 34,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: palette.surfaceStrong,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="settings-outline" size={16} color={palette.textSecondary} />
            </Pressable>
          ) : undefined
        }
      />
      {__DEV__ && <DevBanner active={data?.devSgtBypass} />}
      {serverUnavailable && (
        <Card style={{ borderColor: palette.warning, backgroundColor: palette.surfaceStrong }}>
          <Label>{staleData ? copy.builder.stale : copy.builder.unavailable}</Label>
          {data && stats.dataUpdatedAt > 0 && (
            <Text style={s.body}>
              {copy.builder.lastSuccessfulUpdate} {new Date(stats.dataUpdatedAt).toLocaleString()}
            </Text>
          )}
          <Text style={s.error}>{copy.builder.error}</Text>
        </Card>
      )}
      <View style={{ gap: 10, paddingVertical: 8 }}>
        <Label>{copy.builder.eyebrow}</Label>
        <Text style={s.title}>{copy.builder.title}</Text>
        <Text style={s.body}>{copy.access.title}</Text>
      </View>
      <Card style={{ overflow: 'hidden', borderColor: palette.borderBright, backgroundColor: 'rgba(13,20,29,0.92)' }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.2 }}>
          {[42, 84, 126, 168].map((top) => (
            <View
              key={top}
              style={{ position: 'absolute', top, left: 0, right: 0, height: 1, backgroundColor: palette.border }}
            />
          ))}
        </View>
        <View style={s.row}>
          <Label>{copy.builder.unique}</Label>
          <StatusBadge label={copy.builder.active} />
        </View>
        {data ? (
          <Text style={{ color: palette.mint, fontSize: 58, lineHeight: 62, fontWeight: '900', letterSpacing: -3 }}>
            {data.uniqueSGTs}
          </Text>
        ) : (
          <MetricSkeleton />
        )}
        <Text style={s.body}>{data ? copy.builder.uniqueBody : copy.builder.loadingData}</Text>
      </Card>
      <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10 }}>
        <MetricCard
          label={copy.builder.duplicates}
          value={data?.duplicateAttempts}
          loading={!data}
          tone="violet"
          supportingText={copy.builder.duplicateBody}
        />
        <MetricCard
          label={copy.builder.failures}
          value={data?.failedAttempts}
          loading={!data}
          tone="muted"
          supportingText={copy.builder.failureHistory}
        />
      </View>
      <View style={s.row}>
        <Label>{copy.builder.protection}</Label>
        <StatusBadge
          tone={serverUnavailable || data?.devSgtBypass ? 'blocked' : 'success'}
          label={
            serverUnavailable
              ? staleData
                ? copy.builder.stale
                : copy.builder.unavailable
              : !data
                ? copy.builder.connecting
                : data.devSgtBypass
                  ? copy.builder.simulation
                  : copy.builder.active
          }
        />
      </View>
      <View style={s.row}>
        <Label>{copy.builder.recent}</Label>
        <Text style={[s.body, { fontSize: 10 }]}>
          {stats.dataUpdatedAt
            ? `${staleData ? copy.builder.lastSuccessfulUpdate : copy.builder.updated} ${new Date(stats.dataUpdatedAt).toLocaleTimeString()}`
            : ''}
        </Text>
      </View>
      <Card style={{ backgroundColor: palette.surfaceStrong, gap: 0 }}>
        {visibleAttempts.length ? (
          visibleAttempts.map((attempt, i) => (
            <View key={attempt.id} style={{ gap: 6, paddingVertical: 10 }}>
              {i > 0 && <View style={s.divider} />}
              <View style={s.row}>
                <Text
                  style={{
                    color: attemptColor(attempt.result),
                    fontSize: 11,
                    fontWeight: '900',
                    letterSpacing: 0.8,
                  }}
                >
                  {attemptLabel(attempt.result)}
                </Text>
                <Text style={[s.body, { fontSize: 11 }]}>{new Date(attempt.createdAt).toLocaleTimeString()}</Text>
              </View>
              <Text style={[s.value, { fontSize: 13 }]}>{short(attempt.walletAddress)}</Text>
              <Text selectable style={[s.body, { color: palette.textMuted, fontSize: 10, lineHeight: 14 }]}>
                {attempt.sgtMint ? `SGT ${short(attempt.sgtMint)} · ${attempt.reason}` : attempt.reason}
              </Text>
            </View>
          ))
        ) : (
          <Text style={s.body}>{copy.builder.empty}</Text>
        )}
      </Card>
      {canToggleHistory && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: historyExpanded }}
          onPress={() => setHistoryExpanded((expanded) => !expanded)}
          style={({ pressed }) => ({
            alignSelf: 'center',
            paddingHorizontal: 14,
            paddingVertical: 9,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Text style={{ color: palette.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>
            {historyExpanded ? copy.builder.collapse : copy.builder.viewAll}
          </Text>
        </Pressable>
      )}
      <Button
        secondary
        title={copy.builder.refresh}
        loading={stats.isFetching || campaign.isFetching}
        onPress={() => {
          void campaign.refetch()
          void health.refetch()
          if (campaign.data) void stats.refetch()
        }}
      />
      <Text style={[s.body, { fontSize: 11 }]}>{copy.builder.footnote}</Text>
    </Page>
  )
}
