export const GENESIS_ACCESS_SLUG = "seeker-genesis-access";

export function genesisAccessClaimStatement(address: string, campaign: { id: string; name: string }) {
  return [
    "Authorize a FairClaim DATABASE-ONLY Seeker Genesis Access claim.",
    `Campaign: ${campaign.name}.`,
    `Campaign ID: ${campaign.id}.`,
    `Wallet: ${address}.`,
    "This authorizes exactly one FairClaim database claim for this campaign.",
    "It does NOT authorize any blockchain transaction, SOL transfer, token transfer, token approval, delegate, authority change, or payment.",
  ].join(" ");
}
