# FairClaim V1 — Wallet Fund Safety（P0）

审计日期：2026-09-05。Wallet Fund Safety 是 FairClaim V1 的最高优先级安全要求。

## V1 安全边界

FairClaim V1 仅实现：SIWS 钱包所有权验证、服务器端 SGT 验证、one SGT one claim。钱包只允许 `connect`、`disconnect`、`signIn`，以及在钱包明确不支持 native SIWS 时用 `signMessages` 签署服务器返回的 canonical 身份消息字节。安全扫描器限定 `signMessages` 只能接收 `canonicalMessageBytes`，并继续禁止所有交易签名和资产操作。

禁止构造、签名或发送链上交易；禁止 SOL/SPL/NFT 转移、token approval、delegate、authority change、swap、stake、escrow、mint 或 burn。Seeker Genesis Access 是 PostgreSQL 中的数据库领取权，内部兼容金额为 0；历史 Pioneer Points 记录保留在旧活动中。两者都没有 mint、program、token account、lamports 或链上发放逻辑。

VERIFY SEEKER 与 CLAIM 都调用移动端同一个 `prove()`：向服务器获取指定 purpose 的 SIWS nonce，逐项核对 mainnet/domain/URI/address/requestId，通过钱包 `signIn` 获得 authentication signature，再提交四个严格字段：address、nonce、signature、signedMessage。服务器验签并原子消费 nonce，使用签名地址查询 mainnet SGT。VERIFY 返回识别结果；CLAIM 重新执行新 SIWS 与 SGT 查询，然后只写 `Claim` / `ClaimAttempt` 数据库记录。验证签名不能复用为 claim，旧 nonce 不能重放。

应用不请求、接收、存储或输出 seed phrase、mnemonic、private key 或 Seed Vault secret key。钱包签名密钥始终留在钱包/Seed Vault。API proof schema 是 strict；敏感字段或任何额外字段都会以 INVALID_SIGNATURE 拒绝。错误日志现在只记录安全错误 code/class，不打印钱包适配器对象、请求体、签名、signed message、数据库或 RPC 错误详情。

移动端环境仅允许：`EXPO_PUBLIC_API_URL`、`EXPO_PUBLIC_SIWS_DOMAIN`、`EXPO_PUBLIC_SIWS_URI`。数据库连接和 mainnet RPC 只存在服务器环境；不得放入 Expo public config。`npm run security:wallet-funds` 会扫描每个 mobile env 文件、mobile runtime/config plugin、server runtime/scripts、Prisma schema/migrations，并检查钱包 hook 白名单。

## 永久门禁

根目录执行：

```powershell
npm run security:wallet-funds
```

门禁使用 TypeScript AST，而非简单搜索字符串。以下任何标识符进入第一方运行时代码都会退出非零：

- `signAndSendTransaction`、`signTransactions`、`signTransaction`、`signAllTransactions`
- `sendTransaction`、`sendRawTransaction`
- `transfer`、`transferChecked`、transfer instruction
- `approve`、`approveChecked`、approve instruction、`delegate`
- `setAuthority` 与 authority instruction
- `swap`、`stake`、`escrow`
- mint/burn、Solana transaction builders
- seed/mnemonic/private/secret key 字段

每次正常扫描会先运行内建反例测试，证明每个禁用标识符都会被发现，并检查 `useMobileWallet()` 只能解构认证白名单能力。`npm test` 已把此门禁放在数据库/API 测试之前；GitHub Actions 原本执行 `npm test`，所以 push/PR 同样强制检查。扫描脚本自身位于运行时扫描范围之外，避免规则清单被误判成产品能力。

依赖锁文件可能包含 Solana 通用库的 transaction/instruction 模块名称；钱包和 Solana Kit 本身也具备通用能力。这些依赖为 MWA SIWS、地址解析和服务器 RPC/Token-2022 SGT 解码所需。第一方应用未导入、解构或调用它们的资金接口；静态门禁阻止形成可达的资产操作路径。依赖存在不等于 FairClaim 当前具有资产转移功能。

如果未来版本需要真实链上奖励，必须作为独立安全设计重新确定签名内容、程序权限、资产托管、额度、重放/前置交易防护、错误恢复和审计方案，并完成新的资金安全审计。在此之前不得在 V1 中预埋或复用交易逻辑。

## 本次审计结论

| 项目                         | 结论                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| 发起资产转移的第一方代码路径 | PASS — 无                                                                                    |
| `signAndSendTransaction`     | PASS — 无                                                                                    |
| token approval               | PASS — 无                                                                                    |
| delegate                     | PASS — 无资金调用；SGT 测试数据中的只读 decoder 字段不构成授权                               |
| authority change             | PASS — 无                                                                                    |
| 私钥/助记词处理              | PASS — 运行时/API/数据库无相关字段；测试用临时 Ed25519 keypair 不进入产品代码或日志          |
| 手机端服务器 secret          | PASS — 无；实际 mobile env 只有三个公开配置                                                  |
| VERIFY SEEKER                | PASS — 仅 SIWS authentication signature + server SGT lookup                                  |
| CLAIM                        | PASS — 新 SIWS authentication signature + server SGT lookup + PostgreSQL claim，不发链上交易 |
| Campaign entitlement         | PASS — Genesis Access 为数据库领取权；旧 Pioneer Points 活动保留历史记录                     |

**WALLET FUND SAFETY: PASS**
