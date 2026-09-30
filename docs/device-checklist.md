# 真机验收清单

代码及自动测试通过后，仍须在真实 Seeker 完成以下操作。未全部完成前，不应宣布第一阶段端到端验收完成。

- [ ] 安装 JDK、Android SDK/Platform Tools，`npx solana-mobile@latest doctor` 检查通过。
- [ ] Seeker 开启 USB 调试，`npx solana-mobile@latest device list` 能看到设备。
- [ ] 电脑运行 PostgreSQL 和 FairClaim server，手机浏览器可打开服务器 `/health`。
- [ ] `npm --prefix server run rpc:check` 成功。
- [ ] server 的 `DEV_SGT_BYPASS=false`，控制台及 App 均没有 bypass 警告。
- [ ] 手机 `EXPO_PUBLIC_API_URL` 指向电脑 LAN IP 或 HTTPS tunnel。
- [ ] 手机与服务器的 SIWS domain / uri 完全一致。
- [ ] 安装 Android Development Build（不是 Expo Go）。
- [ ] CONNECT WALLET 成功连接真实 Seed Vault Wallet。
- [ ] VERIFY SEEKER 成功，显示真实 SGT mint，已与链上账户对照。
- [ ] 第一次 ACTIVATE GENESIS ACCESS 成功，保存回执，新活动数据库中存在一条 Claim。
- [ ] 记录 Builder 的 UNIQUE CLAIMS 和 DUPLICATES BLOCKED 数值。
- [ ] TRY CLAIM AGAIN 签署新挑战后显示 DUPLICATE CLAIM BLOCKED。
- [ ] 第二次请求为 HTTP 409 / ALREADY_CLAIMED，同 SGT 的 Claim 数量仍为 1。
- [ ] Builder 的 DUPLICATES BLOCKED 比重试前增加 1。
- [ ] 录像展示连接→验证→领取成功→重复拦截→Builder 指标变化。

具体命令、局域网配置、Development Build 和故障处理见根目录 [README](../README.md)。
