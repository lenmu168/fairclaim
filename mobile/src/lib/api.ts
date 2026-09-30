export type Campaign = {
  id: string
  slug: string
  name: string
  description: string
  rewardName: string
  rewardAmount: number
  status: 'ACTIVE' | 'DRAFT' | 'CLOSED'
  startsAt: string
  endsAt: string
}
export type Receipt = {
  success: true
  claimId: string
  campaignId: string
  walletAddress: string
  sgtMint: string
  claimedAt: string
  devSgtBypass: boolean
}
export type Verification = {
  hasSGT: true
  mintAddress: string
  walletAddress: string
  devSgtBypass: boolean
  authPath: 'native-siws' | 'sign-messages-fallback'
}
export type Stats = {
  successfulClaims: number
  uniqueSGTs: number
  duplicateAttempts: number
  failedAttempts: number
  devSgtBypass: boolean
  recentAttempts: {
    id: string
    result: string
    reason: string
    walletAddress: string
    sgtMint: string | null
    createdAt: string
  }[]
}
export type Challenge = {
  authPath: 'native-siws' | 'sign-messages-fallback'
  address: string
  chainId: 'solana:mainnet'
  domain: string
  uri: string
  version: '1'
  nonce: string
  issuedAt: string
  expirationTime: string
  statement: string
  requestId: string
  canonicalMessage: number[]
  claimContext?:
    | {
        kind: 'genesis-access'
        campaignId: string
        campaignName: string
      }
    | {
        campaignId: string
        campaignName: string
        rewardName: string
        rewardAmount: number
      }
}
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? 'http://10.0.2.2:3000' : '')
export const SIWS_DOMAIN = process.env.EXPO_PUBLIC_SIWS_DOMAIN ?? ''
export const SIWS_URI = process.env.EXPO_PUBLIC_SIWS_URI ?? ''
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (!API_URL || (!__DEV__ && !API_URL.startsWith('https://')))
    throw new ApiError('CONFIG_ERROR', 'The app connection is not configured. Please contact the builder.')
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), 45_000)
  try {
    const response = await fetch(`${API_URL.replace(/\/$/, '')}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      signal: abort.signal,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const data = await response.json()
    if (!response.ok)
      throw new ApiError(
        typeof data.code === 'string' ? data.code : 'SERVER_ERROR',
        typeof data.message === 'string' ? data.message : 'Service unavailable. Please try again.',
      )
    if (!__DEV__ && data.devSgtBypass === true)
      throw new ApiError('UNSAFE_SERVER', 'This server is in development mode. Please contact the builder.')
    return data as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (__DEV__) console.error('[FairClaim API]', error)
    throw new ApiError('SERVER_ERROR', 'Cannot reach FairClaim. Check your connection and try again.')
  } finally {
    clearTimeout(timeout)
  }
}
export function short(value: string) {
  return value.length < 16 ? value : `${value.slice(0, 5)}…${value.slice(-5)}`
}
export function cancellation(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : ''
  return (
    code === 'ERROR_ASSOCIATION_CANCELLED' ||
    message.includes('CancellationException') ||
    message.includes('Local association cancelled by user')
  )
}
