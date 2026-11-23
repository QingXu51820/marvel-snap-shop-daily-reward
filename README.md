# MARVEL SNAP 网页商店每日免费奖励

通过 GitHub Actions 每天检查和领取 MARVEL SNAP 网页商店的免费奖励。

- 不保存账号密码
- 不提交 Cookie 或浏览器登录态
- 支持每天定时运行和手动触发
- 已领取时会停止，不会重复领取
- `available > 0` 时调用 `/api/free-offer/claim`，随后刷新目录复核

## 复制给其他用户使用

1. 点击仓库顶部的 **Use this template**，或 Fork 本仓库。
2. 在浏览器中登录 MARVEL SNAP 网页商店。
3. 按 `F12` 打开开发者工具，在 `Network` 中打开一个商店 API 请求，
   从 `Headers → Request Headers → Cookie` 中取得 `shop_session` 的值。
4. 把 `shop_session` 的值写入自己仓库的 Actions Secret：

   `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

   名称：

   ```text
   MARVEL_SNAP_SHOP_SESSION
   ```

   值可以是 `shop_session` 的值，也可以是完整的
   `shop_session=...` 片段。`shop_session` 是 HttpOnly Cookie，
   不能通过网页 Console 的 `document.cookie` 获取。
5. 打开 `Actions` → `MARVEL SNAP Daily Reward` → `Run workflow` 测试。

## 更简单的方式：只复制 Cookie

不需要安装 Node.js 或执行 npm。

1. 登录 `https://shop.marvelsnap.com/zh-CN/`。
2. 按 `F12`，切换到 `Network`。
3. 刷新页面，点击名称类似 `catalog?lang=zh-CN` 的请求。
4. 打开 `Headers`，在 `Request Headers` 中找到 `Cookie`。
5. 找到 `shop_session=`，复制它的值。
6. 把值保存到 GitHub Secret `MARVEL_SNAP_SHOP_SESSION`。

Cookie 会过期或失效。届时重新登录、复制新的值，并覆盖 Secret 即可。

## 可选方式：生成完整登录态

如果希望使用完整的 Playwright 登录态，也可以安装 Node.js：

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

1. 使用上面的“只复制 Cookie”方式取得新的 `shop_session`。
2. 更新仓库 Secret `MARVEL_SNAP_SHOP_SESSION`。

## 安全

- `shop_session` 是可登录商店的完整会话凭据。
- 不要把它发在 Issue、Discussion、截图或聊天记录中。
- `auth.json` 包含与 Cookie 等价的会话信息。
- `profile/` 包含浏览器登录态，不应提交或分享。
- 不要在 Issue、Discussion、日志或截图中公开 Secret。
