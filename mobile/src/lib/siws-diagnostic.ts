export type SignInCapability = true | false | 'unknown'

export type CapabilityDiagnostic = {
  featureIds: string[]
  signInWithSolana: SignInCapability
}

export type SafeSiwsDiagnostic = {
  stage: 'connect' | 'switch-connect' | 'signIn' | 'signMessages' | 'server'
  authPath: 'not-applicable' | 'native-siws' | 'sign-messages-fallback'
  fallbackStage:
    | 'not-applicable'
    | 'challenge-received'
    | 'wallet-sign-message'
    | 'signature-received'
    | 'server-verification'
    | 'sgt-query'
  wallet: string
  signInWithSolana: SignInCapability
  errorName: string | number
  errorCode: string | number
  errorMessage: string | number
  errorConstructor: string
  causeName: string | number
  causeCode: string | number
  causeMessage: string | number
  rpcCode: string | number
  rpcMessage: string | number
  authorizationStarted: boolean | 'unknown' | 'not-applicable'
  accountReturned: boolean | 'not-applicable'
  chainId: string
  domain: string
  uri: string
  nonceLength: number
  issuedAt: string
  address: string
  previousWallet: string
  newWallet: string
  connectionState: string
  sessionGeneration: number | 'not-applicable'
  hookAccount: string
  acceptedAccount: string
  switchStage: string
}

type SiwsPayload = {
  address?: string
  chainId?: string
  domain?: string
  expirationTime?: string
  issuedAt?: string
  nonce?: string
  requestId?: string
  statement?: string
  uri?: string
  version?: string
}

const SIGN_IN_FEATURE = 'solana:signInWithSolana'
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const REQUEST_ID = /^(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%[0-9A-Fa-f]{2})*$/

function validDateTime(value: string | undefined) {
  return !!value && ISO_8601.test(value) && Number.isFinite(Date.parse(value))
}

export function inspectCapabilities(features: unknown): CapabilityDiagnostic {
  if (!Array.isArray(features)) return { featureIds: [], signInWithSolana: 'unknown' }
  const featureIds = features
    .filter((feature): feature is string => typeof feature === 'string')
    .map((feature) => feature.slice(0, 120))
    .sort()
  return { featureIds, signInWithSolana: featureIds.includes(SIGN_IN_FEATURE) }
}

export function inspectSiwsPayload(payload: SiwsPayload, expectedAddress: string) {
  const invalidFields: string[] = []
  let uriHost = ''
  try {
    const parsed = new URL(payload.uri ?? '')
    uriHost = parsed.host
    if (!parsed.protocol || !parsed.hostname) invalidFields.push('uri')
  } catch {
    invalidFields.push('uri')
  }

  if (payload.address !== expectedAddress) invalidFields.push('address')
  if (payload.chainId !== 'solana:mainnet') invalidFields.push('chainId')
  if (!payload.domain || payload.domain !== uriHost) invalidFields.push('domain')
  if (payload.version !== '1') invalidFields.push('version')
  if (!payload.nonce || !/^[A-Za-z0-9]{8,}$/.test(payload.nonce)) invalidFields.push('nonce')
  if (!validDateTime(payload.issuedAt)) invalidFields.push('issuedAt')
  if (!validDateTime(payload.expirationTime)) invalidFields.push('expirationTime')
  if (
    validDateTime(payload.issuedAt) &&
    validDateTime(payload.expirationTime) &&
    Date.parse(payload.expirationTime!) <= Date.parse(payload.issuedAt!)
  )
    invalidFields.push('expirationTime')
  if (!payload.statement || /[\r\n]/.test(payload.statement)) invalidFields.push('statement')
  if (payload.requestId === undefined || !REQUEST_ID.test(payload.requestId)) invalidFields.push('requestId')

  return {
    valid: invalidFields.length === 0,
    invalidFields,
    safeSummary: {
      domain: payload.domain ?? 'missing',
      uri: payload.uri ?? 'missing',
      chainId: payload.chainId ?? 'missing',
      nonceLength: payload.nonce?.length ?? 0,
      issuedAt: payload.issuedAt ?? 'missing',
      address: shortenAddress(expectedAddress),
    },
  }
}

function shortenAddress(address: string) {
  return address.length > 11 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

function safeScalar(value: unknown): string | number | 'unknown' {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.length) return safeText(value)
  return 'unknown'
}

function safeText(value: string) {
  return value
    .replace(/https?:\/\/[^\s"']+/gi, (raw) => {
      try {
        const url = new URL(raw)
        return `${url.protocol}//${url.hostname}/[REDACTED]`
      } catch {
        return '[REDACTED URL]'
      }
    })
    .replace(
      /((?:nonce|address|auth[ _-]?token|signature|signed[ _-]?message|private[ _-]?key|mnemonic|seed[ _-]?phrase|secret)\s*[:=]\s*)\S+/gi,
      '$1[REDACTED]',
    )
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, '[REDACTED]')
    .replace(/\b[a-fA-F0-9]{32,}\b/g, '[REDACTED]')
    .replace(/\b[A-Za-z0-9+/_=-]{48,}\b/g, '[REDACTED]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300)
}

export function inspectWalletError(error: unknown) {
  const direct = record(error)
  const nested = record(direct?.cause)
  const directCode = safeScalar(direct?.code)
  const nestedCode = safeScalar(nested?.code)
  const name = safeScalar(direct?.name)
  const message = safeScalar(direct?.message ?? (error instanceof Error ? error.message : undefined))
  const errorClass = error instanceof Error ? safeText(error.constructor.name) : 'unknown'
  const causeName = safeScalar(nested?.name)
  const causeMessage = safeScalar(nested?.message)
  const rpcCode = directCode !== 'unknown' ? directCode : nestedCode
  const rpcMessage = rpcCode === 'unknown' ? 'unknown' : safeScalar(nested?.message ?? direct?.message)
  return {
    errorName: name,
    errorCode: directCode,
    errorMessage: message,
    errorClass,
    causeName,
    causeCode: nestedCode,
    causeMessage,
    rpcCode,
    rpcMessage,
  }
}

export function createSafeSiwsDiagnostic(input: {
  stage: SafeSiwsDiagnostic['stage']
  authPath: SafeSiwsDiagnostic['authPath']
  fallbackStage: SafeSiwsDiagnostic['fallbackStage']
  wallet: string | undefined
  capability: CapabilityDiagnostic
  payload: ReturnType<typeof inspectSiwsPayload>['safeSummary']
  error: unknown
}): SafeSiwsDiagnostic {
  const inspectedError = inspectWalletError(input.error)
  return {
    stage: input.stage,
    authPath: input.authPath,
    fallbackStage: input.fallbackStage,
    wallet: safeText(input.wallet ?? 'unknown'),
    signInWithSolana: input.capability.signInWithSolana,
    errorName: inspectedError.errorName,
    errorCode: inspectedError.errorCode,
    errorMessage: inspectedError.errorMessage,
    errorConstructor: inspectedError.errorClass,
    causeName: inspectedError.causeName,
    causeCode: inspectedError.causeCode,
    causeMessage: inspectedError.causeMessage,
    rpcCode: inspectedError.rpcCode,
    rpcMessage: inspectedError.rpcMessage,
    authorizationStarted: 'not-applicable',
    accountReturned: 'not-applicable',
    previousWallet: 'not-applicable',
    newWallet: 'not-applicable',
    connectionState: 'not-applicable',
    sessionGeneration: 'not-applicable',
    hookAccount: 'not-applicable',
    acceptedAccount: 'not-applicable',
    switchStage: 'not-applicable',
    ...input.payload,
  }
}

export function createSafeConnectDiagnostic(input: {
  stage: 'connect' | 'switch-connect'
  wallet?: string
  address?: string
  previousWallet?: string
  newWallet?: string
  connectionState?: string
  sessionGeneration?: number
  hookAccount?: string
  acceptedAccount?: string
  switchStage?: string
  error: unknown
  authorizationStarted: boolean | 'unknown'
  accountReturned: boolean
}): SafeSiwsDiagnostic {
  const inspectedError = inspectWalletError(input.error)
  const preAuthorizationErrors = new Set([
    'ERROR_ASSOCIATION_PORT_OUT_OF_RANGE',
    'ERROR_REFLECTOR_ID_OUT_OF_RANGE',
    'ERROR_FORBIDDEN_WALLET_BASE_URL',
    'ERROR_SECURE_CONTEXT_REQUIRED',
    'ERROR_WALLET_NOT_FOUND',
    'ERROR_INVALID_PROTOCOL_VERSION',
    'ERROR_BROWSER_NOT_SUPPORTED',
    'ERROR_LOOPBACK_ACCESS_BLOCKED',
    'ERROR_ASSOCIATION_CANCELLED',
  ])
  const authorizationStarted =
    inspectedError.errorName === 'SolanaMobileWalletAdapterProtocolError'
      ? true
      : preAuthorizationErrors.has(String(inspectedError.errorCode))
        ? false
        : input.authorizationStarted
  return {
    stage: input.stage,
    authPath: 'not-applicable',
    fallbackStage: 'not-applicable',
    wallet: safeText(input.wallet ?? 'unknown'),
    signInWithSolana: 'unknown',
    errorName: inspectedError.errorName,
    errorCode: inspectedError.errorCode,
    errorMessage: inspectedError.errorMessage,
    errorConstructor: inspectedError.errorClass,
    causeName: inspectedError.causeName,
    causeCode: inspectedError.causeCode,
    causeMessage: inspectedError.causeMessage,
    rpcCode: inspectedError.rpcCode,
    rpcMessage: inspectedError.rpcMessage,
    authorizationStarted,
    accountReturned: input.accountReturned,
    chainId: 'not-applicable',
    domain: 'not-applicable',
    uri: 'not-applicable',
    nonceLength: 0,
    issuedAt: 'not-applicable',
    address: input.address ? shortenAddress(input.address) : 'unknown',
    previousWallet: input.previousWallet ? shortenAddress(input.previousWallet) : 'unknown',
    newWallet: input.newWallet ? shortenAddress(input.newWallet) : 'unknown',
    connectionState: safeText(input.connectionState ?? 'unknown'),
    sessionGeneration: input.sessionGeneration ?? 'not-applicable',
    hookAccount: input.hookAccount ? shortenAddress(input.hookAccount) : 'none',
    acceptedAccount: input.acceptedAccount ? shortenAddress(input.acceptedAccount) : 'none',
    switchStage: safeText(input.switchStage ?? 'not-applicable'),
  }
}

export function formatSafeSiwsDiagnostic(diagnostic: SafeSiwsDiagnostic) {
  const connection = diagnostic.stage === 'connect' || diagnostic.stage === 'switch-connect'
  const common = [
    'FairClaim Development Diagnostic',
    `Stage: ${diagnostic.stage}`,
    `Wallet: ${diagnostic.wallet}`,
    `Error Name: ${diagnostic.errorName}`,
    `Error Code: ${diagnostic.errorCode}`,
    `Error Message: ${diagnostic.errorMessage}`,
    `Error Constructor: ${diagnostic.errorConstructor}`,
    `Cause Name: ${diagnostic.causeName}`,
    `Cause Code: ${diagnostic.causeCode}`,
    `Cause Message: ${diagnostic.causeMessage}`,
    `MWA RPC Code: ${diagnostic.rpcCode}`,
    `MWA RPC Message: ${diagnostic.rpcMessage}`,
  ]
  return [
    ...common,
    ...(connection
      ? [
          `Authorization Started: ${diagnostic.authorizationStarted}`,
          `Account Returned: ${diagnostic.accountReturned}`,
          `Previous Wallet: ${diagnostic.previousWallet}`,
          `New Wallet: ${diagnostic.newWallet}`,
          `Connection State: ${diagnostic.connectionState}`,
          `Session Generation: ${diagnostic.sessionGeneration}`,
          `Hook Account: ${diagnostic.hookAccount}`,
          `Accepted Account: ${diagnostic.acceptedAccount}`,
          `Switch Stage: ${diagnostic.switchStage}`,
        ]
      : [
          `AUTH PATH: ${diagnostic.authPath}`,
          `FALLBACK STAGE: ${diagnostic.fallbackStage}`,
          `SIWS Capability: ${diagnostic.signInWithSolana}`,
          `chainId: ${diagnostic.chainId}`,
          `domain: ${diagnostic.domain}`,
          `uri: ${diagnostic.uri}`,
          `nonceLength: ${diagnostic.nonceLength}`,
          `issuedAt: ${diagnostic.issuedAt}`,
          `address: ${diagnostic.address}`,
        ]),
  ].join('\n')
}

export function logSiwsDiagnostic(enabled: boolean, details: Record<string, unknown>) {
  if (enabled) console.info('[FairClaim SIWS Diagnostic]', details)
}
