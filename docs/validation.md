# FairClaim validation record

日期：2026-09-04；环境：Windows 10 x64，Node.js 24.18.0，npm 11.16.0。

**结论：代码实现及本机自动验证已完成；第一阶段的真实 Seeker 端到端验收尚未完成。** 未生成或安装 APK，未声称真实 Seed Vault 签名及设备 SGT 已成功领取。

## 已执行并通过

| 检查 | 实际结果 |
|---|---|
| 官方 Skills 安装 | 通过；官方 ZIP 下载后执行 skills installer，安装 5 个技能 |
| `npm test` | **56/56 通过**；2 个测试文件；最后一次 21:32 CST，Vitest 执行 3.34 秒 |
| 真实 PostgreSQL 集成测试 | PostgreSQL 18.4；每次使用隔离测试库并执行正式 SQL migration |
| nonce 并发重放 | 恰好 1 次成功认证，另 1 次 NONCE_USED |
| 两份新 SIWS 并发领取同一 SGT/Campaign | 恰好 1 个 HTTP 201，1 个 HTTP 409 / ALREADY_CLAIMED |
| 数据库唯一约束 | 直接绕过 API 插入重复 Claim，数据库仍返回 P2002 |
| Builder 计数 | 1 Claim、1 unique SGT、1 duplicate；测试验证实际 API 返回值 |
| Token-2022 属性和余额 | 使用真实 encoder/decoder 构建二进制测试，Frozen 正余额通过，零余额/伪造属性被拒绝 |
| server/mobile strict TypeScript | 两端 `tsc --noEmit` 均通过 |
| server 编译 | `tsc -p tsconfig.build.json` 通过 |
| Android 原生工程生成 | `expo prebuild --platform android --no-install` 通过 |
| Android JS/Hermes 打包 | `expo export --platform android --output-dir dist` 通过；1569 modules，4.5 MB HBC |
| 本地开发数据库 migration / seed | 历史 Seeker Pioneer Drop 保留；Seeker Genesis Access 的插入逻辑已在隔离数据库验证，但当前真实开发库尚未执行新 seed |
| 真实服务启动 | 编译后的 `npm start` 成功；端口 3000；bypass OFF |
| 实际 HTTP smoke check | `/health`、活动详情、stats 返回正确数据；演示库尚无领取记录 |
| 实际 mainnet RPC | Kit RPC 成功读取完整主网 genesis hash，以及官方 SGT group 的 Token-2022 program owner |
| 配置防泄露 | `.env`、server/mobile `.env`、`.local` 数据均被 Git 忽略 |

## 自动验证中发现并修复

1. 最新 Token-2022 客户端要求 Kit 8，而官方手机模板为 Kit 7。服务端/移动端使用独立依赖树和 lockfile，没有使用 force 安装。
2. Prisma 7 PostgreSQL adapter 的唯一约束错误位于 `meta.driverAdapterError.cause.constraint.index`，不是旧示例的 `meta.target`。首轮真实测试发现重复领取返回 500；修复为精确匹配 Claim 的复合唯一索引，重跑全部通过。
3. 区分 Solana 完整 RPC genesis hash 与较短的 CAIP-2 reference，并用真实主网只读请求核对完整值。
4. 默认主网 RPC 域名在本机 Node 环境连接超时。使用实际可达的公开主网节点配置，并经 Kit 客户端验证；没有关闭主网检查或模拟 SGT。

## 环境限制与待验收项

- `solana-mobile doctor` 确认没有 JDK、Android SDK、adb 或 emulator。
- `npm run android -- --no-bundler` 已尝试，因 Android SDK/adb 缺失失败。**prebuild/Hermes 成功不是 APK 构建成功，也不是 App 已启动。**
- 没有可操作的真实 Seeker，因此 MWA 与 Seed Vault 连接、真实 SIWS、真实持有 SGT mint 显示、首次领取、重复拦截与真机 Builder 动画/布局均待验收。
- 实际主网检查证明网络可达、官方 group 存在；不能证明任意指定用户当前拥有 SGT。
- 构建有上游 `@noble/hashes/crypto.js` exports fallback 警告，打包成功；需在真机上验证签名原生运行情况。模板 React Native 0.86.2 与当前 Expo 推荐补丁 0.86.3 有提示，本阶段保持官方模板组合。
- 便携 PostgreSQL 为开发/测试用途；Docker Compose/CI 定义使用 PostgreSQL 17，Docker 在本机未运行。跨版本 migration 的实际 CI 结果待仓库 CI 执行。
- 无生产部署或链上发放；历史 Pioneer Points 仅属于保留的旧活动，新活动是数据库中的 Seeker Genesis Access 领取权。

## 本机保留的运行状态

开发 PostgreSQL 保留在 `.local/postgres`（5432，仅 loopback）。FairClaim API 已启动在 3000，使用 `DEV_SGT_BYPASS=false`。如果任务终端已停止，按 README 的 `db:local` 和 `server` 命令重新启动。

测试数据库已停止；测试产生的数据不会进入演示 Campaign。真实钱包私钥、助记词和 RPC key 未被请求或写入代码。

下一步：按 [真实设备验收清单](device-checklist.md) 和 [README](../README.md) 完成第一次真机演示。在那之前保留“真机待验收”状态，不继续开发额外功能。

## 2026-09-20 Genesis Access 语义迁移状态

新 Campaign、专属签名语义及移动端验证代码已通过隔离数据库测试。当前真实开发库的只读查询仅返回历史 `seeker-pioneer` 活动（1 条 Claim、21 条 ClaimAttempt），尚无 `seeker-genesis-access`。自动审批拒绝在真实开发库执行 seed，因此新活动在该库中尚未启用。历史记录未修改；取得明确授权后再单独插入新 Campaign。
