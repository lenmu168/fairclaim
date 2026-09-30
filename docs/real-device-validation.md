# FairClaim — REAL SEEKER END-TO-END ACCEPTANCE

记录初始日期：2026-09-04。**所有真实设备项目：NOT TESTED。** 自动测试、模拟器、配置解析、preflight 和 RPC 读取均不能将此文件中的真机结果改成 PASS。只有用户提供实际 Seeker 测试结果后才更新；未知或证据不足继续 NOT TESTED，明确失败写 FAIL。

执行前先完成 [环境、EAS、安装与 Metro](real-seeker-env.md)，并让 `npm run preflight:seeker` 全部通过。不要用已在本 campaign 成功领取过的 SGT 期待再次 HTTP 201；若已领过，先记录现状并反馈，不删除真实 Claim 或重置数据库。期间不要让其他人领取，以便比较计数。

## 本次设备与环境

| 项目 | 记录 |
| --- | --- |
| 执行人 / 执行时间 | NOT TESTED |
| Seeker Android 版本 | NOT TESTED |
| Seed Vault Wallet 版本 | NOT TESTED |
| EAS build ID / APK 页面 | NOT TESTED |
| APK 下载与安装 | NOT TESTED |
| Metro 成功加载 FairClaim | NOT TESTED |
| 手机浏览器访问 API health / bypass=false | NOT TESTED |
| 本次 API origin / SIWS domain / URI | NOT TESTED |
| Campaign ID（seeker-genesis-access） | NOT TESTED |
| 实际 Wallet address | NOT TESTED |
| 实际 SGT Mint | NOT TESTED |

地址和 mint 可公开，但不要提供助记词、私钥、数据库/RPC 密钥或完整可重放签名。截图中若出现这些内容先遮盖。

## 证据准备：HTTP 与数据库

UI 的成功文字不能独自证明 HTTP 状态码。手机连接 Metro 后，在 Metro 窗口按 `j` 打开 React Native DevTools，在 **Network / Expo Network** 面板开始观察，再进行下面操作。保留 path、HTTP status、响应 code/receipt、时间；不要分享完整签名请求。若当前 Expo DevTools 不显示响应详情，保留请求记录并反馈，HTTP 项目先保持 NOT TESTED，不能猜测 201/409。[React Native DevTools](https://reactnative.dev/docs/react-native-devtools)

数据库检查可在电脑另开窗口启动现有 Prisma Studio（无需安装新数据库软件）：

```powershell
Set-Location 'C:\Users\TZZ\Documents\ChatGPT\FairClaim\server'
npx prisma studio
```

在打印出的本地网页打开表格，只查看和筛选，不编辑或删除。`SiwsNonce` 按 Network 记录的 nonce 查找，`usedAt` 应非空；payload 应包含正确 domain、URI、chainId、purpose 对应 requestId 及实际钱包地址。`Claim` 和 `ClaimAttempt` 按 campaignId + sgtMint 筛选。核对 `isDevBypass=false`。如果无法操作数据库，可以把非敏感的 wallet/mint/campaignId 与手机结果告诉工程师，由工程师做只读核查后记录；不凭自动测试代填。

服务器执行路径需与实际请求关联审查：`auth.ts::verifyProof` 验签并原子消费 nonce，返回 verified address；`app.ts::execute` 将该地址传给 `verifySgt`；`sgt.ts` 验证 mainnet、Token-2022、官方 authority/group 及持有者属性。数据库与 Network 能确认 nonce 消费、地址与 mint 对应，但不是逐行 RPC trace；实际查询和属性判定如未完成关联核查，相关项继续 NOT TESTED。

## 严格按 A → I 执行

| TEST | 操作与预期 | 实际结果 | 证据 / 数值 |
| --- | --- | --- | --- |
| A | 打开 FairClaim；没有 `DEV SGT BYPASS ACTIVE`。若出现立即停止 | NOT TESTED | NOT TESTED |
| B | 点击 `CONNECT WALLET`；必须实际调起 **Seed Vault Wallet**，核对实际钱包 | NOT TESTED | NOT TESTED |
| C | 点击 `VERIFY SEEKER`；钱包显示 SIWS，核对 mainnet、实际 domain、statement，完成真实签名。App 显示 `VERIFIED SEEKER ✓` 与真实 `SGT MINT` | NOT TESTED | NOT TESTED |
| D | 把完整 SGT Mint 与钱包或 Solana Explorer mainnet 的真实资产数据对照；任意不一致立即 FAIL 并停止 | NOT TESTED | NOT TESTED |
| E | 点击 `ACTIVATE GENESIS ACCESS`；必须新 nonce、新合法 SIWS。Network 返回 **HTTP 201**，UI 显示 `GENESIS ACCESS RECORDED` 并记录回执 | NOT TESTED | NOT TESTED |
| F | 进入 Builder，记录此时 UNIQUE CLAIMS = U、DUPLICATES BLOCKED = D | NOT TESTED | U=NOT TESTED；D=NOT TESTED |
| G | 返回 Claim，点 `TRY CLAIM AGAIN`；再次新 nonce、新合法 SIWS；**HTTP 409**，`code=ALREADY_CLAIMED`；UI `DUPLICATE CLAIM BLOCKED` | NOT TESTED | NOT TESTED |
| H | 返回 Builder，UNIQUE CLAIMS 仍等于 U，DUPLICATES BLOCKED 等于 D+1。不要额外重试影响计数 | NOT TESTED | U'=NOT TESTED；D'=NOT TESTED |
| I | DB 同 campaignId + sgtMint 恰好 **1 Claim**；ClaimAttempt 至少 1 SUCCESS 和 1 DUPLICATE_BLOCKED，均为真实模式 | NOT TESTED | NOT TESTED |

TEST C 钱包 statement 应为 `Sign in to FairClaim to verify Seeker ownership. No transaction or payment is requested.`；claim 的 statement 应明确该 campaign ID、无交易或支付请求。钱包可能显示 mainnet/mainnet-beta 或 `solana:mainnet`；同时在 nonce payload 核对精确 chainId。如果钱包实际没有展示所要求的域/statement/network，请记录实际显示，不能替钱包假设通过。

当前 UI 保持原样：验证卡片的字段名是 `SGT`，值显示缩写，不是可展开的完整 mint。**TEST D 必须在领取前，从 DevTools 的 `/api/seeker/verify` 响应读取完整 `mintAddress`**，确认它的首尾与验证卡片一致，再与钱包/Explorer 对照；同时核对响应 `walletAddress`。无法取得完整值时先停在 D，不为了获取领取回执跳过 D。TEST E 之后可点现有 `VIEW RECEIPT` 查看完整回执字段。

TEST D 使用 [Solana Explorer](https://explorer.solana.com/) 选择 **Mainnet Beta**，搜索完整 mint，比较钱包里的 SGT 资产 mint。不能仅比较截断地址或 token 名称；mint 不同立即 FAIL。官方 group 可读不代表该钱包持有 SGT。

## 必须逐项保留的结论

| 真机项目 | 状态 |
| --- | --- |
| Seed Vault connection | NOT TESTED |
| Real SIWS / mainnet / domain / statement | NOT TESTED |
| Actual request linked to server SIWS verification | NOT TESTED |
| Actual nonce consumed exactly once | NOT TESTED |
| Verified address used for real mainnet lookup | NOT TESTED |
| Official Token-2022 SGT properties verified for actual mint | NOT TESTED |
| Real SGT detected | NOT TESTED |
| SGT Mint manually matched | NOT TESTED |
| First real claim — HTTP 201 | NOT TESTED |
| Duplicate real claim — fresh SIWS, HTTP 409 / ALREADY_CLAIMED | NOT TESTED |
| Builder unique unchanged / duplicates +1 | NOT TESTED |
| Database exactly one Claim + SUCCESS / DUPLICATE_BLOCKED attempts | NOT TESTED |
| End-to-end acceptance | NOT TESTED |

## TEST E 回执

| 字段 | 实测值 |
| --- | --- |
| HTTP status | NOT TESTED |
| Claim ID | NOT TESTED |
| Campaign ID | NOT TESTED |
| Wallet | NOT TESTED |
| SGT Mint | NOT TESTED |
| Timestamp (`claimedAt`) | NOT TESTED |
| `devSgtBypass` | NOT TESTED |

TEST C / E / G 的 nonce 必须互不相同，且对应数据库 usedAt 非空。重复提交同一个签名导致 NONCE_USED 不算 TEST G 通过。

如果使用 SQL 客户端做 TEST I，可以运行下面两条只读查询，替换两个占位值。Prisma Studio 则用相同字段筛选：

```sql
SELECT "campaignId", "sgtMint", COUNT(*) AS claims,
       BOOL_AND(NOT "isDevBypass") AS all_real
FROM "Claim"
WHERE "campaignId" = '实际CAMPAIGN_ID' AND "sgtMint" = '实际SGT_MINT'
GROUP BY "campaignId", "sgtMint";

SELECT "result", "isDevBypass", COUNT(*) AS attempts
FROM "ClaimAttempt"
WHERE "campaignId" = '实际CAMPAIGN_ID' AND "sgtMint" = '实际SGT_MINT'
GROUP BY "result", "isDevBypass";
```

预期第一条 claims=1 且 all_real=true；第二条真实模式下 SUCCESS≥1、DUPLICATE_BLOCKED≥1。任何缺失、bypass=true 或多 Claim 都不能通过。截图、Network 状态和只读 DB 结果齐全后，用户反馈实测结果，才更新此记录。
