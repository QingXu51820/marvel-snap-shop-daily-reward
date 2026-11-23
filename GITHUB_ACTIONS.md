# GitHub Actions 云端打卡

该 Action 使用仓库 Secret `MARVEL_SNAP_AUTH_JSON` 中保存的网页商店登录态，
直接调用领取接口，不启动浏览器，也不需要提交 `auth.json`。

## 运行时间

- 每天 09:10（北京时间）
- 每天 21:10（北京时间，作为补领）
- 也可以在 GitHub 的 Actions 页面手动点击 `Run workflow`

GitHub 的定时任务可能延迟开始，因此 21:10 的第二次运行用于补领。

## 首次配置

1. Fork 或使用本仓库模板创建自己的仓库。
2. 登录网页商店，按 `F12` 打开 `Network`。
3. 刷新页面，点击 `catalog?lang=zh-CN` 请求。
4. 在 `Headers → Request Headers → Cookie` 中找到 `shop_session`。
5. 把 `shop_session` 的值保存为仓库 Secret：

```powershell
gh secret set MARVEL_SNAP_SHOP_SESSION
```

也可以使用完整的 Playwright `auth.json`，保存为另一个 Secret
`MARVEL_SNAP_AUTH_JSON`。两种方式二选一即可。

6. 如果需要固定代理，再设置可选 Secret：

```powershell
gh secret set MARVEL_SNAP_PROXY --body "http://proxy-host:port"
```

GitHub 托管运行器通常可以直连商店。如果日志出现 `HTTP 451`，才需要设置
`MARVEL_SNAP_PROXY`。

## 安全边界

- 不提交账号密码。
- 不提交 `auth.json` 或 `shop_session`。
- 不提交 `profile/`、日志或本地运行结果。
- 过期检查与领取后复核仍使用 `available` 字段。
- `auth.json` 过期后，需要重新运行本地 `login.ps1`，再用上面的命令更新 Secret。
