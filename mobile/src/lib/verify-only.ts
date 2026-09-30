export function claimControlForServerMode({
  verifyOnlyMode,
  claimTestMode,
  databaseClaimsEnabled,
}: {
  verifyOnlyMode: boolean | undefined
  claimTestMode: boolean | undefined
  databaseClaimsEnabled?: boolean
}) {
  const enabledModes = [verifyOnlyMode, claimTestMode, databaseClaimsEnabled].filter((value) => value === true).length
  if (enabledModes > 1)
    return {
      enabled: false,
      mode: 'unsafe',
      title: 'CLAIM DISABLED',
    } as const
  if (verifyOnlyMode === true)
    return {
      enabled: false,
      mode: 'verify-only',
      title: 'SGT VERIFY ONLY',
    } as const
  if (claimTestMode === true)
    return {
      enabled: true,
      mode: 'claim-test',
      title: 'ACTIVATE GENESIS ACCESS',
    } as const
  if (databaseClaimsEnabled === true)
    return {
      enabled: true,
      mode: 'database-claims',
      title: 'ACTIVATE GENESIS ACCESS',
    } as const
  return {
    enabled: false,
    mode: 'disabled',
    title: 'CLAIM DISABLED',
  } as const
}

export function hasCurrentWalletVerification(connectedWallet: string | undefined, verifiedWallet: string | undefined) {
  return !!connectedWallet && connectedWallet === verifiedWallet
}

export function deriveClaimUiState({
  healthReady,
  healthError,
  devSgtBypass,
  verifyOnlyMode,
  claimTestMode,
  databaseClaimsEnabled,
  connectedWallet,
  verifiedWallet,
}: {
  healthReady: boolean
  healthError: boolean
  devSgtBypass: boolean | undefined
  verifyOnlyMode: boolean | undefined
  claimTestMode: boolean | undefined
  databaseClaimsEnabled?: boolean
  connectedWallet: string | undefined
  verifiedWallet: string | undefined
}) {
  const authoritative = healthReady && !healthError && devSgtBypass === false
  const enabledModes = [verifyOnlyMode, claimTestMode, databaseClaimsEnabled].filter((value) => value === true).length
  const inconsistent = enabledModes > 1
  const showVerifyOnlyBanner = authoritative && !inconsistent && verifyOnlyMode === true
  const showClaimTestBanner = authoritative && !inconsistent && claimTestMode === true
  const databaseClaimsActive = authoritative && !inconsistent && databaseClaimsEnabled === true
  return {
    mode: !authoritative
      ? ('unavailable' as const)
      : inconsistent
        ? ('unsafe' as const)
        : showVerifyOnlyBanner
          ? ('verify-only' as const)
          : showClaimTestBanner
            ? ('claim-test' as const)
            : databaseClaimsActive
              ? ('database-claims' as const)
              : ('disabled' as const),
    showVerifyOnlyBanner,
    showClaimTestBanner,
    claimEnabled:
      (showClaimTestBanner || databaseClaimsActive) && hasCurrentWalletVerification(connectedWallet, verifiedWallet),
  }
}
