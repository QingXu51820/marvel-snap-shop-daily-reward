import { chromium, request } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(ROOT, "profile");
const AUTH_FILE = path.join(ROOT, "auth.json");
const LOG_FILE = path.join(ROOT, "marvel-snap-reward.log");
const RESULT_FILE = path.join(ROOT, "last-result.json");
const STATE_FILE = path.join(ROOT, "state.json");
const SHOP_URL = "https://shop.marvelsnap.com/zh-CN/#free-rewards";
const CHROME_PATH =
  process.env.MARVEL_SNAP_CHROME ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TIME_ZONE = "Asia/Shanghai";

function proxyOption() {
  const server =
    process.env.MARVEL_SNAP_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY;
  return server ? { server } : undefined;
}

async function loadStorageState() {
  const fromEnvironment = process.env.MARVEL_SNAP_AUTH_JSON;
  if (fromEnvironment) {
    const state = JSON.parse(fromEnvironment);
    if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)) {
      throw new Error("MARVEL_SNAP_AUTH_JSON 不是有效的 Playwright storageState");
    }
    return { state, fromEnvironment: true };
  }

  return {
    state: JSON.parse(await fs.readFile(AUTH_FILE, "utf8")),
    fromEnvironment: false,
  };
}

function nowStamp() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function log(message) {
  const line = `[${nowStamp()}] ${message}`;
  console.log(line);
  await fs.appendFile(LOG_FILE, `${line}\n`, "utf8");
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function pageJson(page, url, options = {}) {
  return page.evaluate(
    async ({ targetUrl, method, body }) => {
      try {
        const response = await fetch(targetUrl, {
          method,
          credentials: "include",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body,
        });
        const text = await response.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = { raw: text.slice(0, 2000) };
        }
        return { status: response.status, data };
      } catch (error) {
        return { status: 0, data: null, error: String(error?.message || error) };
      }
    },
    {
      targetUrl: url,
      method: options.method || "GET",
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
  );
}

async function apiJson(api, url, options = {}) {
  try {
    const response = await api.fetch(
      new URL(url, "https://shop.marvelsnap.com").href,
      {
        method: options.method || "GET",
        data: options.body,
        headers: options.body
          ? { "Content-Type": "application/json" }
          : undefined,
        timeout: 60000,
      },
    );
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 2000) };
    }
    return { status: response.status(), data };
  } catch (error) {
    return { status: 0, data: null, error: String(error?.message || error) };
  }
}

async function dismissCookieDialog(page) {
  try {
    await page.evaluate(() => {
      document.querySelector("button.osano-cm-dialog__close")?.click();
    });
  } catch {
    // The cookie dialog is not required for API calls.
  }
}

async function getSignedInPage(context) {
  for (const page of context.pages()) {
    if (!page.url().startsWith("https://shop.marvelsnap.com/")) continue;
    const auth = await pageJson(page, "/api/auth/me");
    if (auth.status === 200 && auth.data?.accountId) return { page, auth };
  }
  return null;
}

function freeOffersFromCatalog(data) {
  const offers = Array.isArray(data?.offers) ? data.offers : [];
  return offers.filter(
    (offer) =>
      offer?.isFree === true &&
      (offer?.groups?.includes("free_rewards") ||
        String(offer?.offerKey || "").startsWith("dailyfree")),
  );
}

function rewardSummary(grantedRewards) {
  const parts = [];
  for (const reward of Array.isArray(grantedRewards) ? grantedRewards : []) {
    const nested = Array.isArray(reward?.items) ? reward.items : [];
    if (nested.length) {
      for (const item of nested) {
        parts.push(
          `${item?.quantity ?? reward?.quantity ?? 1} ${item?.name || item?.rewardType || reward?.name || "奖励"}`,
        );
      }
    } else {
      parts.push(`${reward?.quantity ?? 1} ${reward?.name || "奖励"}`);
    }
  }
  return parts.join("、");
}

async function buildResult(status, details = {}) {
  const state = await readJson(STATE_FILE, {});
  const checkedAt = nowStamp();
  const ok = ["claimed", "already_claimed", "claimed_unverified"].includes(
    status,
  );
  const record = {
    ok,
    status,
    checkedAt,
    date: todayKey(),
    timezone: TIME_ZONE,
    ...details,
  };
  if (ok) record.lastSuccessDate = record.date;

  const previousHistory = Array.isArray(state.history) ? state.history : [];
  const nextState = {
    version: 1,
    timezone: TIME_ZONE,
    lastRunAt: checkedAt,
    lastStatus: status,
    lastSuccessAt: ok ? checkedAt : state.lastSuccessAt || null,
    lastSuccessDate: ok ? record.date : state.lastSuccessDate || null,
    history: [...previousHistory, record].slice(-60),
  };
  await writeJson(RESULT_FILE, record);
  await writeJson(STATE_FILE, nextState);
  return record;
}

function finish(record) {
  process.exitCode = ["claimed", "already_claimed", "claimed_unverified"].includes(
    record.status,
  )
    ? 0
    : record.status === "login_required"
      ? 2
      : 1;
}

async function loginMode(context) {
  await log("[login] 浏览器已打开，请完成网页商店登录；脚本会自动检测并关闭浏览器");
  const deadline = Date.now() + 10 * 60 * 1000;
  let lastNotice = 0;
  while (Date.now() < deadline) {
    const signedIn = await getSignedInPage(context);
    if (signedIn) {
      await context.storageState({ path: AUTH_FILE });
      await log("[login] 登录成功，API 认证信息已保存");
      await context.close();
      return 0;
    }
    if (Date.now() - lastNotice >= 30000) {
      console.log("等待登录中：请在刚打开的浏览器里完成登录（最多 10 分钟）...");
      lastNotice = Date.now();
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  await log("[login] 等待登录超时");
  await context.close();
  return 2;
}

async function checkMode(api) {
  const auth = await apiJson(api, "/api/auth/me");
  if (auth.status === 401) {
    await log("[check] 登录状态无效");
    finish(await buildResult("login_required", { signedIn: false }));
    return;
  }
  if (auth.status !== 200 || !auth.data?.accountId) {
    await log(`[check] 登录状态检查失败 HTTP ${auth.status}`);
    finish(
      await buildResult("error", {
        signedIn: false,
        reason: "auth_check_failed",
        httpStatus: auth.status,
      }),
    );
    return;
  }

  const catalog = await apiJson(
    api,
    "/api/catalog?lang=zh-CN&fresh=true",
  );
  if (catalog.status !== 200) {
    await log(`[check] 目录请求失败 HTTP ${catalog.status}`);
    finish(
      await buildResult("error", {
        signedIn: true,
        reason: "catalog_failed",
        httpStatus: catalog.status,
      }),
    );
    return;
  }

  const offers = freeOffersFromCatalog(catalog.data);
  if (!offers.length) {
    await log("[check] 目录中没有免费奖励");
    finish(await buildResult("error", { signedIn: true, reason: "no_offer" }));
    return;
  }

  const pending = offers.filter((offer) => Number(offer.available) > 0);
  const status = pending.length ? "unclaimed" : "already_claimed";
  await log(
    status === "unclaimed"
      ? `[check] 今日未领取：${pending.map((offer) => offer.offerKey).join(", ")}`
      : "[check] 今日已领取",
  );
  finish(
    await buildResult(status, {
      signedIn: true,
      offers: offers.map((offer) => ({
        offerKey: offer.offerKey,
        name: offer.name,
        available: offer.available,
      })),
    }),
  );
}

async function claimMode(api) {
  const auth = await apiJson(api, "/api/auth/me");
  if (auth.status === 401) {
    await log("[claim] 登录状态无效，需要重新登录");
    finish(await buildResult("login_required", { signedIn: false }));
    return;
  }
  if (auth.status !== 200 || !auth.data?.accountId) {
    await log(`[claim] 登录状态检查失败 HTTP ${auth.status}`);
    finish(
      await buildResult("error", {
        signedIn: false,
        reason: "auth_check_failed",
        httpStatus: auth.status,
      }),
    );
    return;
  }
  await log("[claim] 登录状态有效");

  const catalog = await apiJson(
    api,
    "/api/catalog?lang=zh-CN&fresh=true",
  );
  if (catalog.status !== 200) {
    await log(`[claim] 目录请求失败 HTTP ${catalog.status}`);
    finish(
      await buildResult("error", {
        signedIn: true,
        reason: "catalog_failed",
        httpStatus: catalog.status,
      }),
    );
    return;
  }

  const offers = freeOffersFromCatalog(catalog.data);
  if (!offers.length) {
    await log("[claim] 目录中没有免费奖励");
    finish(await buildResult("error", { signedIn: true, reason: "no_offer" }));
    return;
  }

  const availableOffers = offers.filter(
    (offer) => Number(offer.available) > 0,
  );
  await log(
    availableOffers.length
      ? `[today] 今日未打卡；待领取：${availableOffers.map((offer) => offer.offerKey).join(", ")}`
      : "[today] 今日已打卡，无需重复领取",
  );

  if (!availableOffers.length) {
    finish(
      await buildResult("already_claimed", {
        signedIn: true,
        offers: offers.map((offer) => ({
          offerKey: offer.offerKey,
          name: offer.name,
          available: offer.available,
        })),
      }),
    );
    return;
  }

  const claims = [];
  let allOk = true;
  let loginRequired = false;
  for (const offer of availableOffers) {
    if (!offer.hash) {
      allOk = false;
      claims.push({
        offerKey: offer.offerKey,
        ok: false,
        reason: "missing_hash",
      });
      continue;
    }

    const response = await apiJson(api, "/api/free-offer/claim", {
      method: "POST",
      body: {
        offerKey: offer.offerKey,
        hash: offer.hash,
        lang: "zh-CN",
      },
    });
    const errorCode = String(response.data?.errorCode || "");
    const fulfilled =
      response.status === 200 &&
      (response.data?.status === "fulfilled" ||
        response.data?.status === "pending");
    const alreadyClaimed =
      errorCode === "already_claimed" ||
      response.data?.status === "already_claimed";
    const unauthorized =
      response.status === 401 || errorCode === "unauthorized";

    if (fulfilled || alreadyClaimed) {
      claims.push({
        offerKey: offer.offerKey,
        ok: true,
        alreadyClaimed,
        status: response.data?.status || null,
        orderId: response.data?.orderId || null,
        description: response.data?.description || null,
        grantedRewards: response.data?.grantedRewards || [],
        rewards: response.data?.rewards || [],
      });
      await log(
        alreadyClaimed
          ? `[claim] ${offer.offerKey} 已领取`
          : `[claim] ${offer.offerKey} 领取成功`,
      );
    } else {
      allOk = false;
      loginRequired ||= unauthorized;
      claims.push({
        offerKey: offer.offerKey,
        ok: false,
        httpStatus: response.status,
        errorCode: errorCode || null,
        ineligibleReason: response.data?.ineligibleReason || null,
        message: response.error || response.data?.message || null,
      });
      await log(
        `[claim] ${offer.offerKey} 失败 HTTP ${response.status} ${errorCode || response.error || ""}`.trim(),
      );
    }
  }

  const refreshed = await apiJson(
    api,
    "/api/catalog?lang=zh-CN&fresh=true",
  );
  const refreshedOffers =
    refreshed.status === 200 ? freeOffersFromCatalog(refreshed.data) : [];
  const stillAvailable = refreshedOffers
    .filter((offer) => Number(offer.available) > 0)
    .map((offer) => offer.offerKey);
  const successfulClaims = claims.filter((claim) => claim.ok);
  const succeeded = successfulClaims.length > 0;
  const status = loginRequired
    ? "login_required"
    : succeeded
      ? allOk && stillAvailable.length === 0
        ? "claimed"
        : "claimed_unverified"
      : "error";

  await log(
    stillAvailable.length
      ? `[verify] 领取后仍有可用免费奖励：${stillAvailable.join(", ")}`
      : "[verify] 免费奖励目录已无可用项",
  );
  finish(
    await buildResult(status, {
      signedIn: true,
      checkedBefore: "unclaimed",
      offers: offers.map((offer) => ({
        offerKey: offer.offerKey,
        name: offer.name,
        available: offer.available,
      })),
      claims,
      stillAvailable,
      rewardSummary: rewardSummary(
        successfulClaims.flatMap((claim) =>
          Array.isArray(claim.grantedRewards) ? claim.grantedRewards : [],
        ),
      ),
    }),
  );
}

async function main() {
  await fs.mkdir(ROOT, { recursive: true });
  await fs.mkdir(PROFILE_DIR, { recursive: true });

  const args = new Set(process.argv.slice(2));
  const login = args.has("--login");
  const exportAuth = args.has("--export-auth");
  const checkOnly = args.has("--check");
  await log(
    `[run] mode=${login ? "login" : exportAuth ? "export-auth" : checkOnly ? "check" : "claim"} node=${process.version}`,
  );

  if (login || exportAuth) {
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: !login,
      executablePath: CHROME_PATH,
      locale: "zh-CN",
      viewport: { width: 1440, height: 1000 },
      args: [
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-session-crashed-bubble",
      ],
    });
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(SHOP_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(3500);
    await dismissCookieDialog(page);

    if (login) {
      process.exitCode = await loginMode(context);
      return;
    }

    const signedIn = await getSignedInPage(context);
    if (!signedIn) {
      await log("[auth] 浏览器配置中没有有效登录态");
      finish(await buildResult("login_required", { signedIn: false }));
      await context.close();
      return;
    }
    await context.storageState({ path: AUTH_FILE });
    await log("[auth] 已从浏览器配置导出接口认证文件");
    await context.close();
    return;
  }

  let auth;
  try {
    auth = await loadStorageState();
  } catch {
    await log("[auth] 未找到 auth.json，需要先执行一次登录");
    finish(await buildResult("login_required", { signedIn: false }));
    return;
  }

  const api = await request.newContext({
    storageState: auth.state,
    proxy: proxyOption(),
    extraHTTPHeaders: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://shop.marvelsnap.com",
      Referer: SHOP_URL,
    },
  });
  try {
    if (checkOnly) {
      await checkMode(api);
    } else {
      await claimMode(api);
    }
    if (!auth.fromEnvironment) {
      try {
        await api.storageState({ path: AUTH_FILE });
      } catch (error) {
        await log(`[auth] 更新 auth.json 失败: ${error?.message || error}`);
      }
    }
  } finally {
    await api.dispose();
  }
}

main().catch(async (error) => {
  const message = String(error?.stack || error);
  try {
    await log(`[FATAL] ${message}`);
  } catch {
    console.error(message);
  }
  try {
    await buildResult("error", {
      signedIn: false,
      reason: "unexpected_error",
      message: String(error?.message || error),
    });
  } catch {
    // Keep the original exit code when the state file cannot be written.
  }
  process.exitCode = 1;
});
