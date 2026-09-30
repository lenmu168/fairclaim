import "dotenv/config";
import { readConfig } from "../src/config.js";
import {
  createSgtRpc,
  MAINNET_GENESIS_HASH,
  SGT_GROUP_MINT_ADDRESS,
} from "../src/sgt.js";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
const config = readConfig(process.env);
const rpc = createSgtRpc(config.SOLANA_MAINNET_RPC_URL);
console.info(`RPC provider: ${config.rpcHostname}.`);
try {
  const hash = await rpc.genesisHash();
  if (hash !== MAINNET_GENESIS_HASH)
    throw new Error("RPC is not Solana mainnet.");
  console.info(`Solana mainnet reachable. Genesis hash: ${hash}.`);
  const group = await rpc.accounts([SGT_GROUP_MINT_ADDRESS], 0n);
  if (group.accounts[0]?.owner !== TOKEN_2022_PROGRAM_ADDRESS)
    throw new Error(
      "Official SGT group account unavailable or owned by the wrong program.",
    );
  console.info("Official SGT group exists and is owned by Token-2022.");
  console.info(
    "This checks the network only; real wallet ownership still requires Seeker + SIWS.",
  );
} catch {
  console.error(`RPC check failed for provider: ${config.rpcHostname}.`);
  process.exitCode = 1;
}
