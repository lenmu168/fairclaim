export const DISCONNECT_SAFETY_MESSAGE =
  '断开连接只会移除 FairClaim 与当前钱包的会话，不会删除钱包、不会转移资产、不会发起交易。'
export const WALLET_MISMATCH_ERROR_CODE = 'WALLET_MISMATCH'

export type WalletAccountSnapshot = {
  address: string
  label?: string
}

export type WalletConnectionState = 'disconnected' | 'connecting' | 'switching' | 'connected'

export type FairClaimWalletSession = {
  generation: number
  connectionState: WalletConnectionState
  acceptedAccount?: WalletAccountSnapshot
}

export type WalletSessionDebug = {
  connectionState: WalletConnectionState
  generation: number
  rawHookAccount: string
  acceptedAccount: string
  renderedWallet: string
  verifiedWallet: string
  canVerify: boolean
  canClaim: boolean
  lastWalletAction: 'connect' | 'disconnect' | 'switch' | 'none'
  lastSwitchResult: 'success' | 'failed' | 'none'
  verificationWallet: string
  lastVerifyResult: 'success' | 'failed' | 'wallet-session-invalid' | 'none'
  invariantViolation: boolean
}

export function walletAccountSnapshot(value: unknown): WalletAccountSnapshot {
  if (typeof value !== 'object' || value === null) throw new Error('Wallet did not return an account.')
  const candidate = value as { address?: unknown; label?: unknown }
  const addressValue = candidate.address
  const address =
    typeof addressValue === 'string'
      ? addressValue
      : typeof (addressValue as { toString?: unknown } | undefined)?.toString === 'function'
        ? String(addressValue)
        : ''
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new Error('Wallet returned an invalid account address.')
  return {
    address,
    ...(typeof candidate.label === 'string' && candidate.label.length ? { label: candidate.label.slice(0, 100) } : {}),
  }
}

export function safeWalletAccountSnapshot(value: unknown): WalletAccountSnapshot | undefined {
  try {
    return walletAccountSnapshot(value)
  } catch {
    return undefined
  }
}

function errorRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

export function isWalletSessionInvalidatingError(error: unknown) {
  const direct = errorRecord(error)
  const nested = errorRecord(direct?.cause)
  const codes = [direct?.code, nested?.code].map(String)
  if (codes.some((code) => code === '-1' || code === 'ERROR_AUTHORIZATION_FAILED')) return true
  const description = [direct?.name, direct?.message, nested?.name, nested?.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
  return /authorization request failed|authorization token|auth token|session (?:is )?invalid|invalid session|account unavailable|signer account mismatch|wallet mismatch|provider mismatch/.test(
    description,
  )
}

export function createFairClaimWalletSession(): FairClaimWalletSession {
  return { generation: 0, connectionState: 'disconnected' }
}

export function acceptedWalletAccount(current: FairClaimWalletSession): WalletAccountSnapshot | undefined {
  return current.connectionState === 'connected' ? current.acceptedAccount : undefined
}

function shortWalletAddress(value: string | undefined) {
  return value ? (value.length > 11 ? `${value.slice(0, 4)}...${value.slice(-4)}` : value) : 'none'
}

export function deriveRenderedWallet(
  session: FairClaimWalletSession,
  renderedWalletCandidate: string | undefined,
): { renderedWallet: string | undefined; invariantViolation: boolean } {
  const acceptedAddress = acceptedWalletAccount(session)?.address
  const invariantViolation = renderedWalletCandidate !== acceptedAddress
  return {
    renderedWallet: invariantViolation ? undefined : renderedWalletCandidate,
    invariantViolation,
  }
}

export function deriveWalletSessionDebug(input: {
  session: FairClaimWalletSession
  rawHookAddress?: string
  renderedWalletCandidate?: string
  verifiedWallet?: string
  verifyAllowedByFlow: boolean
  claimAllowedByFlow: boolean
  lastWalletAction: WalletSessionDebug['lastWalletAction']
  lastSwitchResult: WalletSessionDebug['lastSwitchResult']
  verificationWallet?: string
  lastVerifyResult: WalletSessionDebug['lastVerifyResult']
}): WalletSessionDebug {
  const acceptedAddress = acceptedWalletAccount(input.session)?.address
  const { renderedWallet, invariantViolation } = deriveRenderedWallet(input.session, input.renderedWalletCandidate)
  const connected = input.session.connectionState === 'connected' && !!acceptedAddress && !invariantViolation
  return {
    connectionState: input.session.connectionState,
    generation: input.session.generation,
    rawHookAccount: shortWalletAddress(input.rawHookAddress),
    acceptedAccount: shortWalletAddress(acceptedAddress),
    renderedWallet: shortWalletAddress(renderedWallet),
    verifiedWallet: shortWalletAddress(input.verifiedWallet),
    canVerify: connected && input.verifyAllowedByFlow,
    canClaim: connected && input.claimAllowedByFlow,
    lastWalletAction: input.lastWalletAction,
    lastSwitchResult: input.lastSwitchResult,
    verificationWallet: shortWalletAddress(input.verificationWallet),
    lastVerifyResult: input.lastVerifyResult,
    invariantViolation,
  }
}

export function beginWalletConnection(
  current: FairClaimWalletSession,
  connectionState: 'connecting' | 'switching',
): FairClaimWalletSession {
  return {
    generation: current.generation + 1,
    connectionState,
    acceptedAccount: undefined,
  }
}

export function acceptWalletConnection(
  current: FairClaimWalletSession,
  generation: number,
  account: WalletAccountSnapshot,
): FairClaimWalletSession {
  if (
    generation !== current.generation ||
    (current.connectionState !== 'connecting' && current.connectionState !== 'switching')
  )
    return current
  return {
    generation,
    connectionState: 'connected',
    acceptedAccount: account,
  }
}

export function failWalletConnection(current: FairClaimWalletSession, generation: number): FairClaimWalletSession {
  if (generation !== current.generation) return current
  return {
    generation,
    connectionState: 'disconnected',
    acceptedAccount: undefined,
  }
}

export function disconnectFairClaimWalletSession(current: FairClaimWalletSession): FairClaimWalletSession {
  return {
    generation: current.generation + 1,
    connectionState: 'disconnected',
    acceptedAccount: undefined,
  }
}

export function invalidateWalletSessionForSigningFailure(
  current: FairClaimWalletSession,
  generation: number,
): FairClaimWalletSession {
  if (current.generation !== generation) return current
  return disconnectFairClaimWalletSession(current)
}

export function isSigningResultBoundToAcceptedWallet(
  current: FairClaimWalletSession,
  generation: number,
  verificationWallet: string,
  signerWallet: string,
) {
  const acceptedAddress = acceptedWalletAccount(current)?.address
  return (
    current.generation === generation &&
    current.connectionState === 'connected' &&
    acceptedAddress === verificationWallet &&
    signerWallet === verificationWallet
  )
}

export async function disconnectWalletSession(disconnect: () => Promise<void>, clearLocalState: () => void) {
  clearLocalState()
  try {
    await disconnect()
  } finally {
    clearLocalState()
  }
}

export async function connectWalletSession(
  connect: () => Promise<unknown>,
  onFailure: (error: unknown, state: { authorizationStarted: boolean | 'unknown'; accountReturned: boolean }) => void,
) {
  let accountReturned = false
  try {
    const account = await connect()
    accountReturned = account !== undefined && account !== null
    return account
  } catch (error) {
    // Wallet UI's connect() does not expose the internal association -> authorize boundary.
    // The safe diagnostic layer may infer a definite value from a standard MWA error code.
    onFailure(error, { authorizationStarted: 'unknown', accountReturned })
    throw error
  }
}

export async function switchWalletSession(
  disconnect: () => Promise<void>,
  clearLocalState: () => void,
  connect: () => Promise<unknown>,
) {
  clearLocalState()
  try {
    await disconnect()
    clearLocalState()
    return await connect()
  } catch (error) {
    // A second local authorization purge prevents a partially reopened session
    // from surviving any failed switch path. Preserve the original failure.
    try {
      await disconnect()
    } catch {
      // The UI/session gate remains disconnected even if cache cleanup itself fails.
    }
    throw error
  }
}
