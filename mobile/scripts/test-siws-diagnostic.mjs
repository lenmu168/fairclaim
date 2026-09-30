import assert from 'node:assert/strict'
import {
  createSafeConnectDiagnostic,
  createSafeSiwsDiagnostic,
  formatSafeSiwsDiagnostic,
  inspectCapabilities,
  inspectSiwsPayload,
  inspectWalletError,
} from '../src/lib/siws-diagnostic.ts'
import {
  chooseAuthenticationPath,
  getCanonicalAuthenticationMessage,
  isExplicitSiwsUnsupported,
  unpackSignedMessagePayload,
} from '../src/lib/siws-auth.ts'
import {
  createIdentityMessagePreview,
  getConfirmedIdentityMessageBytes,
  getPreSignPreviewCopy,
} from '../src/lib/pre-sign-preview.ts'
import { claimControlForServerMode, deriveClaimUiState, hasCurrentWalletVerification } from '../src/lib/verify-only.ts'
import {
  DISCONNECT_SAFETY_MESSAGE,
  acceptedWalletAccount,
  acceptWalletConnection,
  beginWalletConnection,
  connectWalletSession,
  createFairClaimWalletSession,
  deriveRenderedWallet,
  deriveWalletSessionDebug,
  disconnectFairClaimWalletSession,
  disconnectWalletSession,
  failWalletConnection,
  invalidateWalletSessionForSigningFailure,
  isSigningResultBoundToAcceptedWallet,
  isWalletSessionInvalidatingError,
  safeWalletAccountSnapshot,
  switchWalletSession,
  walletAccountSnapshot,
  WALLET_MISMATCH_ERROR_CODE,
} from '../src/lib/wallet-session.ts'

const address = 'F9SVfg9pK8J6S2P8yHA1PkzXkPpB9L3B2w1b5HgSLx'

assert.deepEqual(inspectCapabilities(['solana:signMessages', 'solana:signInWithSolana']), {
  featureIds: ['solana:signInWithSolana', 'solana:signMessages'],
  signInWithSolana: true,
})
assert.equal(inspectCapabilities(['solana:signMessages']).signInWithSolana, false)
assert.equal(inspectCapabilities(undefined).signInWithSolana, 'unknown')

const issuedAt = new Date().toISOString()
assert.equal(
  inspectSiwsPayload(
    {
      address,
      chainId: 'solana:mainnet',
      domain: '192.168.1.4:3000',
      uri: 'http://192.168.1.4:3000',
      version: '1',
      nonce: '0123456789abcdef0123456789abcdef',
      issuedAt,
      expirationTime: new Date(Date.parse(issuedAt) + 300_000).toISOString(),
      statement: 'Sign in to FairClaim. No transaction or payment is requested.',
      requestId: 'verify:seeker-pioneer',
    },
    address,
  ).valid,
  true,
)

const invalid = inspectSiwsPayload(
  {
    address,
    chainId: 'solana:mainnet',
    domain: 'example.com',
    uri: 'http://192.168.1.4:3000',
    version: '1',
    nonce: 'short',
    issuedAt: new Date().toISOString(),
    expirationTime: new Date(Date.now() + 300_000).toISOString(),
    statement: 'line one\nline two',
    requestId: 'verify:seeker-pioneer',
  },
  address,
)
assert.deepEqual(
  ['domain', 'nonce', 'statement'].filter((field) => invalid.invalidFields.includes(field)),
  ['domain', 'nonce', 'statement'],
)

const error = Object.assign(new Error(`signature=${'A'.repeat(100)}`), { code: -32602 })
const diagnostic = inspectWalletError(error)
assert.deepEqual(
  {
    errorName: diagnostic.errorName,
    errorCode: diagnostic.errorCode,
    errorClass: diagnostic.errorClass,
    rpcCode: diagnostic.rpcCode,
  },
  { errorName: 'Error', errorCode: -32602, errorClass: 'Error', rpcCode: -32602 },
)
assert.match(String(diagnostic.errorMessage), /\[REDACTED\]/)
assert.doesNotMatch(String(diagnostic.errorMessage), /A{20}/)

const safePanel = createSafeSiwsDiagnostic({
  stage: 'signMessages',
  authPath: 'sign-messages-fallback',
  fallbackStage: 'wallet-sign-message',
  wallet: 'Seed Vault Wallet',
  capability: inspectCapabilities(['solana:signInWithSolana']),
  payload: inspectSiwsPayload(
    {
      address,
      chainId: 'solana:mainnet',
      domain: '192.168.1.4:3000',
      uri: 'http://192.168.1.4:3000',
      version: '1',
      nonce: '0123456789abcdef0123456789abcdef',
      issuedAt,
      expirationTime: new Date(Date.parse(issuedAt) + 300_000).toISOString(),
      statement: 'Sign in to FairClaim.',
      requestId: 'verify:seeker-pioneer',
    },
    address,
  ).safeSummary,
  error: Object.assign(new Error('Invalid sign-in request'), { code: -32602 }),
})
const copied = formatSafeSiwsDiagnostic(safePanel)
assert.match(copied, /Stage: signMessages/)
assert.match(copied, /AUTH PATH: sign-messages-fallback/)
assert.match(copied, /FALLBACK STAGE: wallet-sign-message/)
assert.match(copied, /address: F9SV\.\.\.gSLx/)
assert.match(copied, /nonceLength: 32/)
assert.doesNotMatch(copied, /0123456789abcdef/)
assert.doesNotMatch(copied, /F9SVfg9pK8J6S2P8yHA1PkzXkPpB9L3B2w1b5HgSLx/)

assert.equal(chooseAuthenticationPath(true), 'native-siws')
assert.equal(chooseAuthenticationPath('unknown'), 'native-siws')
assert.equal(chooseAuthenticationPath(false), 'sign-messages-fallback')
assert.equal(isExplicitSiwsUnsupported({ code: 'SIWS_UNSUPPORTED' }), true)
assert.equal(isExplicitSiwsUnsupported(new Error('This wallet does not support secure Sign-In With Solana.')), true)
assert.equal(isExplicitSiwsUnsupported(new Error('Wallet session failed')), false)

assert.deepEqual(
  claimControlForServerMode({ verifyOnlyMode: true, claimTestMode: false, databaseClaimsEnabled: false }),
  {
    enabled: false,
    mode: 'verify-only',
    title: 'SGT VERIFY ONLY',
  },
)
assert.deepEqual(
  claimControlForServerMode({ verifyOnlyMode: false, claimTestMode: true, databaseClaimsEnabled: false }),
  {
    enabled: true,
    mode: 'claim-test',
    title: 'ACTIVATE GENESIS ACCESS',
  },
)
assert.deepEqual(
  claimControlForServerMode({ verifyOnlyMode: false, claimTestMode: false, databaseClaimsEnabled: true }),
  {
    enabled: true,
    mode: 'database-claims',
    title: 'ACTIVATE GENESIS ACCESS',
  },
)
assert.equal(claimControlForServerMode({ verifyOnlyMode: false, claimTestMode: false }).enabled, false)
assert.equal(claimControlForServerMode({ verifyOnlyMode: true, claimTestMode: true }).enabled, false)
assert.equal(hasCurrentWalletVerification(address, address), true)
assert.equal(hasCurrentWalletVerification(address, 'AnotherWalletAddress'), false)
assert.equal(hasCurrentWalletVerification(undefined, address), false)

const claimHealth = {
  healthReady: true,
  healthError: false,
  devSgtBypass: false,
  verifyOnlyMode: false,
  claimTestMode: true,
  databaseClaimsEnabled: false,
  connectedWallet: address,
  verifiedWallet: undefined,
}
const unverifiedClaimUi = deriveClaimUiState(claimHealth)
assert.equal(unverifiedClaimUi.showClaimTestBanner, true)
assert.equal(unverifiedClaimUi.claimEnabled, false)
assert.equal(deriveClaimUiState({ ...claimHealth, verifiedWallet: address }).claimEnabled, true)
assert.equal(deriveClaimUiState({ ...claimHealth, healthReady: false }).claimEnabled, false)
assert.equal(deriveClaimUiState({ ...claimHealth, healthReady: false }).showClaimTestBanner, false)
assert.equal(deriveClaimUiState({ ...claimHealth, healthError: true }).claimEnabled, false)
assert.equal(deriveClaimUiState({ ...claimHealth, healthError: true }).showClaimTestBanner, false)
assert.equal(deriveClaimUiState({ ...claimHealth, claimTestMode: false }).claimEnabled, false)
const productionClaimUi = deriveClaimUiState({
  ...claimHealth,
  claimTestMode: false,
  databaseClaimsEnabled: true,
  verifiedWallet: address,
})
assert.equal(productionClaimUi.mode, 'database-claims')
assert.equal(productionClaimUi.showClaimTestBanner, false)
assert.equal(productionClaimUi.claimEnabled, true)
assert.equal(
  deriveClaimUiState({
    ...claimHealth,
    claimTestMode: false,
    databaseClaimsEnabled: true,
    connectedWallet: undefined,
    verifiedWallet: address,
  }).claimEnabled,
  false,
)
const verifyOnlyUi = deriveClaimUiState({
  ...claimHealth,
  verifyOnlyMode: true,
  claimTestMode: false,
  verifiedWallet: address,
})
assert.equal(verifyOnlyUi.showVerifyOnlyBanner, true)
assert.equal(verifyOnlyUi.claimEnabled, false)
assert.equal(deriveClaimUiState({ ...claimHealth, connectedWallet: 'AnotherWalletAddress' }).claimEnabled, false)
assert.equal(deriveClaimUiState({ ...claimHealth, devSgtBypass: true, verifiedWallet: address }).claimEnabled, false)
assert.equal(deriveClaimUiState({ ...claimHealth, devSgtBypass: true }).showClaimTestBanner, false)
assert.equal(deriveClaimUiState({ ...claimHealth, verifyOnlyMode: true, claimTestMode: true }).mode, 'unsafe')
assert.equal(deriveClaimUiState({ ...claimHealth, claimTestMode: true, databaseClaimsEnabled: true }).mode, 'unsafe')

let connectedAddress = address
let verifiedSgt = 'SGT-mint'
let verifiedAuthPath = 'sign-messages-fallback'
const disconnectCalls = []
await disconnectWalletSession(
  async () => {
    disconnectCalls.push('disconnect')
  },
  () => {
    disconnectCalls.push('clear-local-state')
    connectedAddress = undefined
    verifiedSgt = undefined
    verifiedAuthPath = undefined
  },
)
assert.deepEqual(disconnectCalls, ['clear-local-state', 'disconnect', 'clear-local-state'])
assert.equal(connectedAddress, undefined)
assert.equal(verifiedSgt, undefined)
assert.equal(verifiedAuthPath, undefined)
assert.equal(hasCurrentWalletVerification(connectedAddress, address), false)

const switchCalls = []
await switchWalletSession(
  async () => switchCalls.push('disconnect'),
  () => switchCalls.push('clear-local-state'),
  async () => switchCalls.push('connect'),
)
assert.deepEqual(switchCalls, ['clear-local-state', 'disconnect', 'clear-local-state', 'connect'])
assert.match(DISCONNECT_SAFETY_MESSAGE, /不会转移资产、不会发起交易/)

const addressB = 'G9SVfg9pK8J6S2P8yHA1PkzXkPpB9L3B2w1b5HgSLx'
const accountA = walletAccountSnapshot({ address, label: 'Phantom' })
const accountB = walletAccountSnapshot({ address: addressB, label: 'Solflare' })
assert.equal(safeWalletAccountSnapshot({ address: 'not-an-address' }), undefined)

let walletSession = createFairClaimWalletSession()
let hookAccount = accountA
assert.equal(walletSession.connectionState, 'disconnected')
assert.equal(acceptedWalletAccount(walletSession), undefined)

walletSession = beginWalletConnection(walletSession, 'connecting')
const initialConnectGeneration = walletSession.generation
walletSession = acceptWalletConnection(walletSession, initialConnectGeneration, accountA)
assert.equal(walletSession.connectionState, 'connected')
assert.deepEqual(acceptedWalletAccount(walletSession), accountA)

walletSession = beginWalletConnection(walletSession, 'switching')
const failedSwitchGeneration = walletSession.generation
assert.equal(acceptedWalletAccount(walletSession), undefined)

let switchAccount = address
let switchVerifiedSgt = 'SGT-mint'
let switchClaimEligible = true
let switchReceipt = { claimId: 'old-receipt' }
let automaticVerifyCalls = 0
let automaticClaimCalls = 0
const successfulSwitchCalls = []
const returnedB = await switchWalletSession(
  async () => successfulSwitchCalls.push('disconnect'),
  () => {
    successfulSwitchCalls.push('clear')
    switchAccount = undefined
    switchVerifiedSgt = undefined
    switchClaimEligible = false
    switchReceipt = undefined
  },
  async () => {
    successfulSwitchCalls.push('connect')
    assert.equal(switchAccount, undefined)
    return accountB
  },
)
walletSession = acceptWalletConnection(walletSession, failedSwitchGeneration, walletAccountSnapshot(returnedB))
assert.deepEqual(acceptedWalletAccount(walletSession), accountB)
assert.deepEqual(successfulSwitchCalls, ['clear', 'disconnect', 'clear', 'connect'])
assert.equal(automaticVerifyCalls, 0)
assert.equal(automaticClaimCalls, 0)

walletSession = createFairClaimWalletSession()
walletSession = beginWalletConnection(walletSession, 'connecting')
walletSession = acceptWalletConnection(walletSession, walletSession.generation, accountA)
assert.deepEqual(acceptedWalletAccount(walletSession), accountA)
walletSession = beginWalletConnection(walletSession, 'switching')
const realDeviceRaceGeneration = walletSession.generation
switchAccount = address
switchVerifiedSgt = 'SGT-mint'
switchClaimEligible = true
switchReceipt = { claimId: 'old-receipt' }
const failedSwitchCalls = []
await assert.rejects(
  switchWalletSession(
    async () => failedSwitchCalls.push('disconnect'),
    () => {
      failedSwitchCalls.push('clear')
      switchAccount = undefined
      switchVerifiedSgt = undefined
      switchClaimEligible = false
      switchReceipt = undefined
    },
    async () => {
      failedSwitchCalls.push('connect')
      throw new Error('wallet chooser failed')
    },
  ),
  /wallet chooser failed/,
)
hookAccount = accountA
walletSession = failWalletConnection(walletSession, realDeviceRaceGeneration)
assert.deepEqual(failedSwitchCalls, ['clear', 'disconnect', 'clear', 'connect', 'disconnect'])
assert.equal(walletSession.connectionState, 'disconnected')
assert.equal(acceptedWalletAccount(walletSession), undefined)
assert.deepEqual(deriveRenderedWallet(walletSession, undefined), {
  renderedWallet: undefined,
  invariantViolation: false,
})
assert.deepEqual(hookAccount, accountA)
assert.equal(acceptedWalletAccount(walletSession), undefined)
assert.equal(switchAccount, undefined)
assert.equal(switchVerifiedSgt, undefined)
assert.equal(switchClaimEligible, false)
assert.equal(switchReceipt, undefined)
assert.equal(
  deriveClaimUiState({ ...claimHealth, connectedWallet: undefined, verifiedWallet: address }).claimEnabled,
  false,
)

const failedSwitchDebug = deriveWalletSessionDebug({
  session: walletSession,
  rawHookAddress: hookAccount.address,
  renderedWalletCandidate: undefined,
  verifiedWallet: undefined,
  verifyAllowedByFlow: true,
  claimAllowedByFlow: true,
  lastWalletAction: 'switch',
  lastSwitchResult: 'failed',
  verificationWallet: undefined,
  lastVerifyResult: 'none',
})
assert.equal(failedSwitchDebug.connectionState, 'disconnected')
assert.equal(failedSwitchDebug.generation, realDeviceRaceGeneration)
assert.equal(failedSwitchDebug.rawHookAccount, 'F9SV...gSLx')
assert.equal(failedSwitchDebug.acceptedAccount, 'none')
assert.equal(failedSwitchDebug.renderedWallet, 'none')
assert.equal(failedSwitchDebug.verifiedWallet, 'none')
assert.equal(failedSwitchDebug.canVerify, false)
assert.equal(failedSwitchDebug.canClaim, false)
assert.equal(failedSwitchDebug.lastWalletAction, 'switch')
assert.equal(failedSwitchDebug.lastSwitchResult, 'failed')
assert.equal(failedSwitchDebug.invariantViolation, false)

const staleCallbackResult = acceptWalletConnection(walletSession, initialConnectGeneration, accountA)
assert.strictEqual(staleCallbackResult, walletSession)
assert.equal(acceptedWalletAccount(walletSession), undefined)

walletSession = beginWalletConnection(walletSession, 'connecting')
const explicitReconnectGeneration = walletSession.generation
assert.equal(acceptedWalletAccount(walletSession), undefined)
walletSession = acceptWalletConnection(walletSession, explicitReconnectGeneration, accountB)
assert.deepEqual(acceptedWalletAccount(walletSession), accountB)
assert.equal(acceptedWalletAccount(walletSession).address, addressB)
assert.notEqual(acceptedWalletAccount(walletSession).address, address)
assert.deepEqual(deriveRenderedWallet(walletSession, addressB), {
  renderedWallet: addressB,
  invariantViolation: false,
})
const acceptedBDebug = deriveWalletSessionDebug({
  session: walletSession,
  rawHookAddress: address,
  renderedWalletCandidate: addressB,
  verifiedWallet: undefined,
  verifyAllowedByFlow: true,
  claimAllowedByFlow: false,
  lastWalletAction: 'connect',
  lastSwitchResult: 'failed',
  verificationWallet: undefined,
  lastVerifyResult: 'none',
})
assert.equal(acceptedBDebug.rawHookAccount, 'F9SV...gSLx')
assert.equal(acceptedBDebug.acceptedAccount, 'G9SV...gSLx')
assert.equal(acceptedBDebug.renderedWallet, 'G9SV...gSLx')
assert.equal(acceptedBDebug.canVerify, true)

const mismatchedPresentation = deriveRenderedWallet(walletSession, address)
assert.equal(mismatchedPresentation.invariantViolation, true)
assert.equal(mismatchedPresentation.renderedWallet, undefined)
const mismatchDebug = deriveWalletSessionDebug({
  session: walletSession,
  rawHookAddress: address,
  renderedWalletCandidate: address,
  verifiedWallet: addressB,
  verifyAllowedByFlow: true,
  claimAllowedByFlow: true,
  lastWalletAction: 'connect',
  lastSwitchResult: 'failed',
  verificationWallet: addressB,
  lastVerifyResult: 'success',
})
assert.equal(mismatchDebug.invariantViolation, true)
assert.equal(mismatchDebug.renderedWallet, 'none')
assert.equal(mismatchDebug.canVerify, false)
assert.equal(mismatchDebug.canClaim, false)

const authorizationRequestFailed = Object.assign(new Error('authorization request failed'), {
  name: 'SolanaMobileWalletAdapterProtocolError',
  code: -1,
})
assert.equal(isWalletSessionInvalidatingError(authorizationRequestFailed), true)
assert.equal(
  isWalletSessionInvalidatingError(
    Object.assign(new Error('User declined to sign'), {
      name: 'SolanaMobileWalletAdapterProtocolError',
      code: -3,
    }),
  ),
  false,
)

let verifySession = createFairClaimWalletSession()
verifySession = beginWalletConnection(verifySession, 'connecting')
verifySession = acceptWalletConnection(verifySession, verifySession.generation, accountA)
const verifyGeneration = verifySession.generation
const verificationAddress = acceptedWalletAccount(verifySession).address
assert.equal(verificationAddress, address)
assert.equal(isSigningResultBoundToAcceptedWallet(verifySession, verifyGeneration, address, address), true)
assert.equal(isSigningResultBoundToAcceptedWallet(verifySession, verifyGeneration, address, addressB), false)
assert.equal(WALLET_MISMATCH_ERROR_CODE, 'WALLET_MISMATCH')

let verifySgtQueries = 0
let verifyAccepted = address
let verifyVerifiedWallet = address
let verifyVerifiedSgt = 'SGT-mint'
let verifyClaimEligible = true
let verifyReceipt = { claimId: 'old-receipt' }
if (isSigningResultBoundToAcceptedWallet(verifySession, verifyGeneration, address, addressB)) verifySgtQueries += 1
if (isWalletSessionInvalidatingError(authorizationRequestFailed)) {
  verifySession = invalidateWalletSessionForSigningFailure(verifySession, verifyGeneration)
  verifyAccepted = undefined
  verifyVerifiedWallet = undefined
  verifyVerifiedSgt = undefined
  verifyClaimEligible = false
  verifyReceipt = undefined
}
assert.equal(verifySgtQueries, 0)
assert.equal(verifySession.connectionState, 'disconnected')
assert.equal(acceptedWalletAccount(verifySession), undefined)
assert.equal(verifyAccepted, undefined)
assert.equal(verifyVerifiedWallet, undefined)
assert.equal(verifyVerifiedSgt, undefined)
assert.equal(verifyClaimEligible, false)
assert.equal(verifyReceipt, undefined)
assert.equal(deriveRenderedWallet(verifySession, undefined).renderedWallet, undefined)
assert.equal(
  deriveClaimUiState({ ...claimHealth, connectedWallet: undefined, verifiedWallet: undefined }).claimEnabled,
  false,
)

const failedVerifyDebug = deriveWalletSessionDebug({
  session: verifySession,
  rawHookAddress: address,
  renderedWalletCandidate: undefined,
  verifiedWallet: undefined,
  verifyAllowedByFlow: true,
  claimAllowedByFlow: true,
  lastWalletAction: 'connect',
  lastSwitchResult: 'none',
  verificationWallet: address,
  lastVerifyResult: 'wallet-session-invalid',
})
assert.equal(failedVerifyDebug.connectionState, 'disconnected')
assert.equal(failedVerifyDebug.rawHookAccount, 'F9SV...gSLx')
assert.equal(failedVerifyDebug.acceptedAccount, 'none')
assert.equal(failedVerifyDebug.renderedWallet, 'none')
assert.equal(failedVerifyDebug.verifiedWallet, 'none')
assert.equal(failedVerifyDebug.verificationWallet, 'F9SV...gSLx')
assert.equal(failedVerifyDebug.lastVerifyResult, 'wallet-session-invalid')
assert.equal(failedVerifyDebug.canVerify, false)
assert.equal(failedVerifyDebug.canClaim, false)

const attemptedVerifyAdoption = acceptWalletConnection(verifySession, verifyGeneration, accountB)
assert.strictEqual(attemptedVerifyAdoption, verifySession)
assert.equal(acceptedWalletAccount(attemptedVerifyAdoption), undefined)
verifySession = beginWalletConnection(verifySession, 'connecting')
const reconnectAsBGeneration = verifySession.generation
verifySession = acceptWalletConnection(verifySession, reconnectAsBGeneration, accountB)
assert.deepEqual(acceptedWalletAccount(verifySession), accountB)

const accountJupiter = walletAccountSnapshot({
  address: 'H9SVfg9pK8J6S2P8yHA1PkzXkPpB9L3B2w1b5HgSLx',
  label: 'Jupiter',
})
for (const normalAccount of [accountA, accountJupiter, accountB]) {
  let normalSession = createFairClaimWalletSession()
  normalSession = beginWalletConnection(normalSession, 'connecting')
  normalSession = acceptWalletConnection(normalSession, normalSession.generation, normalAccount)
  assert.equal(
    isSigningResultBoundToAcceptedWallet(
      normalSession,
      normalSession.generation,
      normalAccount.address,
      normalAccount.address,
    ),
    true,
  )
}

walletSession = disconnectFairClaimWalletSession(walletSession)
assert.equal(walletSession.connectionState, 'disconnected')
assert.equal(acceptedWalletAccount(walletSession), undefined)
assert.equal(automaticVerifyCalls, 0)
assert.equal(automaticClaimCalls, 0)

const connectFailure = Object.assign(new Error(`authorize failed for address=${address}`), {
  name: 'MobileWalletAdapterError',
  code: 'ERROR_ASSOCIATION_CANCELLED',
  cause: Object.assign(new Error('JSON-RPC authorize failed'), { code: -32603 }),
})
const connectPanel = createSafeConnectDiagnostic({
  stage: 'switch-connect',
  wallet: 'Backpack',
  previousWallet: address,
  connectionState: 'disconnected',
  sessionGeneration: realDeviceRaceGeneration,
  hookAccount: address,
  acceptedAccount: undefined,
  switchStage: 'switch-connect',
  error: connectFailure,
  authorizationStarted: 'unknown',
  accountReturned: false,
})
const copiedConnectPanel = formatSafeSiwsDiagnostic(connectPanel)
assert.match(copiedConnectPanel, /Stage: switch-connect/)
assert.match(copiedConnectPanel, /Cause Code: -32603/)
assert.match(copiedConnectPanel, /Authorization Started: false/)
assert.match(copiedConnectPanel, /Account Returned: false/)
assert.match(copiedConnectPanel, /Previous Wallet: F9SV\.\.\.gSLx/)
assert.match(copiedConnectPanel, /New Wallet: unknown/)
assert.match(copiedConnectPanel, /Connection State: disconnected/)
assert.match(copiedConnectPanel, /Session Generation: 2/)
assert.match(copiedConnectPanel, /Hook Account: F9SV\.\.\.gSLx/)
assert.match(copiedConnectPanel, /Accepted Account: none/)
assert.match(copiedConnectPanel, /Switch Stage: switch-connect/)
assert.doesNotMatch(copiedConnectPanel, new RegExp(address))

const authorizationFailurePanel = createSafeConnectDiagnostic({
  stage: 'connect',
  error: Object.assign(new Error('Wallet rejected authorization'), {
    name: 'SolanaMobileWalletAdapterProtocolError',
    code: -1,
  }),
  authorizationStarted: 'unknown',
  accountReturned: false,
})
assert.equal(authorizationFailurePanel.authorizationStarted, true)

let capturedConnectState
await assert.rejects(
  connectWalletSession(
    async () => {
      throw connectFailure
    },
    (_error, state) => {
      capturedConnectState = state
    },
  ),
  /authorize failed/,
)
assert.deepEqual(capturedConnectState, {
  authorizationStarted: 'unknown',
  accountReturned: false,
})

const nonce = '0123456789abcdef0123456789abcdef'
const canonicalText = `192.168.1.4:3000 wants you to sign in with your Solana account:\n${address}\n\nSign in to FairClaim.\n\nURI: http://192.168.1.4:3000\nVersion: 1\nChain ID: solana:mainnet\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${new Date(Date.parse(issuedAt) + 300_000).toISOString()}\nRequest ID: ${nonce}`
const canonicalMessage = Array.from(new TextEncoder().encode(canonicalText))
const challenge = {
  address,
  chainId: 'solana:mainnet',
  domain: '192.168.1.4:3000',
  uri: 'http://192.168.1.4:3000',
  version: '1',
  nonce,
  issuedAt,
  expirationTime: new Date(Date.parse(issuedAt) + 300_000).toISOString(),
  statement: 'Sign in to FairClaim.',
  requestId: nonce,
  canonicalMessage,
}
const exactBytes = getCanonicalAuthenticationMessage(challenge)
assert.deepEqual(Array.from(exactBytes), canonicalMessage)
const preview = createIdentityMessagePreview(exactBytes)
assert.equal(preview.message, canonicalText)
assert.deepEqual(Array.from(new TextEncoder().encode(preview.message)), canonicalMessage)

const claimContext = {
  campaignId: 'pioneer',
  campaignName: 'Seeker Pioneer Drop',
  rewardName: 'Pioneer Points',
  rewardAmount: 500,
}
const claimStatement = `Authorize a FairClaim DATABASE-ONLY demo claim. Campaign: ${claimContext.campaignName}. Campaign ID: ${claimContext.campaignId}. Reward: ${claimContext.rewardAmount} ${claimContext.rewardName}. Wallet: ${address}. This authorizes exactly one FairClaim database claim for this campaign. It does NOT authorize any blockchain transaction, SOL transfer, token transfer, token approval, delegate, authority change, or payment.`
const claimCanonicalText = `192.168.1.4:3000 wants you to sign in with your Solana account:\n${address}\n\n${claimStatement}\n\nURI: http://192.168.1.4:3000\nVersion: 1\nChain ID: solana:mainnet\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${new Date(Date.parse(issuedAt) + 300_000).toISOString()}\nRequest ID: ${nonce}`
const claimCanonicalMessage = Array.from(new TextEncoder().encode(claimCanonicalText))
const claimChallenge = {
  ...challenge,
  statement: claimStatement,
  canonicalMessage: claimCanonicalMessage,
  claimContext,
}
const claimExactBytes = getCanonicalAuthenticationMessage(claimChallenge)
const claimPreview = createIdentityMessagePreview(claimExactBytes)
const claimCopy = getPreSignPreviewCopy('claim', claimContext)
const verifyCopy = getPreSignPreviewCopy('verify')
const renderedClaimCopy = [
  claimCopy.titleEnglish,
  claimCopy.titleChinese,
  claimCopy.notice,
  ...claimCopy.authorizations,
  ...claimCopy.exclusions,
  claimCopy.footer,
].join('\n')
assert.equal(claimCopy.titleEnglish, 'DATABASE CLAIM AUTHORIZATION PREVIEW')
assert.equal(claimCopy.titleChinese, '数据库领取授权预览')
assert.equal(verifyCopy.titleEnglish, 'Identity Message Preview')
assert.equal(verifyCopy.titleChinese, '即将签署身份消息')
assert.equal(renderedClaimCopy.includes('不会执行 Claim'), false)
assert.equal(renderedClaimCopy.includes('这是数据库领取授权，不是链上交易。'), true)
assert.equal(renderedClaimCopy.includes('为当前已验证 Seeker 在 FairClaim 数据库中记录一次领取'), true)
assert.equal(renderedClaimCopy.includes('领取 500 Pioneer Points 测试积分'), true)
assert.equal(claimPreview.message.includes('Campaign: Seeker Pioneer Drop.'), true)
assert.equal(claimPreview.message.includes('Reward: 500 Pioneer Points.'), true)
assert.strictEqual(getConfirmedIdentityMessageBytes(true, claimPreview), claimExactBytes)
assert.throws(
  () => getCanonicalAuthenticationMessage({ ...claimChallenge, claimContext: { ...claimContext, rewardAmount: 999 } }),
  /Claim context does not match/,
)
assert.throws(() => getPreSignPreviewCopy('claim'), /context is missing/)

const genesisContext = {
  kind: 'genesis-access',
  campaignId: 'seeker-genesis-access-2026',
  campaignName: 'Seeker Genesis Access',
}
const genesisStatement = `Authorize a FairClaim DATABASE-ONLY Seeker Genesis Access claim. Campaign: ${genesisContext.campaignName}. Campaign ID: ${genesisContext.campaignId}. Wallet: ${address}. This authorizes exactly one FairClaim database claim for this campaign. It does NOT authorize any blockchain transaction, SOL transfer, token transfer, token approval, delegate, authority change, or payment.`
const genesisCanonicalText = `192.168.1.4:3000 wants you to sign in with your Solana account:\n${address}\n\n${genesisStatement}\n\nURI: http://192.168.1.4:3000\nVersion: 1\nChain ID: solana:mainnet\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${new Date(Date.parse(issuedAt) + 300_000).toISOString()}\nRequest ID: ${nonce}`
const genesisCanonicalMessage = Array.from(new TextEncoder().encode(genesisCanonicalText))
const genesisChallenge = {
  ...challenge,
  statement: genesisStatement,
  canonicalMessage: genesisCanonicalMessage,
  claimContext: genesisContext,
}
const genesisBytes = getCanonicalAuthenticationMessage(genesisChallenge)
const genesisPreview = createIdentityMessagePreview(genesisBytes)
assert.equal(genesisPreview.message, genesisCanonicalText)
assert.strictEqual(getConfirmedIdentityMessageBytes(true, genesisPreview), genesisBytes)
assert.equal(genesisPreview.message.includes('Reward:'), false)
assert.equal(genesisPreview.message.includes('Pioneer Points'), false)
assert.equal(getPreSignPreviewCopy('claim', genesisContext).authorizations.join(' ').includes('奖励'), false)
assert.throws(
  () =>
    getCanonicalAuthenticationMessage({
      ...genesisChallenge,
      canonicalMessage: Array.from(
        new TextEncoder().encode(genesisCanonicalText.replace('exactly one', 'exactly two')),
      ),
    }),
  /Claim context does not match/,
)
assert.throws(
  () =>
    getCanonicalAuthenticationMessage({
      ...genesisChallenge,
      claimContext: { ...genesisContext, campaignId: 'wrong-campaign' },
    }),
  /campaign semantics do not match/,
)
assert.throws(
  () =>
    getCanonicalAuthenticationMessage({
      ...genesisChallenge,
      claimContext: {
        campaignId: genesisContext.campaignId,
        campaignName: genesisContext.campaignName,
        rewardName: 'Pioneer Points',
        rewardAmount: 500,
      },
    }),
  /campaign semantics do not match/,
)
assert.throws(
  () =>
    getCanonicalAuthenticationMessage({
      ...genesisChallenge,
      statement: `${genesisStatement} Reward: 0 Seeker Genesis Access.`,
      canonicalMessage: Array.from(
        new TextEncoder().encode(`${genesisCanonicalText} Reward: 0 Seeker Genesis Access.`),
      ),
    }),
  /Claim context does not match/,
)

let bytesReceivedBySignMessages
let signMessageCalls = 0
const confirmedMessageBytes = getConfirmedIdentityMessageBytes(true, preview)
if (confirmedMessageBytes) {
  signMessageCalls++
  bytesReceivedBySignMessages = confirmedMessageBytes
}
assert.equal(signMessageCalls, 1)
assert.strictEqual(bytesReceivedBySignMessages, exactBytes)
assert.strictEqual(bytesReceivedBySignMessages, preview.canonicalMessageBytes)

const tamperedBytes = Uint8Array.from(exactBytes)
const tamperedPreview = createIdentityMessagePreview(tamperedBytes)
tamperedBytes[0] ^= 1
assert.throws(() => getConfirmedIdentityMessageBytes(true, tamperedPreview), /changed after preview/)

let cancelledSignMessages = 0
let cancelledNativeSiws = 0
let cancelledSgtQueries = 0
let cancelledWalletOpens = 0
let cancelledClaimApiCalls = 0
const cancelledMessage = getConfirmedIdentityMessageBytes(false, preview)
const cancelledNative = getConfirmedIdentityMessageBytes(false, preview)
if (cancelledMessage) cancelledSignMessages++
if (cancelledNative) cancelledNativeSiws++
if (cancelledMessage || cancelledNative) cancelledSgtQueries++
if (cancelledMessage || cancelledNative) cancelledWalletOpens++
if (cancelledMessage || cancelledNative) cancelledClaimApiCalls++
assert.equal(cancelledMessage, undefined)
assert.equal(cancelledNative, undefined)
assert.equal(cancelledSignMessages, 0)
assert.equal(cancelledNativeSiws, 0)
assert.equal(cancelledSgtQueries, 0)
assert.equal(cancelledWalletOpens, 0)
assert.equal(cancelledClaimApiCalls, 0)

let nativeSiwsCalls = 0
const continuedNative = getConfirmedIdentityMessageBytes(true, preview)
if (continuedNative) nativeSiwsCalls++
assert.strictEqual(continuedNative, exactBytes)
assert.equal(nativeSiwsCalls, 1)
assert.equal(signMessageCalls, 1)

assert.equal(copied.includes(canonicalText), false)
assert.equal(copied.includes(nonce), false)
const walletSignature = Uint8Array.from({ length: 64 }, (_, index) => index)
assert.deepEqual(Array.from(unpackSignedMessagePayload(walletSignature, exactBytes).signedMessage), canonicalMessage)
const modified = Uint8Array.from([...canonicalMessage, ...walletSignature])
modified[0] ^= 1
assert.throws(() => unpackSignedMessagePayload(modified, exactBytes), /different message bytes/)
assert.throws(
  () =>
    getCanonicalAuthenticationMessage({
      ...challenge,
      canonicalMessage: [1, 0, 0, 0, 255, 17, 42],
    }),
  /plain-text authentication message/,
)

console.info('Mobile SIWS, Claim modes, pre-sign preview, and wallet session safety PASS (194 assertions).')
