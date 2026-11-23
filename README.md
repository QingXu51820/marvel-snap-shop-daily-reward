# MARVEL SNAP 网页商店每日免费奖励

通过 GitHub Actions 每天检查和领取 MARVEL SNAP 网页商店的免费奖励。

- 不保存账号密码
- 不提交 Cookie 或浏览器登录态
- 支持每天定时运行和手动触发
- 已领取时会停止，不会重复领取
- `available > 0` 时调用 `/api/free-offer/claim`，随后刷新目录复核

## 复制给其他用户使用

1. 点击仓库顶部的 **Use this template**，或 Fork 本仓库。
2. 在本地取得自己的网页商店登录态。
3. 把登录态写入自己仓库的 Actions Secret：

   `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

   名称：

   ```text
   MARVEL_SNAP_AUTH_JSON
   ```

   值是 Playwright `storageState` JSON，可通过本仓库脚本生成。
4. 打开 `Actions` → `MARVEL SNAP Daily Reward` → `Run workflow` 测试。

## 获取自己的登录态

需要 Node.js 20 或更高版本。

```bash
npm ci
npm run login
```

脚本会打开专用 Chrome 浏览器。在浏览器里完成 MARVEL SNAP 网页商店登录后，
脚本会生成 `auth.json`。不要提交或分享这个文件。

Windows 默认使用：

```text
C:\Program Files\Google\Chrome\Application\chrome.exe
```

Chrome 安装在其他位置时，可设置环境变量 `MARVEL_SNAP_CHROME`。

## 配置 Secret

Windows PowerShell：

```powershell
Get-Content -Raw .\auth.json | gh secret set MARVEL_SNAP_AUTH_JSON
```

macOS / Linux：

```bash
gh secret set MARVEL_SNAP_AUTH_JSON < auth.json
```

也可以直接在 GitHub 网页中粘贴 `auth.json` 的完整内容。

## 可选代理

GitHub 托管运行器通常可以直接访问商店。如果日志出现 `HTTP 451`，可设置
另一个 Repository Secret：

```text
MARVEL_SNAP_PROXY=http://proxy-host:port
```

## 定时时间

- 每天 09:10（北京时间）
- 每天 21:10（北京时间，补领）

GitHub Scheduled Workflow 可能延迟启动，因此保留了晚间补领。

## 本地运行

```bash
npm run check
npm run claim
```

结果写入 `last-result.json`，日志写入 `marvel-snap-reward.log`；两者均已加入
`.gitignore`。

## 登录态失效

当 GitHub Actions 日志显示 `login_required` 或 `HTTP 401` 时：

1. 重新运行 `npm run login`。
2. 用新的 `auth.json` 更新仓库 Secret `MARVEL_SNAP_AUTH_JSON`。

## 安全

- `auth.json` 包含可登录商店的会话信息，应视同凭据。
- `profile/` 包含浏览器登录态，不应提交或分享。
- 不要在 Issue、Discussion、日志或截图中公开 Secret。
