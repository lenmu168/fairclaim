import type { Challenge } from './api'
import type { SignInCapability } from './siws-diagnostic'

export type AuthenticationPath = 'native-siws' | 'sign-messages-fallback'

export function chooseAuthenticationPath(capability: SignInCapability): AuthenticationPath {
  return capability === false ? 'sign-messages-fallback' : 'native-siws'
}

export function isExplicitSiwsUnsupported(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as Record<string, unknown>
  const values = [candidate.code, candidate.name, candidate.message]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase())
  return values.some(
    (value) =>
      value === 'siws_unsupported' ||
      (value.includes('signinwithsolana') && value.includes('not supported')) ||
      (value.includes('sign-in with solana') && value.includes('does not support')),
  )
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let different = 0
  for (let index = 0; index < left.length; index++) different |= left[index]! ^ right[index]!
  return different === 0
}

export function getCanonicalAuthenticationMessage(challenge: Challenge) {
  if (
    !Array.isArray(challenge.canonicalMessage) ||
    challenge.canonicalMessage.length === 0 ||
    challenge.canonicalMessage.length > 4096 ||
    challenge.canonicalMessage.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
  )
    throw new Error('Server canonical message bytes are invalid.')

  const bytes = Uint8Array.from(challenge.canonicalMessage)
  // A fallback may sign only a printable, server-issued SIWS identity message.
  // Binary payloads (including serialized transactions) are rejected before MWA.
  if (bytes.some((byte) => byte !== 10 && (byte < 32 || byte > 126)))
    throw new Error('Server canonical message is not a plain-text authentication message.')
  const text = new TextDecoder().decode(bytes)
  const requiredFragments = [
    `${challenge.domain} wants you to sign in with your Solana account:\n${challenge.address}`,
    `URI: ${challenge.uri}`,
    `Version: ${challenge.version}`,
    `Chain ID: ${challenge.chainId}`,
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.issuedAt}`,
    `Expiration Time: ${challenge.expirationTime}`,
    `Request ID: ${challenge.requestId}`,
  ]
  if (requiredFragments.some((fragment) => !text.includes(fragment)))
    throw new Error('Server canonical message does not match its SIWS challenge metadata.')
  if (challenge.claimContext) {
    const context = challenge.claimContext
    const genesisAccess = 'kind' in context && context.kind === 'genesis-access'
    if (genesisAccess !== (context.campaignId === 'seeker-genesis-access-2026'))
      throw new Error('Server Claim campaign semantics do not match the campaign ID.')
    let claimFragments: string[]
    if (genesisAccess)
      claimFragments = [
        'Authorize a FairClaim DATABASE-ONLY Seeker Genesis Access claim.',
        `Campaign: ${context.campaignName}.`,
        `Campaign ID: ${context.campaignId}.`,
        `Wallet: ${challenge.address}.`,
        'This authorizes exactly one FairClaim database claim for this campaign.',
        'It does NOT authorize any blockchain transaction, SOL transfer, token transfer, token approval, delegate, authority change, or payment.',
      ]
    else if ('rewardAmount' in context && 'rewardName' in context)
      claimFragments = [
        'Authorize a FairClaim DATABASE-ONLY demo claim.',
        `Campaign: ${context.campaignName}.`,
        `Campaign ID: ${context.campaignId}.`,
        `Reward: ${context.rewardAmount} ${context.rewardName}.`,
        `Wallet: ${challenge.address}.`,
        'This authorizes exactly one FairClaim database claim for this campaign.',
        'It does NOT authorize any blockchain transaction, SOL transfer, token transfer, token approval, delegate, authority change, or payment.',
      ]
    else throw new Error('Server Claim context is invalid.')
    if (
      claimFragments.some((fragment) => !text.includes(fragment)) ||
      (genesisAccess && (challenge.statement !== claimFragments.join(' ') || /Reward:|Pioneer Points/i.test(text)))
    )
      throw new Error('Server Claim context does not match the canonical message bytes.')
  }
  return bytes
}

export function unpackSignedMessagePayload(signedPayload: Uint8Array, canonicalMessage: Uint8Array) {
  if (!(signedPayload instanceof Uint8Array) || signedPayload.length < 64)
    throw new Error('Wallet returned an invalid message signature payload.')
  const splitAt = signedPayload.length - 64
  const returnedMessage = signedPayload.slice(0, splitAt)
  const signedMessage = returnedMessage.length === 0 ? canonicalMessage : returnedMessage
  if (!equalBytes(signedMessage, canonicalMessage)) throw new Error('Wallet returned different message bytes.')
  return {
    signedMessage,
    signature: signedPayload.slice(splitAt),
  }
}
