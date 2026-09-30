import { useEffect, useRef, useState } from 'react'
import { Alert, Clipboard, Modal, Pressable, ScrollView, Share, Text, View } from 'react-native'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Ionicons from '@expo/vector-icons/Ionicons'
import {
  api,
  ApiError,
  cancellation,
  short,
  SIWS_DOMAIN,
  SIWS_URI,
  type Campaign,
  type Challenge,
  type Receipt,
  type Verification,
} from '../lib/api'
import {
  BrandHeader,
  ClaimRightIndicator,
  DataRow,
  GenesisAccessCard,
  LanguageToggle,
  ProtocolAtmosphere,
  SecuritySummaryRow,
  SecurityRecordCard,
  StatusBadge,
  TrustGrid,
  VerifiedIdentityCard,
} from '../components/fairclaim'
import { Button, Card, ClaimTestBanner, colors, DevBanner, Label, Page, s, VerifyOnlyBanner } from '../components/ui'
import { useLanguage } from '../i18n'
import { claimControlForServerMode, deriveClaimUiState, hasCurrentWalletVerification } from '../lib/verify-only'
import {
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
  isWalletSessionInvalidatingError,
  isSigningResultBoundToAcceptedWallet,
  safeWalletAccountSnapshot,
  switchWalletSession,
  walletAccountSnapshot,
  WALLET_MISMATCH_ERROR_CODE,
  type FairClaimWalletSession,
  type WalletSessionDebug,
} from '../lib/wallet-session'
import {
  createSafeConnectDiagnostic,
  createSafeSiwsDiagnostic,
  formatSafeSiwsDiagnostic,
  inspectCapabilities,
  inspectSiwsPayload,
  inspectWalletError,
  logSiwsDiagnostic,
  type CapabilityDiagnostic,
  type SafeSiwsDiagnostic,
} from '../lib/siws-diagnostic'
import {
  chooseAuthenticationPath,
  getCanonicalAuthenticationMessage,
  isExplicitSiwsUnsupported,
  unpackSignedMessagePayload,
} from '../lib/siws-auth'
import {
  createIdentityMessagePreview,
  getConfirmedIdentityMessageBytes,
  type ClaimAuthorizationContext,
  type IdentityMessagePreview,
} from '../lib/pre-sign-preview'
import { palette, radii } from '../theme/tokens'
export default function ClaimPage() {
  const { copy } = useLanguage()
  const { account, connect, connectAnd, disconnect, signIn, signMessages, chain } = useMobileWallet()
  const hookAccount = safeWalletAccountSnapshot(account)
  const hookAccountRef = useRef(hookAccount)
  const connectRef = useRef(connect)
  const [walletSession, setWalletSession] = useState<FairClaimWalletSession>(createFairClaimWalletSession)
  const walletSessionRef = useRef(walletSession)
  const switchStageRef = useRef('not-applicable')
  hookAccountRef.current = hookAccount
  connectRef.current = connect
  walletSessionRef.current = walletSession
  const acceptedAccount = acceptedWalletAccount(walletSession)
  const walletPresentation = deriveRenderedWallet(walletSession, acceptedAccount?.address)
  const wallet = walletPresentation.renderedWallet
  const walletLabel = acceptedAccount?.label
  const activeWallet = useRef(wallet)
  const capabilityRef = useRef<{ address: string; value: CapabilityDiagnostic } | undefined>(undefined)
  activeWallet.current = wallet
  const busyRef = useRef(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState<{ code: string; message: string }>()
  const [siwsDiagnostic, setSiwsDiagnostic] = useState<SafeSiwsDiagnostic>()
  const [verified, setVerified] = useState<Verification>()
  const [receipt, setReceipt] = useState<Receipt>()
  const [blocked, setBlocked] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [showDevTools, setShowDevTools] = useState(false)
  const [dismissedOutcome, setDismissedOutcome] = useState<string>()
  const [lastWalletAction, setLastWalletAction] = useState<WalletSessionDebug['lastWalletAction']>('none')
  const [lastSwitchResult, setLastSwitchResult] = useState<WalletSessionDebug['lastSwitchResult']>('none')
  const [verificationWallet, setVerificationWallet] = useState<string>()
  const [lastVerifyResult, setLastVerifyResult] = useState<WalletSessionDebug['lastVerifyResult']>('none')
  const [preSignPreview, setPreSignPreview] = useState<{
    purpose: 'verify' | 'claim'
    authPath: 'native-siws' | 'sign-messages-fallback'
    preview: IdentityMessagePreview
    claimContext?: ClaimAuthorizationContext
  }>()
  const preSignResolver = useRef<((confirmed: boolean) => void) | undefined>(undefined)
  const cache = useQueryClient()
  const campaign = useQuery({
    queryKey: ['campaign', 'seeker-genesis-access'],
    queryFn: () => api<Campaign>('/api/campaigns/seeker-genesis-access'),
  })
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () =>
      api<{
        devSgtBypass: boolean
        sgtVerifyOnlyMode: boolean
        claimTestMode: boolean
        databaseClaimsEnabled: boolean
      }>('/health'),
    refetchInterval: 30_000,
  })

  useEffect(
    () => () => {
      preSignResolver.current?.(false)
      preSignResolver.current = undefined
    },
    [],
  )

  function requestPreSignConfirmation(
    preview: IdentityMessagePreview,
    authPath: 'native-siws' | 'sign-messages-fallback',
    purpose: 'verify' | 'claim',
    claimContext?: ClaimAuthorizationContext,
  ) {
    return new Promise<boolean>((resolve) => {
      preSignResolver.current = resolve
      setPreSignPreview({ purpose, authPath, preview, claimContext })
    })
  }

  function resolvePreSignConfirmation(confirmed: boolean) {
    const resolve = preSignResolver.current
    preSignResolver.current = undefined
    setPreSignPreview(undefined)
    resolve?.(confirmed)
  }

  function clearWalletResultState() {
    preSignResolver.current?.(false)
    preSignResolver.current = undefined
    setPreSignPreview(undefined)
    capabilityRef.current = undefined
    setVerified(undefined)
    setReceipt(undefined)
    setBlocked(false)
    setError(undefined)
    setSiwsDiagnostic(undefined)
    setShowReceipt(false)
  }

  function commitWalletSession(next: FairClaimWalletSession) {
    walletSessionRef.current = next
    activeWallet.current = acceptedWalletAccount(next)?.address
    setWalletSession(next)
  }

  function startWalletConnection(connectionState: 'connecting' | 'switching') {
    const next = beginWalletConnection(walletSessionRef.current, connectionState)
    commitWalletSession(next)
    return next.generation
  }

  async function invalidateAcceptedWalletSession(generation: number, purpose: 'verify' | 'claim') {
    if (walletSessionRef.current.generation !== generation) return false
    commitWalletSession(invalidateWalletSessionForSigningFailure(walletSessionRef.current, generation))
    clearWalletResultState()
    if (purpose === 'verify') setLastVerifyResult('wallet-session-invalid')
    try {
      await disconnect()
    } catch {
      // FairClaim remains disconnected even if the transport cache cannot be cleared again.
    }
    return true
  }

  function captureConnectDiagnostic(
    stage: 'connect' | 'switch-connect',
    cause: unknown,
    state: { authorizationStarted: boolean | 'unknown'; accountReturned: boolean },
    previousWallet?: string,
    newWallet?: string,
  ) {
    if (!__DEV__) return
    const diagnostic = createSafeConnectDiagnostic({
      stage,
      wallet: stage === 'connect' ? walletLabel : undefined,
      previousWallet,
      newWallet,
      connectionState: walletSessionRef.current.connectionState,
      sessionGeneration: walletSessionRef.current.generation,
      hookAccount: hookAccountRef.current?.address,
      acceptedAccount: walletSessionRef.current.acceptedAccount?.address,
      switchStage: stage === 'switch-connect' ? switchStageRef.current : 'not-applicable',
      error: cause,
      ...state,
    })
    setSiwsDiagnostic(diagnostic)
    logSiwsDiagnostic(true, {
      stage: diagnostic.stage,
      wallet: diagnostic.wallet,
      previousWallet: diagnostic.previousWallet,
      newWallet: diagnostic.newWallet,
      connectionState: diagnostic.connectionState,
      sessionGeneration: diagnostic.sessionGeneration,
      hookAccount: diagnostic.hookAccount,
      acceptedAccount: diagnostic.acceptedAccount,
      switchStage: diagnostic.switchStage,
      errorName: diagnostic.errorName,
      errorCode: diagnostic.errorCode,
      errorMessage: diagnostic.errorMessage,
      errorConstructor: diagnostic.errorConstructor,
      causeName: diagnostic.causeName,
      causeCode: diagnostic.causeCode,
      causeMessage: diagnostic.causeMessage,
      rpcCode: diagnostic.rpcCode,
      rpcMessage: diagnostic.rpcMessage,
      authorizationStarted: diagnostic.authorizationStarted,
      accountReturned: diagnostic.accountReturned,
    })
  }

  // Only the account returned by this explicit, current-generation attempt can establish a FairClaim session.
  async function connectWithDiagnostic(
    stage: 'connect' | 'switch-connect',
    generation: number,
    previousWallet?: string,
  ) {
    let failureState: { authorizationStarted: boolean | 'unknown'; accountReturned: boolean } | undefined
    let returnedAccount: unknown
    try {
      returnedAccount = await connectWalletSession(
        () => connectRef.current(),
        (_cause, state) => {
          failureState = state
        },
      )
      const nextAccount = walletAccountSnapshot(returnedAccount)
      const next = acceptWalletConnection(walletSessionRef.current, generation, nextAccount)
      if (next !== walletSessionRef.current) commitWalletSession(next)
      return nextAccount
    } catch (cause) {
      const currentAttempt = walletSessionRef.current.generation === generation
      if (currentAttempt) {
        commitWalletSession(failWalletConnection(walletSessionRef.current, generation))
        captureConnectDiagnostic(
          stage,
          cause,
          failureState ?? {
            authorizationStarted: 'unknown',
            accountReturned: returnedAccount !== undefined && returnedAccount !== null,
          },
          previousWallet,
        )
      }
      throw cause
    }
  }

  async function waitForWalletUiDisconnect() {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (!hookAccountRef.current) return
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    throw new ApiError(
      'WALLET_CONNECTION_ERROR',
      'Previous wallet session could not be cleared. Connect again explicitly.',
    )
  }

  async function connectFailClosed() {
    setLastWalletAction('connect')
    setVerificationWallet(undefined)
    setLastVerifyResult('none')
    const generation = startWalletConnection('connecting')
    clearWalletResultState()
    let connectStarted = false
    try {
      if (hookAccountRef.current) {
        await disconnect()
        await waitForWalletUiDisconnect()
      }
      if (walletSessionRef.current.generation !== generation) throw new Error('Stale wallet connection attempt.')
      connectStarted = true
      await connectWithDiagnostic('connect', generation)
    } catch (cause) {
      if (walletSessionRef.current.generation === generation) {
        if (walletSessionRef.current.connectionState !== 'disconnected')
          commitWalletSession(failWalletConnection(walletSessionRef.current, generation))
        if (!connectStarted)
          captureConnectDiagnostic('connect', cause, { authorizationStarted: false, accountReturned: false })
        try {
          await disconnect()
        } catch {
          // The FairClaim-owned accepted session remains empty even if transport cache cleanup fails.
        }
      }
      throw cause
    }
  }

  async function disconnectFailClosed() {
    setLastWalletAction('disconnect')
    setVerificationWallet(undefined)
    setLastVerifyResult('none')
    commitWalletSession(disconnectFairClaimWalletSession(walletSessionRef.current))
    await disconnectWalletSession(disconnect, clearWalletResultState)
  }

  async function switchWalletFailClosed() {
    const previousWallet = wallet
    setLastWalletAction('switch')
    setLastSwitchResult('none')
    setVerificationWallet(undefined)
    setLastVerifyResult('none')
    const generation = startWalletConnection('switching')
    switchStageRef.current = 'clear-old-session'
    clearWalletResultState()
    let connectStarted = false
    try {
      switchStageRef.current = 'disconnect'
      await switchWalletSession(disconnect, clearWalletResultState, async () => {
        await waitForWalletUiDisconnect()
        if (walletSessionRef.current.generation !== generation) throw new Error('Stale wallet connection attempt.')
        connectStarted = true
        switchStageRef.current = 'switch-connect'
        return connectWithDiagnostic('switch-connect', generation, previousWallet)
      })
      if (walletSessionRef.current.generation === generation) {
        switchStageRef.current = 'complete'
        setLastSwitchResult('success')
      }
    } catch (cause) {
      const currentAttempt = walletSessionRef.current.generation === generation
      if (currentAttempt && walletSessionRef.current.connectionState !== 'disconnected')
        commitWalletSession(failWalletConnection(walletSessionRef.current, generation))
      if (currentAttempt) setLastSwitchResult('failed')
      if (currentAttempt && !connectStarted)
        captureConnectDiagnostic(
          'switch-connect',
          cause,
          { authorizationStarted: false, accountReturned: false },
          previousWallet,
        )
      throw cause
    }
  }

  function confirmDisconnect() {
    Alert.alert(copy.wallet.disconnectTitle, copy.wallet.disconnectSafety, [
      { text: copy.wallet.cancel, style: 'cancel' },
      {
        text: copy.wallet.disconnectConfirm,
        style: 'destructive',
        onPress: () => void run('disconnect', disconnectFailClosed),
      },
    ])
  }

  function confirmSwitchWallet() {
    Alert.alert(copy.wallet.switchTitle, `${copy.wallet.disconnectSafety}\n\n${copy.wallet.switchSafety}`, [
      { text: copy.wallet.cancel, style: 'cancel' },
      {
        text: copy.wallet.switchConfirm,
        onPress: () => void run('switch', switchWalletFailClosed),
      },
    ])
  }

  async function readSignInCapability(signingAddress: string) {
    const cached = capabilityRef.current
    if (cached?.address === signingAddress) return cached.value
    let value: CapabilityDiagnostic = { featureIds: [], signInWithSolana: 'unknown' }
    try {
      await connectAnd(async (walletApi) => {
        const result = await (
          walletApi as unknown as {
            getCapabilities: () => Promise<{ features: readonly string[] }>
          }
        ).getCapabilities()
        value = inspectCapabilities(result.features)
      })
      capabilityRef.current = { address: signingAddress, value }
      logSiwsDiagnostic(__DEV__, {
        stage: 'getCapabilities',
        wallet: walletLabel ?? 'unknown',
        featureIds: value.featureIds,
        'feature.signInWithSolana': value.signInWithSolana,
      })
    } catch (cause) {
      logSiwsDiagnostic(__DEV__, {
        stage: 'getCapabilities',
        wallet: walletLabel ?? 'unknown',
        featureIds: [],
        'feature.signInWithSolana': 'unknown',
        ...inspectWalletError(cause),
      })
    }
    return value
  }
  const c = campaign.data
  const campaignState = !c
    ? 'LOADING'
    : c.status !== 'ACTIVE'
      ? 'CAMPAIGN_CLOSED'
      : Date.now() < Date.parse(c.startsAt)
        ? 'CAMPAIGN_NOT_STARTED'
        : Date.now() >= Date.parse(c.endsAt)
          ? 'CAMPAIGN_ENDED'
          : 'ACTIVE'
  async function run(label: string, action: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(label)
    setError(undefined)
    if (__DEV__ && (label === 'verify' || label === 'connect' || label === 'switch')) setSiwsDiagnostic(undefined)
    try {
      await action()
    } catch (cause) {
      const connectionFailure = label === 'connect' || label === 'switch'
      if (!cancellation(cause) || connectionFailure) {
        // Never log wallet adapter objects, signed messages, or signatures.
        if (cause instanceof ApiError && cause.code === 'NO_SGT') console.info('[FairClaim eligibility]', cause.code)
        else if (__DEV__ && (label === 'connect' || label === 'switch'))
          console.info('[FairClaim wallet connection failed]', cause instanceof ApiError ? cause.code : 'WALLET_ERROR')
        else console.error('[FairClaim wallet action failed]', cause instanceof ApiError ? cause.code : 'WALLET_ERROR')
        setError(
          cause instanceof ApiError
            ? cause
            : {
                code: connectionFailure ? 'WALLET_CONNECTION_ERROR' : 'WALLET_ERROR',
                message: connectionFailure
                  ? 'Wallet connection could not be completed. Connect again explicitly.'
                  : 'Wallet action could not be completed. Please unlock your wallet and try again.',
              },
        )
      }
    } finally {
      busyRef.current = false
      setBusy('')
    }
  }
  async function prove(purpose: 'verify' | 'claim') {
    if (!wallet || walletSession.connectionState !== 'connected')
      throw new ApiError('NO_WALLET', 'Connect your Seeker wallet first.')
    if (!c) throw new ApiError('SERVER_ERROR', 'Campaign is unavailable. Please try again.')
    const signingCampaign = c
    if (chain !== 'solana:mainnet') throw new ApiError('WRONG_NETWORK', 'Seeker verification requires Solana mainnet.')
    const signingAddress = wallet
    const signingGeneration = walletSession.generation
    if (purpose === 'verify') {
      setVerificationWallet(signingAddress)
      setLastVerifyResult('none')
    }
    const campaignId = signingCampaign.id
    const capability = await readSignInCapability(signingAddress)
    let authPath = chooseAuthenticationPath(capability.signInWithSolana)
    async function requestChallenge(requestedPath: typeof authPath) {
      const challenge = await api<Challenge>('/api/auth/nonce', {
        address: signingAddress,
        purpose,
        campaignId,
        authPath: requestedPath,
      })
      if (
        !SIWS_DOMAIN ||
        !SIWS_URI ||
        challenge.domain !== SIWS_DOMAIN ||
        challenge.uri !== SIWS_URI ||
        challenge.chainId !== 'solana:mainnet' ||
        challenge.version !== '1' ||
        challenge.address !== signingAddress ||
        challenge.requestId !== challenge.nonce ||
        challenge.authPath !== requestedPath
      )
        throw new ApiError('CONFIG_ERROR', 'The app and server identity settings do not match. Contact the builder.')
      const inspection = inspectSiwsPayload(challenge, signingAddress)
      logSiwsDiagnostic(__DEV__, {
        stage: 'payload',
        wallet: walletLabel ?? 'unknown',
        'feature.signInWithSolana': capability.signInWithSolana,
        ...inspection.safeSummary,
        valid: inspection.valid,
        invalidFields: inspection.invalidFields,
      })
      if (!inspection.valid)
        throw new ApiError('CONFIG_ERROR', 'The server generated an invalid sign-in request. Contact the builder.')
      const claimContext = challenge.claimContext
      if ((purpose === 'claim') !== !!claimContext)
        throw new ApiError('CONFIG_ERROR', 'The server generated an invalid Claim authorization. Contact the builder.')
      if (
        purpose === 'claim' &&
        (!claimContext ||
          claimContext.campaignId !== campaignId ||
          claimContext.campaignName !== signingCampaign.name ||
          (signingCampaign.slug === 'seeker-genesis-access' &&
            (!('kind' in claimContext) || claimContext.kind !== 'genesis-access')))
      )
        throw new ApiError('CONFIG_ERROR', 'The server generated an invalid Claim campaign. Contact the builder.')
      return { challenge, inspection }
    }
    let { challenge: issued, inspection: payloadInspection } = await requestChallenge(authPath)
    function captureDiagnostic(
      stage: SafeSiwsDiagnostic['stage'],
      fallbackStage: SafeSiwsDiagnostic['fallbackStage'],
      cause: unknown,
    ) {
      const safeDiagnostic = createSafeSiwsDiagnostic({
        stage,
        authPath,
        fallbackStage,
        wallet: walletLabel,
        capability,
        payload: payloadInspection.safeSummary,
        error: cause,
      })
      logSiwsDiagnostic(__DEV__, {
        ...safeDiagnostic,
        'feature.signInWithSolana': safeDiagnostic.signInWithSolana,
      })
      if (__DEV__ && purpose === 'verify') setSiwsDiagnostic(safeDiagnostic)
    }
    let output: { accountAddress: string; signature: Uint8Array; signedMessage: Uint8Array }
    async function signServerMessage() {
      let preview: IdentityMessagePreview
      try {
        preview = createIdentityMessagePreview(getCanonicalAuthenticationMessage(issued))
      } catch (cause) {
        captureDiagnostic('signMessages', 'challenge-received', cause)
        throw new ApiError('CONFIG_ERROR', 'The server generated an invalid sign-in message. Contact the builder.')
      }
      const confirmed = await requestPreSignConfirmation(
        preview,
        'sign-messages-fallback',
        purpose,
        issued.claimContext,
      )
      const canonicalMessageBytes = getConfirmedIdentityMessageBytes(confirmed, preview)
      if (!canonicalMessageBytes) return undefined
      let signedPayload: Uint8Array
      try {
        signedPayload = await signMessages(canonicalMessageBytes)
      } catch (cause) {
        if (!cancellation(cause) && isWalletSessionInvalidatingError(cause)) {
          await invalidateAcceptedWalletSession(signingGeneration, purpose)
          captureDiagnostic('signMessages', 'wallet-sign-message', cause)
          throw new ApiError(
            WALLET_MISMATCH_ERROR_CODE,
            'The signing wallet did not match the connected FairClaim wallet. The wallet session was disconnected.',
          )
        }
        captureDiagnostic('signMessages', 'wallet-sign-message', cause)
        if (cancellation(cause)) throw cause
        throw new ApiError('WALLET_CONNECTION_ERROR', 'Wallet could not sign the identity message. Please try again.')
      }
      try {
        return {
          accountAddress: signingAddress,
          ...unpackSignedMessagePayload(signedPayload, preview.canonicalMessageBytes),
        }
      } catch (cause) {
        captureDiagnostic('signMessages', 'signature-received', cause)
        throw new ApiError('WALLET_ERROR', 'Wallet returned an invalid identity signature. Please try again.')
      }
    }
    if (authPath === 'sign-messages-fallback') {
      const fallbackOutput = await signServerMessage()
      if (!fallbackOutput) return
      output = fallbackOutput
    } else {
      const {
        canonicalMessage: _canonicalMessage,
        authPath: _authPath,
        claimContext: _claimContext,
        ...nativePayload
      } = issued
      let preview: IdentityMessagePreview
      try {
        preview = createIdentityMessagePreview(getCanonicalAuthenticationMessage(issued))
      } catch (cause) {
        captureDiagnostic('signIn', 'not-applicable', cause)
        throw new ApiError('CONFIG_ERROR', 'The server generated an invalid sign-in message. Contact the builder.')
      }
      const confirmed = await requestPreSignConfirmation(preview, 'native-siws', purpose, issued.claimContext)
      if (!getConfirmedIdentityMessageBytes(confirmed, preview)) return
      try {
        const nativeOutput = await signIn(nativePayload)
        output = {
          accountAddress: nativeOutput.account.address,
          signature: nativeOutput.signature,
          signedMessage: nativeOutput.signedMessage,
        }
      } catch (cause) {
        if (cancellation(cause)) throw cause
        if (!isExplicitSiwsUnsupported(cause)) {
          if (isWalletSessionInvalidatingError(cause)) {
            await invalidateAcceptedWalletSession(signingGeneration, purpose)
            captureDiagnostic('signIn', 'not-applicable', cause)
            throw new ApiError(
              WALLET_MISMATCH_ERROR_CODE,
              'The signing wallet did not match the connected FairClaim wallet. The wallet session was disconnected.',
            )
          }
          captureDiagnostic('signIn', 'not-applicable', cause)
          throw new ApiError('WALLET_CONNECTION_ERROR', 'Wallet could not complete secure sign-in. Please try again.')
        }
        captureDiagnostic('signIn', 'not-applicable', cause)
        // A native SIWS challenge is never relabeled. Explicit unsupported errors
        // receive a fresh server-bound fallback challenge and sign its exact bytes.
        authPath = 'sign-messages-fallback'
        const fallbackChallenge = await requestChallenge(authPath)
        issued = fallbackChallenge.challenge
        payloadInspection = fallbackChallenge.inspection
        const fallbackOutput = await signServerMessage()
        if (!fallbackOutput) return
        output = fallbackOutput
      }
    }
    if (
      activeWallet.current !== signingAddress ||
      !isSigningResultBoundToAcceptedWallet(
        walletSessionRef.current,
        signingGeneration,
        signingAddress,
        output.accountAddress,
      )
    ) {
      await invalidateAcceptedWalletSession(signingGeneration, purpose)
      captureDiagnostic(
        authPath === 'native-siws' ? 'signIn' : 'signMessages',
        authPath === 'native-siws' ? 'not-applicable' : 'signature-received',
        new Error('Signer account mismatch.'),
      )
      throw new ApiError(
        WALLET_MISMATCH_ERROR_CODE,
        'The signing wallet did not match the connected FairClaim wallet. The wallet session was disconnected.',
      )
    }
    // Exactly four fields. No client-supplied public key or verification flag is trusted.
    const proof = {
      address: signingAddress,
      nonce: issued.nonce,
      requestId: issued.requestId,
      authPath,
      signature: Array.from(output.signature),
      signedMessage: Array.from(output.signedMessage),
    }
    try {
      if (purpose === 'verify') {
        const result = await api<Verification>(`/api/seeker/verify?campaignId=${encodeURIComponent(campaignId)}`, proof)
        if (activeWallet.current === signingAddress) {
          setVerified({ ...result, authPath })
          setBlocked(false)
          setLastVerifyResult('success')
        }
      } else {
        const result = await api<Receipt>(`/api/campaigns/${encodeURIComponent(campaignId)}/claim`, proof)
        if (activeWallet.current === signingAddress) {
          setReceipt(result)
          setBlocked(false)
        }
      }
    } catch (cause) {
      if (activeWallet.current !== signingAddress) return
      if (
        cause instanceof ApiError &&
        (cause.code === 'INVALID_SIGNATURE' || cause.code === WALLET_MISMATCH_ERROR_CODE)
      ) {
        await invalidateAcceptedWalletSession(signingGeneration, purpose)
        captureDiagnostic(
          'server',
          authPath === 'sign-messages-fallback' ? 'server-verification' : 'not-applicable',
          cause,
        )
        throw new ApiError(
          WALLET_MISMATCH_ERROR_CODE,
          'The signing wallet did not match the connected FairClaim wallet. The wallet session was disconnected.',
        )
      }
      captureDiagnostic(
        'server',
        authPath === 'sign-messages-fallback'
          ? cause instanceof ApiError && (cause.code === 'NO_SGT' || cause.code === 'RPC_ERROR')
            ? 'sgt-query'
            : 'server-verification'
          : 'not-applicable',
        cause,
      )
      if (cause instanceof ApiError && cause.code === 'ALREADY_CLAIMED') {
        setBlocked(true)
        return
      }
      if (cause instanceof ApiError && cause.code === 'NO_SGT') setVerified(undefined)
      if (purpose === 'verify') setLastVerifyResult('failed')
      throw cause
    } finally {
      await cache.invalidateQueries({ queryKey: ['stats'] })
    }
  }
  const healthReady = health.isSuccess && health.isFetchedAfterMount && !health.isError && !health.isRefetchError
  const campaignReady =
    campaign.isSuccess && campaign.isFetchedAfterMount && !campaign.isError && !campaign.isRefetchError
  const serverAuthorityAvailable = healthReady && campaignReady && health.data?.devSgtBypass === false
  const hasActiveVerification = hasCurrentWalletVerification(wallet, verified?.walletAddress)
  const activeVerified = serverAuthorityAvailable && hasActiveVerification ? verified : undefined
  const activeReceipt = serverAuthorityAvailable && receipt?.walletAddress === wallet ? receipt : undefined
  const activeBlocked = serverAuthorityAvailable && hasActiveVerification && blocked
  const outcomeKey = activeBlocked
    ? `blocked:${activeReceipt?.claimId ?? wallet ?? 'unknown'}`
    : activeReceipt
      ? `success:${activeReceipt.claimId}`
      : undefined
  const showOutcome = !!outcomeKey && dismissedOutcome !== outcomeKey
  const campaignReceiptLabel = c?.name ?? activeReceipt?.campaignId ?? 'unknown'
  const devBypass = health.data?.devSgtBypass === true
  const claimUi = deriveClaimUiState({
    healthReady: serverAuthorityAvailable,
    healthError: health.isError || health.isRefetchError || campaign.isError || campaign.isRefetchError,
    devSgtBypass: health.data?.devSgtBypass,
    verifyOnlyMode: __DEV__ ? health.data?.sgtVerifyOnlyMode : false,
    claimTestMode: __DEV__ ? health.data?.claimTestMode : false,
    databaseClaimsEnabled: health.data?.databaseClaimsEnabled,
    connectedWallet: wallet,
    verifiedWallet: activeVerified?.walletAddress,
  })
  const verifyOnlyMode = claimUi.mode === 'verify-only'
  const claimTestMode = claimUi.mode === 'claim-test'
  const databaseClaimsMode = claimUi.mode === 'database-claims'
  const claimModeActive = claimTestMode || databaseClaimsMode
  const claimControl = claimControlForServerMode({
    verifyOnlyMode,
    claimTestMode,
    databaseClaimsEnabled: databaseClaimsMode,
  })
  const verifyAllowedByFlow =
    serverAuthorityAvailable &&
    !busy &&
    !!c &&
    campaignState === 'ACTIVE' &&
    !activeVerified &&
    !walletPresentation.invariantViolation
  const claimAllowedByFlow =
    serverAuthorityAvailable &&
    !busy &&
    !!activeVerified &&
    claimControl.enabled &&
    claimUi.claimEnabled &&
    !walletPresentation.invariantViolation
  const sessionDebug = deriveWalletSessionDebug({
    session: walletSession,
    rawHookAddress: hookAccount?.address,
    renderedWalletCandidate: acceptedAccount?.address,
    verifiedWallet: verified?.walletAddress,
    verifyAllowedByFlow,
    claimAllowedByFlow,
    lastWalletAction,
    lastSwitchResult,
    verificationWallet,
    lastVerifyResult,
  })
  return (
    <Page>
      <BrandHeader
        devControl={
          __DEV__ ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.dev.toggle}
              accessibilityState={{ expanded: showDevTools }}
              onPress={() => setShowDevTools((visible) => !visible)}
              style={({ pressed }) => ({
                width: 34,
                height: 34,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: showDevTools ? 'rgba(56,220,242,0.10)' : palette.surfaceStrong,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="settings-outline" size={16} color={showDevTools ? palette.cyan : palette.textSecondary} />
            </Pressable>
          ) : undefined
        }
      />
      {__DEV__ && <DevBanner active={devBypass} />}
      {__DEV__ && <VerifyOnlyBanner active={claimUi.showVerifyOnlyBanner} />}
      {__DEV__ && <ClaimTestBanner active={claimUi.showClaimTestBanner} />}
      {__DEV__ && showDevTools && <SessionDebugV2 debug={sessionDebug} />}
      {!showOutcome && (
        <>
          <View style={{ gap: 7, paddingVertical: 3 }}>
            <Label>{copy.access.microLabel}</Label>
            <Text style={s.title}>{copy.access.title}</Text>
            <Text style={[s.h2, { fontSize: 21, lineHeight: 25 }]}>
              {copy.hero.lineOne}
              {`\n`}
              <Text style={{ color: palette.mint }}>{copy.hero.lineTwo}</Text>
            </Text>
            <Text style={s.body}>{copy.hero.subtitle}</Text>
          </View>
          <ProtocolAtmosphere />
        </>
      )}
      {!serverAuthorityAvailable && (
        <Card style={{ borderColor: palette.blocked }}>
          <Label>{copy.access.statusUnavailable}</Label>
          <Text style={s.body}>{copy.access.serverRequired}</Text>
          <Button
            title={copy.campaign.retry}
            loading={campaign.isFetching || health.isFetching}
            onPress={() => {
              void campaign.refetch()
              void health.refetch()
            }}
          />
        </Card>
      )}
      {!activeVerified && (
        <>
          <GenesisAccessCard
            campaignId={c?.id}
            campaignStatus={
              !serverAuthorityAvailable
                ? copy.access.unavailable
                : campaignState === 'ACTIVE'
                  ? copy.campaign.active
                  : campaignState.replace('CAMPAIGN_', '').replaceAll('_', ' ')
            }
            campaignActive={serverAuthorityAvailable && campaignState === 'ACTIVE'}
            state={
              !serverAuthorityAvailable
                ? 'unavailable'
                : activeBlocked
                  ? 'blocked'
                  : activeReceipt
                    ? 'used'
                    : 'available'
            }
            verified={false}
          />
          {serverAuthorityAvailable && (
            <TrustGrid
              items={[
                { icon: 'shield-checkmark-outline', label: copy.trust.verified },
                { icon: 'finger-print-outline', label: copy.trust.unique, tone: 'cyan' },
                { icon: 'git-branch-outline', label: copy.trust.database, tone: 'violet' },
                { icon: 'star-outline', label: copy.trust.noTransfer },
              ]}
            />
          )}
        </>
      )}
      {claimModeActive && activeBlocked && showOutcome ? (
        <SecurityRecordCard
          eyebrow={copy.duplicate.eyebrow}
          title={copy.duplicate.title}
          subtitle={copy.duplicate.detected}
          tone="blocked"
        >
          <View style={s.divider} />
          <ClaimRightIndicator state="blocked" />
          <Text style={{ color: palette.mint, fontSize: 22, lineHeight: 27, fontWeight: '900' }}>
            {copy.duplicate.principle}
          </Text>
          {activeVerified && <DataRow label={copy.verified.sgt} value={short(activeVerified.mintAddress)} selectable />}
          {activeReceipt && <Button secondary title={copy.actions.viewReceipt} onPress={() => setShowReceipt(true)} />}
          <Button secondary title={copy.actions.backHome} onPress={() => setDismissedOutcome(outcomeKey)} />
          {__DEV__ && (
            <Pressable
              disabled={!!busy}
              onPress={() => void run('claim', () => prove('claim'))}
              style={{ alignSelf: 'center', padding: 8, opacity: busy ? 0.4 : 0.72 }}
            >
              <Text style={{ color: palette.textSecondary, fontSize: 9, fontWeight: '800' }}>
                {copy.actions.retryClaim}
              </Text>
            </Pressable>
          )}
        </SecurityRecordCard>
      ) : claimModeActive && activeReceipt && showOutcome ? (
        <View style={{ gap: 14 }}>
          <ProtocolAtmosphere success />
          <SecurityRecordCard
            eyebrow={copy.success.eyebrow}
            title={copy.success.title}
            subtitle={copy.success.subtitle}
          >
            <ClaimRightIndicator state="used" />
            <StatusBadge label={copy.success.claimed} />
            <ReceiptFields receipt={activeReceipt} campaignSlug={campaignReceiptLabel} />
            <Button title={copy.actions.viewReceipt} onPress={() => setShowReceipt(true)} />
            <Button secondary title={copy.actions.backHome} onPress={() => setDismissedOutcome(outcomeKey)} />
          </SecurityRecordCard>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          {wallet && (
            <Card style={{ padding: 16, gap: 12, backgroundColor: palette.surfaceStrong }}>
              <View style={s.row}>
                <StatusBadge label={copy.wallet.connected} />
                <Text selectable style={[s.value, { fontSize: 12 }]}>
                  {short(wallet)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <WalletSessionAction title={copy.wallet.disconnect} disabled={!!busy} onPress={confirmDisconnect} />
                <WalletSessionAction title={copy.wallet.switch} disabled={!!busy} onPress={confirmSwitchWallet} />
              </View>
            </Card>
          )}
          {activeVerified && (
            <>
              <VerifiedIdentityCard
                eyebrow={copy.verified.title}
                title={`${copy.access.title}\n${copy.access.eligible}`}
                rows={[
                  { label: copy.verified.wallet, value: short(activeVerified.walletAddress), selectable: true },
                  { label: copy.verified.sgt, value: short(activeVerified.mintAddress), selectable: true },
                  { label: copy.verified.network, value: 'Solana Mainnet' },
                  {
                    label: copy.verified.auth,
                    value: activeVerified.authPath === 'native-siws' ? 'native SIWS' : 'sign-messages fallback',
                  },
                  { label: copy.verified.status, value: copy.verified.eligible },
                ]}
              />
              <GenesisAccessCard
                campaignId={c?.id}
                campaignStatus={
                  campaignState === 'ACTIVE'
                    ? copy.campaign.active
                    : campaignState.replace('CAMPAIGN_', '').replaceAll('_', ' ')
                }
                campaignActive={campaignState === 'ACTIVE'}
                state={activeBlocked ? 'blocked' : activeReceipt ? 'used' : 'available'}
                verified
              />
            </>
          )}
          {wallet && !activeVerified && (
            <Card style={{ backgroundColor: palette.surfaceStrong, borderColor: palette.borderBright }}>
              <View style={s.row}>
                <Label>{copy.safety.title}</Label>
                <Ionicons name="shield-checkmark-outline" size={20} color={palette.cyan} />
              </View>
              <Text style={s.body}>
                {copy.safety.noTransaction} · {copy.safety.noApproval} · {copy.safety.noTransfer}
              </Text>
              <Text style={[s.value, { color: palette.mint, fontSize: 13 }]}>{copy.safety.loginOnly}</Text>
            </Card>
          )}
          {activeVerified && (
            <Text style={[s.body, { fontSize: 12, lineHeight: 18, paddingHorizontal: 4 }]}>
              {verifyOnlyMode ? copy.safety.verifiedOnly : copy.safety.claimIdentity}
            </Text>
          )}
          {activeBlocked ? (
            <SecurityRecordCard
              eyebrow={copy.duplicate.eyebrow}
              title={copy.duplicate.detected}
              subtitle={copy.duplicate.principle}
              tone="blocked"
            >
              <ClaimRightIndicator state="blocked" />
              {activeReceipt && (
                <Button secondary title={copy.actions.viewReceipt} onPress={() => setShowReceipt(true)} />
              )}
            </SecurityRecordCard>
          ) : activeVerified && verifyOnlyMode ? (
            <View style={{ gap: 8 }}>
              <Button title={copy.modes.claimDisabled} disabled onPress={() => undefined} />
              <Text style={[s.body, { textAlign: 'center', fontSize: 12 }]}>{copy.modes.verifyOnlyBody}</Text>
            </View>
          ) : (
            <Button
              title={
                busy
                  ? busy === 'connect' || busy === 'switch'
                    ? copy.wallet.opening
                    : busy === 'disconnect'
                      ? copy.wallet.disconnecting
                      : busy === 'verify'
                        ? copy.actions.verifying
                        : busy === 'claim'
                          ? copy.actions.claiming
                          : copy.actions.working
                  : !serverAuthorityAvailable
                    ? copy.actions.serverUnavailable
                    : !wallet
                      ? copy.wallet.connect
                      : !activeVerified
                        ? copy.actions.verify
                        : claimControl.enabled
                          ? copy.actions.claim
                          : claimControl.title
              }
              disabled={
                !!busy ||
                !serverAuthorityAvailable ||
                walletPresentation.invariantViolation ||
                walletSession.connectionState === 'connecting' ||
                walletSession.connectionState === 'switching' ||
                !c ||
                campaignState !== 'ACTIVE' ||
                (activeVerified !== undefined && (!claimControl.enabled || !claimUi.claimEnabled))
              }
              loading={!!busy}
              onPress={() =>
                void run(!wallet ? 'connect' : !activeVerified ? 'verify' : 'claim', async () => {
                  if (!wallet) await connectFailClosed()
                  else if (!activeVerified) await prove('verify')
                  else if (claimControl.enabled && claimUi.claimEnabled) await prove('claim')
                })
              }
            />
          )}
        </View>
      )}
      {error?.code === WALLET_MISMATCH_ERROR_CODE ? (
        <>
          <Card style={{ borderColor: colors.red }}>
            <Label>{copy.errors.mismatch}</Label>
            <Text style={s.h2}>{copy.errors.mismatchTitle}</Text>
            <Text style={s.body}>{copy.errors.mismatchBody}</Text>
          </Card>
          {__DEV__ && siwsDiagnostic && <SiwsDiagnosticPanel diagnostic={siwsDiagnostic} />}
        </>
      ) : error?.code === 'NO_SGT' ? (
        <Card style={{ borderColor: colors.teal }}>
          <Label>{copy.errors.noSgt}</Label>
          <Text style={s.h2}>{copy.errors.noSgtTitle}</Text>
          <Text style={s.body}>{copy.errors.noSgtBody}</Text>
          <View style={s.divider} />
          <Text style={[s.value, { color: palette.mint, fontSize: 12 }]}>{copy.errors.noSgtSafety}</Text>
        </Card>
      ) : error ? (
        <>
          <Card>
            <Label>{error.code}</Label>
            <Text accessibilityRole="alert" style={s.error}>
              {error.message}
            </Text>
          </Card>
          {__DEV__ && siwsDiagnostic && <SiwsDiagnosticPanel diagnostic={siwsDiagnostic} />}
        </>
      ) : null}
      {!!busy && (activeReceipt || activeBlocked) && <Text style={s.body}>{copy.actions.working}</Text>}
      <Text style={[s.body, { textAlign: 'center', fontSize: 11 }]}>{copy.footer}</Text>
      <Modal visible={showReceipt} animationType="slide" onRequestClose={() => setShowReceipt(false)}>
        <Page>
          <BrandHeader />
          {activeReceipt && (
            <>
              {__DEV__ && <DevBanner active={activeReceipt.devSgtBypass} />}
              <SecurityRecordCard
                eyebrow={copy.receipt.category}
                title={copy.receipt.title}
                subtitle={copy.receipt.subtitle}
              >
                <ClaimRightIndicator state="used" />
                <Text style={[s.body, { color: palette.mint, fontSize: 11, fontWeight: '800' }]}>
                  {copy.receipt.databaseRecord} · {copy.receipt.noTransaction} · {copy.receipt.noFee}
                </Text>
                <ReceiptFields receipt={activeReceipt} campaignSlug={campaignReceiptLabel} full />
              </SecurityRecordCard>
              <Button
                title={copy.actions.shareReceipt}
                onPress={() =>
                  void run('share', async () => {
                    await Share.share({
                      message: `FairClaim · One Seeker. One Claim.\n${JSON.stringify(activeReceipt, null, 2)}`,
                    })
                  })
                }
              />
            </>
          )}
          <Button secondary title={copy.actions.close} onPress={() => setShowReceipt(false)} />
        </Page>
      </Modal>
      <PreSignPreviewModal
        pending={preSignPreview}
        wallet={wallet}
        sgtMint={activeVerified?.mintAddress}
        onCancel={() => resolvePreSignConfirmation(false)}
        onContinue={() => resolvePreSignConfirmation(true)}
      />
    </Page>
  )
}

function PreSignPreviewModal({
  pending,
  wallet,
  sgtMint,
  onCancel,
  onContinue,
}: {
  pending:
    | {
        purpose: 'verify' | 'claim'
        authPath: 'native-siws' | 'sign-messages-fallback'
        preview: IdentityMessagePreview
        claimContext?: ClaimAuthorizationContext
      }
    | undefined
  wallet?: string
  sgtMint?: string
  onCancel: () => void
  onContinue: () => void
}) {
  const { copy } = useLanguage()
  const claimPreview = pending?.purpose === 'claim'
  return (
    <Modal visible={!!pending} animationType="slide" onRequestClose={onCancel}>
      <Page>
        <View style={s.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.preview.cancel}
            onPress={onCancel}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surfaceStrong,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={20} color={palette.text} />
          </Pressable>
          <Label>{copy.preview.category}</Label>
          <LanguageToggle />
        </View>
        <View style={{ gap: 8 }}>
          <Label>{copy.preview.category}</Label>
          <Text style={s.h2}>{claimPreview ? copy.preview.claimTitle : copy.preview.verifyTitle}</Text>
          {claimPreview && <Text style={s.body}>{copy.preview.description}</Text>}
        </View>
        <Card style={{ borderColor: palette.borderBright, backgroundColor: palette.surfaceStrong }}>
          <View style={s.row}>
            <Label>{claimPreview ? copy.preview.authorization : copy.preview.identity}</Label>
            <Ionicons name="shield-checkmark-outline" size={22} color={palette.mint} />
          </View>
          <View style={s.divider} />
          <SecuritySummaryRow
            icon="key-outline"
            label={copy.preview.action}
            value={claimPreview ? copy.preview.claimAction : copy.preview.verifyAction}
          />
          <SecuritySummaryRow
            icon="wallet-outline"
            label={copy.preview.wallet}
            value={wallet ? short(wallet) : '—'}
            selectable
          />
          {claimPreview && (
            <SecuritySummaryRow
              icon="at-outline"
              label={copy.preview.sgt}
              value={sgtMint ? short(sgtMint) : '—'}
              selectable
            />
          )}
          <SecuritySummaryRow icon="globe-outline" label={copy.preview.network} value="Solana Mainnet" />
          <SecuritySummaryRow
            icon="document-text-outline"
            label={copy.preview.messageType}
            value={pending?.authPath === 'native-siws' ? 'native SIWS' : 'sign-messages fallback'}
          />
          {claimPreview && (
            <SecuritySummaryRow
              icon="git-branch-outline"
              label={copy.preview.purpose}
              value={copy.preview.claimPurpose}
            />
          )}
          <SecuritySummaryRow icon="remove-circle-outline" label={copy.preview.fee} value={copy.preview.none} />
          <SecuritySummaryRow
            icon="shield-checkmark-outline"
            label={copy.preview.security}
            value={copy.preview.securityValue}
          />
        </Card>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: palette.borderBright }}>
          <Ionicons name="information-circle-outline" size={28} color={palette.cyan} />
          <Text style={[s.body, { flex: 1, color: palette.text }]}>
            {claimPreview ? copy.preview.claimConsent : copy.preview.verifyConsent}
          </Text>
        </Card>
        <View style={{ gap: 8 }}>
          <Label>
            {claimPreview ? copy.preview.exactClaim : copy.preview.exactVerify} ·{' '}
            {pending?.authPath === 'native-siws' ? 'NATIVE SIWS' : 'SIGN MESSAGE'}
          </Label>
          <ScrollView
            nestedScrollEnabled
            style={{ maxHeight: 330, borderWidth: 1, borderColor: colors.border, borderRadius: 16 }}
            contentContainerStyle={{ padding: 16 }}
          >
            <Text selectable style={{ color: colors.text, fontSize: 12, lineHeight: 19, fontFamily: 'monospace' }}>
              {pending?.preview.message ?? ''}
            </Text>
          </ScrollView>
        </View>
        <Button secondary title={copy.preview.cancel} onPress={onCancel} />
        <Button title={copy.preview.continue} onPress={onContinue} />
      </Page>
    </Modal>
  )
}

function WalletSessionAction({ title, disabled, onPress }: { title: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          minHeight: 42,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radii.md,
          backgroundColor: palette.surfaceStrong,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 8,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={{ color: colors.text, fontSize: 10, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
    </Pressable>
  )
}

function SessionDebugV2({ debug }: { debug: WalletSessionDebug }) {
  const fields: [string, string | number | boolean][] = [
    ['Connection State', debug.connectionState],
    ['Generation', debug.generation],
    ['Raw Hook Account', debug.rawHookAccount],
    ['Accepted Account', debug.acceptedAccount],
    ['Rendered Wallet', debug.renderedWallet],
    ['Verified Wallet', debug.verifiedWallet],
    ['Can Verify', debug.canVerify],
    ['Can Claim', debug.canClaim],
    ['Last Wallet Action', debug.lastWalletAction],
    ['Last Switch Result', debug.lastSwitchResult],
    ['Verification Wallet', debug.verificationWallet],
    ['Last Verify Result', debug.lastVerifyResult],
  ]
  return (
    <Card style={{ borderColor: debug.invariantViolation ? colors.red : colors.border, gap: 8 }}>
      <Label>SESSION MODEL: V2</Label>
      <Text style={{ color: colors.teal, fontSize: 12, fontWeight: '800' }}>SESSION DEBUG V2</Text>
      {debug.invariantViolation && (
        <Text accessibilityRole="alert" style={[s.error, { fontWeight: '800' }]}>
          SESSION INVARIANT VIOLATION
        </Text>
      )}
      {fields.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Text style={[s.body, { fontSize: 10 }]}>{label}</Text>
          <Text selectable style={[s.value, { fontSize: 10, textAlign: 'right' }]}>
            {String(value)}
          </Text>
        </View>
      ))}
    </Card>
  )
}

function SiwsDiagnosticPanel({ diagnostic }: { diagnostic: SafeSiwsDiagnostic }) {
  const connection = diagnostic.stage === 'connect' || diagnostic.stage === 'switch-connect'
  const common: [string, string | number | boolean][] = [
    ['Stage', diagnostic.stage],
    ['Wallet', diagnostic.wallet],
    ['Error Name', diagnostic.errorName],
    ['Error Code', diagnostic.errorCode],
    ['Error Message', diagnostic.errorMessage],
    ['Error Constructor', diagnostic.errorConstructor],
    ['Cause Name', diagnostic.causeName],
    ['Cause Code', diagnostic.causeCode],
    ['Cause Message', diagnostic.causeMessage],
    ['MWA RPC Code', diagnostic.rpcCode],
    ['MWA RPC Message', diagnostic.rpcMessage],
  ]
  const fields: [string, string | number | boolean][] = connection
    ? [
        ...common,
        ['Previous Wallet', diagnostic.previousWallet],
        ['New Wallet', diagnostic.newWallet],
        ['Connection State', diagnostic.connectionState],
        ['Session Generation', diagnostic.sessionGeneration],
        ['Hook Account', diagnostic.hookAccount],
        ['Accepted Account', diagnostic.acceptedAccount],
        ['Switch Stage', diagnostic.switchStage],
        ['Authorization Started', diagnostic.authorizationStarted],
        ['Account Returned', diagnostic.accountReturned],
      ]
    : [
        ...common,
        ['AUTH PATH', diagnostic.authPath],
        ['FALLBACK STAGE', diagnostic.fallbackStage],
        ['SIWS Capability', String(diagnostic.signInWithSolana)],
        ['chainId', diagnostic.chainId],
        ['domain', diagnostic.domain],
        ['uri', diagnostic.uri],
        ['nonceLength', diagnostic.nonceLength],
        ['issuedAt', diagnostic.issuedAt],
        ['address', diagnostic.address],
      ]
  return (
    <Card style={{ borderColor: colors.teal }}>
      <Label>DEVELOPMENT DIAGNOSTIC</Label>
      {fields.map(([label, value]) => (
        <View key={label} style={{ gap: 3 }}>
          <Label>{label}</Label>
          <Text selectable style={[s.value, { fontSize: 12 }]}>
            {String(value)}
          </Text>
        </View>
      ))}
      <Button
        title="COPY SAFE DIAGNOSTIC"
        secondary
        onPress={() => Clipboard.setString(formatSafeSiwsDiagnostic(diagnostic))}
      />
    </Card>
  )
}

function ReceiptFields({ receipt, campaignSlug, full }: { receipt: Receipt; campaignSlug: string; full?: boolean }) {
  const { copy, language } = useLanguage()
  const fields: [label: string, value: string, shorten: boolean, icon: keyof typeof Ionicons.glyphMap][] = [
    [copy.receipt.wallet, receipt.walletAddress, true, 'wallet-outline'],
    [copy.receipt.sgt, receipt.sgtMint, true, 'finger-print-outline'],
    [copy.receipt.campaign, campaignSlug, false, 'layers-outline'],
    [copy.receipt.claimId, receipt.claimId, true, 'document-text-outline'],
    [
      copy.receipt.timestamp,
      new Date(receipt.claimedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US'),
      false,
      'time-outline',
    ],
    [copy.receipt.storage, copy.receipt.database, false, 'server-outline'],
    [copy.receipt.blockchain, copy.receipt.none, false, 'code-slash-outline'],
    [copy.receipt.fee, copy.receipt.none, false, 'remove-circle-outline'],
  ]
  return (
    <View>
      {fields.map(([label, value, shorten, icon]) => (
        <SecuritySummaryRow
          key={label}
          icon={icon}
          label={label}
          value={full || !shorten ? value : short(value)}
          selectable
        />
      ))}
    </View>
  )
}
