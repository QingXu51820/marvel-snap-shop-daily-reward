# MARVEL SNAP 网页商店每日免费奖励

本仓库提供一个 GitHub Actions 工作流，用于检查和领取 MARVEL SNAP 网页商店的每日免费奖励。

## 工作流程

1. 调用 `GET /api/auth/me` 验证网页商店登录态。
2. 调用 `GET /api/catalog?lang=zh-CN&fresh=true` 读取免费奖励状态。
3. `available = 0` 表示当日奖励已领取，工作流直接结束。
4. `available > 0` 时调用 `POST /api/free-offer/claim` 提交领取请求。
5. 重新读取目录，确认免费奖励已不可用。

同一账号重复执行不会重复领取。

## 部署

GitHub Actions 需要仓库 Secret `MARVEL_SNAP_SHOP_SESSION`。该 Secret 保存网页商店的 `shop_session` Cookie。

### 1. 创建仓库实例

通过仓库顶部的 `Use this template` 创建独立仓库，或通过 Fork 创建副本。

### 2. 获取 `shop_session`

1. 在浏览器中登录 `https://shop.marvelsnap.com/zh-CN/`。
2. 打开浏览器开发者工具 `Network` 面板。
3. 刷新页面，并选择名称类似 `catalog?lang=zh-CN` 的请求。
4. 打开 `Headers → Request Headers`，定位 `Cookie` 请求头。
5. 提取 `shop_session` Cookie 的值。

`shop_session` 是 HttpOnly Cookie，浏览器 Console 中的 `document.cookie` 不会返回该值。

### 3. 配置 Secret

在派生仓库中打开：

```text
Settings → Secrets and variables → Actions → New repository secret
```

配置项：

```text
Name:  MARVEL_SNAP_SHOP_SESSION
Value: shop_session 的值
```

Secret 的值可以为 Cookie 的值，也可以为完整的 `shop_session=...` 形式。

### 4. 手动验证

从以下入口启动一次工作流：

```text
Actions → MARVEL SNAP Daily Reward → Run workflow
```

返回 `claimed` 表示本次完成领取，返回 `already_claimed` 表示当日奖励已领取。

## 定时任务

GitHub Actions 的计划任务为：

- 每天 `01:10 UTC`，即北京时间 `09:10`
- 每天 `13:10 UTC`，即北京时间 `21:10`

第二次运行用于处理首次运行的遗漏或 GitHub 调度延迟。

## 本地运行

本地运行需要 Node.js 20 或更高版本。

```bash
npm ci
npm run check
npm run claim
```

完整登录态可通过以下命令生成：

```bash
npm run login
```

该命令会创建 Playwright `storageState` 文件 `auth.json`。该文件可用作
`MARVEL_SNAP_AUTH_JSON` Secret 的替代认证方式。

## 认证数据

支持两种 Repository Secret：

| Secret | 内容 |
| --- | --- |
| `MARVEL_SNAP_SHOP_SESSION` | `shop_session` Cookie 的值 |
| `MARVEL_SNAP_AUTH_JSON` | Playwright `storageState` JSON |

两个 Secret 同时存在时，`MARVEL_SNAP_AUTH_JSON` 优先级更高。

GitHub 托管运行器通常可以直接访问商店接口。若运行日志返回 `HTTP 451`，可设置可选 Secret：

```text
MARVEL_SNAP_PROXY=http://proxy-host:port
```

## 登录态失效

以下状态表示 Cookie 或完整登录态已失效：

```text
login_required
HTTP 401
```

处理方式为重新登录网页商店，获取新的 `shop_session`，并覆盖同名 Secret。

## 安全边界

- 仓库不保存账号密码。
- `shop_session`、`auth.json` 和浏览器 `profile` 均属于登录凭据。
- Cookie、Secret、浏览器配置及运行日志不得提交到仓库或发布在公开讨论中。
- `auth.json`、`profile/`、本地结果文件和日志已加入 `.gitignore`。
