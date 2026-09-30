export type IdentityMessagePreview = {
  canonicalMessageBytes: Uint8Array
  message: string
}

import type { Challenge } from './api'

export type ClaimAuthorizationContext = NonNullable<Challenge['claimContext']>

export type PreSignPreviewCopy = {
  titleEnglish: string
  titleChinese: string
  notice: string
  authorizations: string[]
  exclusions: string[]
  footer: string
  messageLabel: string
}

export function getPreSignPreviewCopy(
  purpose: 'verify' | 'claim',
  claimContext?: ClaimAuthorizationContext,
): PreSignPreviewCopy {
  if (purpose === 'verify')
    return {
      titleEnglish: 'Identity Message Preview',
      titleChinese: '即将签署身份消息',
      notice: '这是身份验证消息，不是交易。',
      authorizations: [],
      exclusions: [
        '转移 SOL',
        '转移任何 Token',
        '授权代币',
        '设置 Delegate',
        '修改 Authority',
        '产生链上手续费',
        '执行 Claim',
      ],
      footer: 'FairClaim 只会要求钱包签署下面这段身份消息。',
      messageLabel: 'EXACT IDENTITY MESSAGE',
    }

  if (!claimContext) throw new Error('Server Claim authorization context is missing.')
  if ('kind' in claimContext && claimContext.kind === 'genesis-access')
    return {
      titleEnglish: 'DATABASE CLAIM AUTHORIZATION PREVIEW',
      titleChinese: '数据库领取授权预览',
      notice: '这是数据库创世访问领取授权，不是链上交易。',
      authorizations: ['为当前已验证 Seeker 在 FairClaim 数据库中记录一次 Seeker Genesis Access 领取'],
      exclusions: [
        '转移 SOL',
        '转移任何 Token',
        '授权代币',
        '设置 Delegate',
        '修改 Authority',
        '发起任何 Solana 链上交易',
        '产生链上手续费',
        '授权任何资产转移',
      ],
      footer: 'FairClaim 只会要求钱包签署下面这段数据库领取授权消息。',
      messageLabel: 'EXACT DATABASE CLAIM AUTHORIZATION',
    }
  if (!('rewardAmount' in claimContext && 'rewardName' in claimContext))
    throw new Error('Server Claim authorization context is invalid.')
  return {
    titleEnglish: 'DATABASE CLAIM AUTHORIZATION PREVIEW',
    titleChinese: '数据库领取授权预览',
    notice: '这是数据库领取授权，不是链上交易。',
    authorizations: [
      '为当前已验证 Seeker 在 FairClaim 数据库中记录一次领取',
      `领取 ${claimContext.rewardAmount} ${claimContext.rewardName} 测试积分`,
      '该积分仅为 FairClaim 数据库 Demo 奖励',
    ],
    exclusions: [
      '转移 SOL',
      '转移任何 Token',
      '授权代币',
      '设置 Delegate',
      '修改 Authority',
      '发起任何 Solana 链上交易',
      '产生链上手续费',
      '授权任何资产转移',
    ],
    footer: 'FairClaim 只会要求钱包签署下面这段数据库领取授权消息。',
    messageLabel: 'EXACT DATABASE CLAIM AUTHORIZATION',
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let different = 0
  for (let index = 0; index < left.length; index++) different |= left[index]! ^ right[index]!
  return different === 0
}

export function createIdentityMessagePreview(canonicalMessageBytes: Uint8Array): IdentityMessagePreview {
  const message = new TextDecoder('utf-8', { fatal: true }).decode(canonicalMessageBytes)
  if (!equalBytes(new TextEncoder().encode(message), canonicalMessageBytes))
    throw new Error('Identity message preview does not match the canonical message bytes.')
  return { canonicalMessageBytes, message }
}

export function assertIdentityMessagePreviewIntegrity(preview: IdentityMessagePreview) {
  if (!equalBytes(new TextEncoder().encode(preview.message), preview.canonicalMessageBytes))
    throw new Error('Identity message changed after preview.')
}

export function getConfirmedIdentityMessageBytes(confirmed: boolean, preview: IdentityMessagePreview) {
  if (!confirmed) return undefined
  assertIdentityMessagePreviewIntegrity(preview)
  return preview.canonicalMessageBytes
}
