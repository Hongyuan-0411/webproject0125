// 极简本地代理：隐藏 API Key，避免浏览器 CORS
// 使用方法：
//   1) 设置环境变量：SUNO_API_KEY 和 DASHSCOPE_API_KEY（或直接在此文件中配置）
//   2) node server.js
//   3) 打开 http://localhost:5173
//
// 注意：不再从 api.env 文件读取配置，只使用环境变量或硬编码默认值
// 默认使用 defapi.org 作为 Suno API 服务

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OpenApi = require('@alicloud/openapi-client');
const Dypnsapi20170525 = require('@alicloud/dypnsapi20170525');
const Util = require('@alicloud/tea-util');
const prompts = require('./prompts.js');

const { put, del } = require('@vercel/blob');
const { kv } = require('@vercel/kv');

// 读取 .env 文件的辅助函数
function loadEnvFile(filePath) {
  const env = {};
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // 跳过注释和空行
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // 移除引号（如果有）
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    }
  }
  return env;
}

// 注意：不再从 api.env 文件读取配置，只使用环境变量或硬编码默认值
// const envFile = path.join(__dirname, 'qwen-image-app', 'backend', 'api.env');
// const envConfig = loadEnvFile(envFile);
const envConfig = {}; // 禁用从 api.env 读取

// 优先使用环境变量，最后使用默认值（不再使用 api.env 文件）
const PORT = process.env.PORT || 5173;
const BASE_URL = (process.env.BASE_URL || 'https://api.defapi.org').replace(/\/$/, '');
const AUTH_TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7);
const DEFAULT_DAILY_LIMIT = Math.max(1, Number(process.env.DEFAULT_DAILY_LIMIT || 1) );
const QUOTA_TZ_OFFSET_MINUTES = Number(process.env.QUOTA_TZ_OFFSET_MINUTES || 8 * 60); // 默认按 UTC+8
const INTERNAL_ADMIN_SECRET = String(process.env.INTERNAL_ADMIN_SECRET || '').trim();
const NODE_ENV = String(process.env.NODE_ENV || 'development').toLowerCase();
const ENABLE_VERBOSE_LOGS = String(
  process.env.ENABLE_VERBOSE_LOGS || (NODE_ENV === 'production' ? '0' : '1')
).trim() === '1';
const ENABLE_HEADER_LOGS = String(
  process.env.ENABLE_HEADER_LOGS || (ENABLE_VERBOSE_LOGS ? '1' : '0')
).trim() === '1';
const DECOMPOSE_MAX_CONCURRENCY = Math.max(1, Number(process.env.DECOMPOSE_MAX_CONCURRENCY || 8));
const DECOMPOSE_MAX_QUEUE = Math.max(0, Number(process.env.DECOMPOSE_MAX_QUEUE || 120));
const UPSTREAM_MAX_RETRIES = Math.max(0, Number(process.env.UPSTREAM_MAX_RETRIES || 2));
const UPSTREAM_RETRY_BASE_MS = Math.max(100, Number(process.env.UPSTREAM_RETRY_BASE_MS || 300));
const UPSTREAM_RETRY_MAX_DELAY_MS = Math.max(500, Number(process.env.UPSTREAM_RETRY_MAX_DELAY_MS || 5000));
/*
========================================
旧天谱月配置（保留，不删除）
========================================
const TIANPUYUE_BASE_URL = 'https://api.tianpuyue.cn';
const TIANPUYUE_API_KEY = String(process.env.TIANPUYUE_API_KEY || '').trim();
const TIANPUYUE_MODEL = 'TemPolor v4.0';
const TIANPUYUE_VOICE_ID = 'SV000013';
const TIANPUYUE_CALLBACK_URL = String(process.env.TIANPUYUE_CALLBACK_URL || 'https://example.com/callback').trim();
*/

const DOUBAO_HOST = 'open.volcengineapi.com';
const DOUBAO_BASE_URL = process.env.DOUBAO_PROXY_URL
  ? String(process.env.DOUBAO_PROXY_URL).replace(/\/$/, '')
  : `https://${DOUBAO_HOST}`;
const DOUBAO_REGION = 'cn-beijing';
const DOUBAO_SERVICE = 'imagination';
const DOUBAO_VERSION = '2024-08-12';
const DOUBAO_SUBMIT_ACTION = 'GenSongV4';
const DOUBAO_QUERY_ACTIONS = String(
  process.env.DOUBAO_QUERY_ACTIONS || 'QuerySongTaskForTime,QuerySongTask,QuerySongResultForTime,QuerySongResult,GetSongTaskResult'
).split(',').map((s) => s.trim()).filter(Boolean);
const DOUBAO_MODEL_VERSION = String(process.env.DOUBAO_MODEL_VERSION || 'v4.3').trim() || 'v4.3';
const DOUBAO_CALLBACK_URL = String(process.env.DOUBAO_CALLBACK_URL || '').trim();
const VOLC_AK = String(
  process.env.VOLC_AK ||
  process.env.VOLCENGINE_ACCESS_KEY_ID ||
  process.env.VOLC_ACCESS_KEY_ID ||
  ''
).trim();
const VOLC_SK = String(
  process.env.VOLC_SK ||
  process.env.VOLCENGINE_ACCESS_KEY_SECRET ||
  process.env.VOLC_ACCESS_KEY_SECRET ||
  ''
).trim();
const ALIYUN_ACCESS_KEY_ID = String(process.env.ALIYUN_ACCESS_KEY_ID || '').trim();
const ALIYUN_ACCESS_KEY_SECRET = String(process.env.ALIYUN_ACCESS_KEY_SECRET || '').trim();
const ALIYUN_DYPN_ENDPOINT = String(process.env.ALIYUN_DYPN_ENDPOINT || 'dypnsapi.aliyuncs.com').trim();
const ALIYUN_SMS_SIGN_NAME = String(process.env.ALIYUN_SMS_SIGN_NAME || '').trim();
const ALIYUN_SMS_TEMPLATE_CODE = String(process.env.ALIYUN_SMS_TEMPLATE_CODE || '').trim();
const ALIYUN_SMS_COUNTRY_CODE = String(process.env.ALIYUN_SMS_COUNTRY_CODE || '86').trim().replace(/^\+/, '') || '86';
const ALIYUN_SMS_SCHEME_NAME = String(process.env.ALIYUN_SMS_SCHEME_NAME || '').trim();
const ALIYUN_SMS_CODE_LENGTH = Math.max(4, Math.min(8, Number(process.env.ALIYUN_SMS_CODE_LENGTH || 6)));
const ALIYUN_SMS_VALID_TIME = Math.max(60, Number(process.env.ALIYUN_SMS_VALID_TIME || 300));
const ALIYUN_SMS_INTERVAL = Math.max(30, Number(process.env.ALIYUN_SMS_INTERVAL || 60));
const ALIYUN_SMS_CODE_TYPE = Number(process.env.ALIYUN_SMS_CODE_TYPE || 1);
const ALIYUN_SMS_VERIFY_MIN = String(process.env.ALIYUN_SMS_VERIFY_MIN || '5');
const ALIYUN_SMS_DUPLICATE_POLICY = Number(process.env.ALIYUN_SMS_DUPLICATE_POLICY || 1);

// ============================================
// API Keys 配置（直接在此文件中设置）
// ============================================
// 优先使用环境变量，如果没有则使用下面硬编码的默认值
// 注意：请将下面的值替换为你的实际 API keys

// Suno API Key (用于 defapi.org)
// 优先使用环境变量 SUNO_API_KEY，如果没有则使用下面的默认值
const DEFAULT_SUNO_API_KEY = 'dk-f07493ffbfd50be8bcd66a3b7eb6618b';

// DashScope API Key (用于阿里云图片生成)
// 从 api.env 文件读取，如果没有则使用下面的默认值
// 注意：确保使用正确的 DashScope API key（格式：sk-开头）
const DEFAULT_DASHSCOPE_API_KEY = 'sk-de7b2127a28a41a98a5c76572b790c3b';

// defapi.org 认证方式配置
// 某些 API 可能使用 X-API-Key 而不是 Authorization: Bearer
// 如果遇到 401 错误，可以尝试将下面的值改为 true
const USE_X_API_KEY_HEADER = false; // 设置为 true 以使用 X-API-Key header


// ============================================
// 读取 API Keys（优先级：环境变量 > 硬编码默认值）
// ============================================
// 注意：不再从 api.env 文件读取，只使用环境变量或硬编码默认值
let API_KEY = process.env.SUNO_API_KEY || process.env.API_KEY || DEFAULT_SUNO_API_KEY;
let DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || DEFAULT_DASHSCOPE_API_KEY;

// 清理 API keys（去除可能的空格、换行、引号等）
API_KEY = String(API_KEY).trim().replace(/^["']|["']$/g, '');
DASHSCOPE_API_KEY = String(DASHSCOPE_API_KEY).trim().replace(/^["']|["']$/g, '');

// 调试：显示 API key 来源
console.log(`[DEBUG] API_KEY source: ${process.env.SUNO_API_KEY || process.env.API_KEY ? 'env' : 'default'}`);
console.log(`[DEBUG] DASHSCOPE_API_KEY source: ${process.env.DASHSCOPE_API_KEY ? 'env' : 'default'}`);

// 调试输出（不显示完整 key，只显示前几位和后几位）
function maskKey(key) {
  if (!key || key.length < 8) return '***';
  return key.substring(0, 4) + '...' + key.substring(key.length - 4);
}

function logVerbose(...args) {
  if (ENABLE_VERBOSE_LOGS) {
    console.log(...args);
  }
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function validateUsername(username) {
  const value = String(username || '').trim();
  if (!value) return '账号不能为空';
  if (value.length < 3 || value.length > 32) return '账号长度需在3到32个字符之间';
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return '账号仅支持字母、数字、下划线和短横线';
  return '';
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) return '密码长度至少8位';
  return '';
}

function normalizePhoneNumber(phoneNumber) {
  return String(phoneNumber || '').trim().replace(/\s+/g, '');
}

function validatePhoneNumber(phoneNumber) {
  const v = normalizePhoneNumber(phoneNumber);
  if (!v) return '手机号不能为空';
  if (!/^\d{11}$/.test(v)) return '手机号格式错误';
  if (!/^1\d{10}$/.test(v)) return '手机号格式错误';
  return '';
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function scryptAsync(password, salt, keyLen = 64) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, keyLen, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 64)).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

async function verifyPassword(password, passwordHash) {
  try {
    const [algo, salt, expectedHex] = String(passwordHash || '').split('$');
    if (algo !== 'scrypt' || !salt || !expectedHex) return false;
    const actual = await scryptAsync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role || 'user',
    dailyLimit: user.dailyLimitCustomized ? Number(user.dailyLimit) : DEFAULT_DAILY_LIMIT,
    createdAt: user.createdAt,
  };
}

function getBearerToken(req) {
  const auth = req?.headers?.authorization || req?.headers?.Authorization;
  if (!auth) return '';
  const match = String(auth).match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1]).trim() : '';
}

function getQuotaDateKey(ts = Date.now()) {
  const offsetMs = QUOTA_TZ_OFFSET_MINUTES * 60 * 1000;
  const shifted = ts + offsetMs;
  const d = new Date(shifted);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function getQuotaResetTimestamp(ts = Date.now()) {
  const offsetMs = QUOTA_TZ_OFFSET_MINUTES * 60 * 1000;
  const shifted = ts + offsetMs;
  const d = new Date(shifted);
  const nextMidnightShifted = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return nextMidnightShifted - offsetMs;
}

function getQuotaResetIso(ts = Date.now()) {
  return new Date(getQuotaResetTimestamp(ts)).toISOString();
}

function getQuotaTtlSeconds(ts = Date.now()) {
  const diff = Math.floor((getQuotaResetTimestamp(ts) - ts) / 1000);
  return Math.max(60, diff);
}

function getUserKey(userId) {
  return `auth:user:${userId}`;
}

function getUsernameKey(usernameNormalized) {
  return `auth:username:${usernameNormalized}`;
}

function getTokenKey(tokenHash) {
  return `auth:token:${tokenHash}`;
}

function getPhoneOutIdKey(phoneNumber) {
  return `auth:sms:outid:${phoneNumber}`;
}

function getQuotaUsedKey(userId, dateKey) {
  return `quota:used:${userId}:${dateKey}`;
}

function getStepCacheKey(userId, sessionId, stepIndex) {
  return `user:${userId}:session:${sessionId}:step:${stepIndex}`;
}

function getHistoryDataKey(userId, sessionId) {
  return `history:user:${userId}:${sessionId}`;
}

function getHistoryIndexKey(userId) {
  return `history:index:user:${userId}`;
}

function parseUrlExpireAtMs(url) {
  try {
    const u = new URL(String(url || ''));
    const expiresRaw = u.searchParams.get('Expires');
    if (!expiresRaw) return 0;
    const expiresSec = Number(expiresRaw);
    if (!Number.isFinite(expiresSec) || expiresSec <= 0) return 0;
    return expiresSec * 1000;
  } catch {
    return 0;
  }
}

function isLikelyTemporaryImageUrl(url) {
  const text = String(url || '');
  if (!text || !/^https?:\/\//i.test(text)) return false;
  return (
    text.includes('dashscope-result') ||
    text.includes('oss-cn-') ||
    /[?&]Expires=\d+/i.test(text) ||
    /[?&]Signature=/i.test(text) ||
    /[?&]OSSAccessKeyId=/i.test(text)
  );
}

function isVercelBlobUrl(url) {
  const text = String(url || '');
  return text.includes('.blob.vercel-storage.com');
}

function isExpiredTemporaryUrl(url) {
  const expiresAt = parseUrlExpireAtMs(url);
  if (!expiresAt) return false;
  return Date.now() > expiresAt;
}

async function mirrorImageUrlToBlob(sessionId, stepNumber, imageUrl) {
  const imageResp = await fetch(imageUrl);
  if (!imageResp.ok) {
    throw new Error(`fetch image failed: ${imageResp.status}`);
  }
  const imageBuffer = await imageResp.arrayBuffer();
  const key = `${sessionId}/step_${stepNumber}_image.png`;
  const blob = await put(key, Buffer.from(imageBuffer), {
    access: 'public',
    contentType: 'image/png',
    addRandomSuffix: false,
  });
  return blob.url;
}

async function normalizeHistoryStepContents(userId, sessionId, stepContentsRaw) {
  const stepContents = Array.isArray(stepContentsRaw) ? stepContentsRaw : [];
  let changed = false;

  const nextStepContents = await Promise.all(stepContents.map(async (item, index) => {
    const stepNumber = index + 1;
    const stepItem = (item && typeof item === 'object') ? { ...item } : {};
    const stepCacheKey = getStepCacheKey(userId, sessionId, stepNumber);

    let cache = null;
    try {
      cache = await kv.hgetall(stepCacheKey);
    } catch {
      cache = null;
    }

    const cacheImageUrl = String(cache?.imageUrl || '').trim();
    const currentImageUrl = String(stepItem.imageUrl || '').trim();
    let finalImageUrl = cacheImageUrl || currentImageUrl;

    // 优先使用 step cache 中的 Blob 永久链接，修复旧历史中的临时 URL。
    if (cacheImageUrl && cacheImageUrl !== currentImageUrl) {
      stepItem.imageUrl = cacheImageUrl;
      finalImageUrl = cacheImageUrl;
      changed = true;
    }

    // 只有临时 URL 时，尝试迁移到 Blob，避免导入历史时图片过期。
    if (finalImageUrl && !isVercelBlobUrl(finalImageUrl) && isLikelyTemporaryImageUrl(finalImageUrl)) {
      if (isExpiredTemporaryUrl(finalImageUrl)) {
        stepItem.imageUrl = null;
        if (!stepItem.imageError) {
          stepItem.imageError = '历史图片链接已过期，请重新生成图片';
        }
        changed = true;
      } else {
        try {
          const mirroredUrl = await mirrorImageUrlToBlob(sessionId, stepNumber, finalImageUrl);
          if (mirroredUrl && mirroredUrl !== finalImageUrl) {
            stepItem.imageUrl = mirroredUrl;
            stepItem.imageError = null;
            changed = true;
            await kv.hset(stepCacheKey, {
              imageUrl: mirroredUrl,
              updatedAt: nowIso(),
            });
          }
        } catch (e) {
          console.warn(`[${nowIso()}] mirror history image failed session=${sessionId} step=${stepNumber}:`, e?.message || e);
        }
      }
    }

    return stepItem;
  }));

  return {
    stepContents: nextStepContents,
    changed,
  };
}

let dypnsClient = null;
function getDypnsClient() {
  if (dypnsClient) return dypnsClient;
  if (!ALIYUN_ACCESS_KEY_ID || !ALIYUN_ACCESS_KEY_SECRET) {
    throw new Error('Aliyun SMS credentials are not configured');
  }
  const config = new OpenApi.Config({
    accessKeyId: ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: ALIYUN_ACCESS_KEY_SECRET,
  });
  config.endpoint = ALIYUN_DYPN_ENDPOINT;
  dypnsClient = new Dypnsapi20170525.default(config);
  return dypnsClient;
}

async function sendAliyunSmsVerifyCode(phoneNumber) {
  if (!ALIYUN_SMS_SIGN_NAME || !ALIYUN_SMS_TEMPLATE_CODE) {
    throw new Error('ALIYUN_SMS_SIGN_NAME or ALIYUN_SMS_TEMPLATE_CODE is not configured');
  }
  const outId = `out_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const request = new Dypnsapi20170525.SendSmsVerifyCodeRequest({
    countryCode: ALIYUN_SMS_COUNTRY_CODE,
    phoneNumber,
    signName: ALIYUN_SMS_SIGN_NAME,
    templateCode: ALIYUN_SMS_TEMPLATE_CODE,
    templateParam: JSON.stringify({ code: '##code##', min: ALIYUN_SMS_VERIFY_MIN }),
    outId,
    codeLength: ALIYUN_SMS_CODE_LENGTH,
    validTime: ALIYUN_SMS_VALID_TIME,
    duplicatePolicy: ALIYUN_SMS_DUPLICATE_POLICY,
    interval: ALIYUN_SMS_INTERVAL,
    codeType: ALIYUN_SMS_CODE_TYPE,
    returnVerifyCode: false,
  });
  const runtime = new Util.RuntimeOptions({});
  const client = getDypnsClient();
  const resp = await client.sendSmsVerifyCodeWithOptions(request, runtime);
  const body = resp?.body || {};
  return {
    code: body.code,
    message: body.message,
    success: !!body.success,
    model: body.model || {},
    requestId: body.requestId || '',
    outId,
  };
}

async function checkAliyunSmsVerifyCode(phoneNumber, verifyCode, options = {}) {
  const countryCode = String(options?.countryCode || ALIYUN_SMS_COUNTRY_CODE || '86').trim().replace(/^\+/, '') || '86';
  const outId = String(options?.outId || '').trim();
  const requestPayload = {
    countryCode,
    phoneNumber,
    verifyCode: String(verifyCode || '').trim(),
    caseAuthPolicy: 1,
  };
  if (outId) requestPayload.outId = outId;
  if (ALIYUN_SMS_SCHEME_NAME) requestPayload.schemeName = ALIYUN_SMS_SCHEME_NAME;

  const request = new Dypnsapi20170525.CheckSmsVerifyCodeRequest(requestPayload);
  const runtime = new Util.RuntimeOptions({});
  const client = getDypnsClient();
  const resp = await client.checkSmsVerifyCodeWithOptions(request, runtime);
  const body = resp?.body || {};
  const verifyResult = String(body?.model?.verifyResult || '').toUpperCase();
  const verifyPassed = ['PASS', 'SUCCESS', 'TRUE', '1', 'OK'].includes(verifyResult);
  return {
    code: body.code,
    message: body.message,
    success: !!body.success,
    verifyPassed,
    verifyResult,
    model: body.model || {},
    requestId: body.requestId || '',
  };
}

async function createSessionForUser(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + AUTH_TOKEN_TTL_SECONDS * 1000).toISOString();
  await kv.set(getTokenKey(tokenHash), {
    userId: user.id,
    username: user.username,
    role: user.role || 'user',
    createdAt: nowIso(),
    expiresAt,
  }, { ex: AUTH_TOKEN_TTL_SECONDS });
  return { token, expiresAt };
}

async function getAuthContext(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await kv.get(getTokenKey(tokenHash));
  if (!session || !session.userId) return null;
  const user = await kv.get(getUserKey(session.userId));
  if (!user || user.status === 'disabled') return null;
  return { token, tokenHash, session, user };
}

async function requireAuth(req, res) {
  const auth = await getAuthContext(req);
  if (!auth) {
    send(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return auth;
}

async function getQuotaStatus(user) {
  // 只有管理员通过 API 单独设置过限额的用户才使用 user.dailyLimit，
  // 其余用户始终跟随 DEFAULT_DAILY_LIMIT 环境变量，改变量立即生效。
  const limit = Math.max(1, user.dailyLimitCustomized ? Number(user.dailyLimit) : DEFAULT_DAILY_LIMIT);
  const dateKey = getQuotaDateKey();
  const used = Number(await kv.get(getQuotaUsedKey(user.id, dateKey)) || 0);
  return {
    limit,
    used: Math.max(0, used),
    remaining: Math.max(0, limit - used),
    resetAt: getQuotaResetIso(),
  };
}

async function consumeDailyQuota(user) {
  const limit = Math.max(1, user.dailyLimitCustomized ? Number(user.dailyLimit) : DEFAULT_DAILY_LIMIT);
  const dateKey = getQuotaDateKey();
  const usedKey = getQuotaUsedKey(user.id, dateKey);

  const newUsed = Number(await kv.incr(usedKey));
  if (newUsed === 1) {
    await kv.expire(usedKey, getQuotaTtlSeconds());
  }

  if (newUsed > limit) {
    await kv.decr(usedKey);
    return {
      ok: false,
      limit,
      used: limit,
      remaining: 0,
      resetAt: getQuotaResetIso(),
    };
  }

  return {
    ok: true,
    limit,
    used: newUsed,
    remaining: Math.max(0, limit - newUsed),
    resetAt: getQuotaResetIso(),
  };
}

// 验证 API keys（输出完整 key 用于检查）
if (!API_KEY || API_KEY.length < 10) {
  console.warn('[WARN] SUNO_API_KEY 未设置或格式不正确，将无法调用 Suno 接口。');
} else {
  console.log(`[INFO] SUNO_API_KEY 已加载: ${maskKey(API_KEY)}`);
}

// 验证 DashScope API key 格式（应该以 sk- 开头）
if (!DASHSCOPE_API_KEY || DASHSCOPE_API_KEY.length < 10) {
  console.warn('[WARN] DASHSCOPE_API_KEY 未设置或格式不正确，将无法调用图片生成接口。');
} else {
  // 检查格式是否正确（DashScope API key 应该以 sk- 开头）
  if (!DASHSCOPE_API_KEY.startsWith('sk-')) {
    console.warn(`[WARN] DashScope API Key 格式不正确（应以 'sk-' 开头），当前值: ${maskKey(DASHSCOPE_API_KEY)}`);
    
    // 如果格式不对，使用默认值（如果默认值格式正确）
    if (DEFAULT_DASHSCOPE_API_KEY && DEFAULT_DASHSCOPE_API_KEY.startsWith('sk-')) {
      console.log(`[INFO] 使用默认的 DashScope API Key`);
      DASHSCOPE_API_KEY = DEFAULT_DASHSCOPE_API_KEY;
    }
  }
  console.log(`[INFO] DASHSCOPE_API_KEY 已加载: ${maskKey(DASHSCOPE_API_KEY)} (格式: ${DASHSCOPE_API_KEY.startsWith('sk-') ? '正确' : '错误'})`);
}

function send(res, status, body, headers = {}) {
  // 确保 body 是有效的 JSON 字符串
  let jsonBody;
  try {
    if (typeof body === 'string') {
      // 尝试解析，确保是有效的 JSON
      JSON.parse(body);
      jsonBody = body;
    } else {
      jsonBody = JSON.stringify(body);
    }
  } catch (e) {
    // 如果解析失败，创建一个错误响应
    jsonBody = JSON.stringify({ 
      error: typeof body === 'string' ? body : 'Invalid response format',
      status: status 
    });
  }
  
  res.writeHead(status, { 
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, X-Internal-Admin-Secret',
    ...headers 
  });
  res.end(jsonBody);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  };
  const ct = map[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 
      'content-type': ct,
      'access-control-allow-origin': '*',
    });
    res.end(data);
  });
}

async function readJson(req) {
  // Vercel pre-parses JSON bodies and attaches to req.body (stream is consumed)
  if (req.body !== undefined) {
    if (typeof req.body === 'object' && req.body !== null) return req.body;
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return {}; }
    }
    return {};
  }
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => (buf += c));
    req.on('end', () => {
      if (!buf) return resolve({});
      try {
        resolve(JSON.parse(buf));
      } catch (e) {
        // 保证不会因为 JSON 解析失败导致整个服务崩溃
        reject(new Error('Invalid JSON body'));
      }
    });
  });
}

function nowIso() {
  return new Date().toISOString();
}

let decomposeActiveCount = 0;
const decomposeWaitQueue = [];

function getDecomposeQueueStats() {
  return {
    active: decomposeActiveCount,
    queued: decomposeWaitQueue.length,
    maxConcurrency: DECOMPOSE_MAX_CONCURRENCY,
    maxQueue: DECOMPOSE_MAX_QUEUE,
  };
}

async function acquireDecomposeSlot() {
  if (decomposeActiveCount < DECOMPOSE_MAX_CONCURRENCY) {
    decomposeActiveCount += 1;
    return { ok: true, queued: false, ...getDecomposeQueueStats() };
  }

  if (decomposeWaitQueue.length >= DECOMPOSE_MAX_QUEUE) {
    return { ok: false, reason: 'queue_full', ...getDecomposeQueueStats() };
  }

  await new Promise((resolve) => decomposeWaitQueue.push(resolve));
  decomposeActiveCount += 1;
  return { ok: true, queued: true, ...getDecomposeQueueStats() };
}

function releaseDecomposeSlot() {
  decomposeActiveCount = Math.max(0, decomposeActiveCount - 1);
  const next = decomposeWaitQueue.shift();
  if (next) next();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber * 1000;
  const asDateMs = Date.parse(raw);
  if (Number.isFinite(asDateMs)) {
    return Math.max(0, asDateMs - Date.now());
  }
  return 0;
}

function computeRetryDelayMs(attempt, retryAfterMs = 0) {
  if (retryAfterMs > 0) {
    return Math.min(UPSTREAM_RETRY_MAX_DELAY_MS, retryAfterMs);
  }
  const base = Math.min(UPSTREAM_RETRY_MAX_DELAY_MS, UPSTREAM_RETRY_BASE_MS * (2 ** attempt));
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(base * 0.3)));
  return base + jitter;
}

function shouldRetryUpstreamStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

async function fetchWithRetry(targetUrl, options = {}, meta = {}) {
  let lastResponse = null;
  let lastError = null;
  const label = String(meta?.label || 'upstream');

  for (let attempt = 0; attempt <= UPSTREAM_MAX_RETRIES; attempt += 1) {
    try {
      const resp = await fetch(targetUrl, options);
      lastResponse = resp;

      if (shouldRetryUpstreamStatus(resp.status) && attempt < UPSTREAM_MAX_RETRIES) {
        const retryAfterMs = parseRetryAfterMs(resp.headers?.get?.('retry-after'));
        const delay = computeRetryDelayMs(attempt, retryAfterMs);
        console.warn(`[${nowIso()}] [retry] ${label} status=${resp.status}, attempt=${attempt + 1}/${UPSTREAM_MAX_RETRIES + 1}, delay=${delay}ms`);
        await sleep(delay);
        continue;
      }

      return resp;
    } catch (e) {
      lastError = e;
      if (attempt >= UPSTREAM_MAX_RETRIES) break;
      const delay = computeRetryDelayMs(attempt, 0);
      console.warn(`[${nowIso()}] [retry] ${label} network error on attempt=${attempt + 1}/${UPSTREAM_MAX_RETRIES + 1}, delay=${delay}ms, err=${e?.message || e}`);
      await sleep(delay);
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error(`${label} fetch failed`);
}

async function proxyJson(req, res, targetUrl, method, bodyObj, customHeaders = {}) {
  const reqBodyText = bodyObj ? JSON.stringify(bodyObj) : undefined;

  // 打印"全文"（请求 body）以及目标 URL，便于核对是否真的发出了内容
  console.log(`\n[${nowIso()}] >>> proxy ${method} ${targetUrl}`);
  if (reqBodyText !== undefined) {
    logVerbose(`[${nowIso()}] >>> request body (FULL):`);
    logVerbose(reqBodyText);
  } else {
    logVerbose(`[${nowIso()}] >>> request body: <empty>`);
  }

  // 构建请求头
  const headers = {
    'accept': '*/*',
    ...(method === 'POST' || method === 'PUT' || method === 'PATCH' ? { 'content-type': 'application/json' } : {}),
    ...customHeaders,
  };
  
  // 添加认证头（defapi.org 可能使用多种方式）
  if (API_KEY) {
    if (USE_X_API_KEY_HEADER) {
      // 方式1: 使用 X-API-Key header（某些 API 使用这种方式）
      headers['X-API-Key'] = API_KEY;
      logVerbose(`[${nowIso()}] >>> Using X-API-Key header: ${maskKey(API_KEY)}`);
    } else {
      // 方式2: Authorization: Bearer {token}（标准方式，默认）
      headers['Authorization'] = `Bearer ${API_KEY}`;
      logVerbose(`[${nowIso()}] >>> Using Authorization: Bearer ${maskKey(API_KEY)}`);
    }
    logVerbose(`[${nowIso()}] >>> API Key length: ${API_KEY.length} characters`);
  } else {
    console.warn(`[${nowIso()}] >>> WARNING: No API_KEY provided for request to ${targetUrl}`);
  }

  let r;
  let text;
  try {
    // 连接超时在某些网络环境会频繁发生，这里做更强健的错误处理，避免直接崩溃
    r = await fetchWithRetry(targetUrl, {
      method,
      headers,
      body: reqBodyText,
    }, {
      label: `proxy ${method} ${targetUrl}`,
    });
    text = await r.text();
  } catch (e) {
    console.error(`[${nowIso()}] <<< fetch ERROR:`, e);
    // 统一返回可解析的 JSON，避免前端报“无效响应格式”
    return send(res, 502, {
      success: false,
      error: 'Upstream fetch failed',
      details: e?.cause?.code || e?.code || e?.message || String(e),
      target: targetUrl,
    });
  }

  console.log(`[${nowIso()}] <<< response status: ${r.status} ${r.statusText}`);
  logVerbose(`[${nowIso()}] <<< response body (FULL):`);
  logVerbose(text);

  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  // 如果是 401 错误，提供更详细的调试信息
  if (r.status === 401) {
    console.error(`[${nowIso()}] >>> AUTHENTICATION ERROR (401)`);
    console.error(`[${nowIso()}] >>> Request URL: ${targetUrl}`);
    console.error(`[${nowIso()}] >>> API Key used: ${maskKey(API_KEY)} (length: ${API_KEY?.length || 0})`);
    console.error(`[${nowIso()}] >>> Response: ${JSON.stringify(json)}`);
    console.error(`[${nowIso()}] >>> Please check:`);
    console.error(`[${nowIso()}] >>>   1. API Key is correct and valid`);
    console.error(`[${nowIso()}] >>>   2. API Key format matches API requirements`);
    console.error(`[${nowIso()}] >>>   3. API Key has not expired`);
  }

  if (!r.ok) return send(res, r.status, json);
  return send(res, 200, json);
}

/*
========================================
旧天谱月请求函数（保留，不删除）
========================================
async function callTianpuyueApi(pathname, payload) {
  if (!TIANPUYUE_API_KEY) {
    throw new Error('TIANPUYUE_API_KEY not configured');
  }

  const targetUrl = `${TIANPUYUE_BASE_URL}${pathname}`;
  const reqBody = JSON.stringify(payload || {});

  console.log(`[${nowIso()}] >>> Tianpuyue POST ${targetUrl}`);
  console.log(`[${nowIso()}] >>> Tianpuyue body: ${reqBody}`);

  const r = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Authorization': TIANPUYUE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: reqBody,
  });

  const text = await r.text();
  console.log(`[${nowIso()}] <<< Tianpuyue status: ${r.status} ${r.statusText}`);
  console.log(`[${nowIso()}] <<< Tianpuyue body: ${text}`);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!r.ok) {
    return {
      ok: false,
      httpStatus: r.status,
      json,
    };
  }

  return {
    ok: true,
    httpStatus: r.status,
    json,
  };
}
*/

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hmacSha256(key, data, encoding) {
  const h = crypto.createHmac('sha256', key).update(data);
  return encoding ? h.digest(encoding) : h.digest();
}

function formatXDate(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function getVolcSignatureKey(secretKey, shortDate, region, service) {
  const kDate = hmacSha256(Buffer.from(secretKey, 'utf8'), shortDate);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'request');
}

function buildVolcAuthHeaders({ action, version, bodyText }) {
  if (!VOLC_AK || !VOLC_SK) {
    throw new Error('VOLC_AK / VOLC_SK not configured');
  }

  // 与官方 Java SDK 保持完全一致：Content-Type 含 charset
  const CONTENT_TYPE = 'application/json; charset=utf-8';

  const method = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = `Action=${action}&Version=${version}`;
  const xDate = formatXDate();
  const shortDate = xDate.slice(0, 8);
  const payloadHash = sha256Hex(bodyText);

  // 规范化请求头（按字母序，小写 key:value\n）
  const canonicalHeaders =
    `content-type:${CONTENT_TYPE}\n` +
    `host:${DOUBAO_HOST}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${xDate}\n`;
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalRequest =
    `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const hashedCanonicalRequest = sha256Hex(canonicalRequest);
  const credentialScope = `${shortDate}/${DOUBAO_REGION}/${DOUBAO_SERVICE}/request`;
  const stringToSign =
    `HMAC-SHA256\n${xDate}\n${credentialScope}\n${hashedCanonicalRequest}`;

  // debug: 输出签名中间值（不含密钥）
  const maskedAk = VOLC_AK.length > 8
    ? `${VOLC_AK.slice(0, 4)}****${VOLC_AK.slice(-4)}`
    : '(short)';
  logVerbose(`[Volc Sign] AK=${maskedAk} date=${shortDate} action=${action}`);
  logVerbose(`[Volc Sign] canonicalRequest:\n${canonicalRequest}`);
  logVerbose(`[Volc Sign] stringToSign:\n${stringToSign}`);

  const signingKey = getVolcSignatureKey(VOLC_SK, shortDate, DOUBAO_REGION, DOUBAO_SERVICE);
  const signature = hmacSha256(signingKey, stringToSign, 'hex');
  logVerbose(`[Volc Sign] signature=${signature}`);
  const authorization = `HMAC-SHA256 Credential=${VOLC_AK}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    'Host': DOUBAO_HOST,
    'Content-Type': CONTENT_TYPE,
    'X-Date': xDate,
    'X-Content-Sha256': payloadHash,
    'Authorization': authorization,
  };
}

function isActionNotFound(json) {
  const code = String(
    json?.ResponseMetadata?.Error?.Code ||
    json?.ResponseMetadata?.Error?.CodeN ||
    json?.code ||
    json?.Code ||
    ''
  ).toLowerCase();
  const msg = String(
    json?.ResponseMetadata?.Error?.Message ||
    json?.message ||
    json?.Message ||
    ''
  ).toLowerCase();
  return code.includes('action') || msg.includes('action') || msg.includes('invalid action');
}

function isDoubaoBizSuccess(json) {
  const code = Number(json?.Code);
  if (Number.isFinite(code)) return code === 0;
  // 某些网关错误不返回 Code，交给上游 HTTP 状态处理
  return true;
}

async function callDoubaoMusicApi(action, payload) {
  const query = `Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(DOUBAO_VERSION)}`;
  const targetUrl = `${DOUBAO_BASE_URL}/?${query}`;
  const reqBody = JSON.stringify(payload || {});
  const headers = buildVolcAuthHeaders({
    action,
    version: DOUBAO_VERSION,
    bodyText: reqBody,
  });

  console.log(`[${nowIso()}] >>> Doubao POST ${targetUrl}`);
  logVerbose(`[${nowIso()}] >>> Doubao body: ${reqBody}`);

  const r = await fetchWithRetry(targetUrl, {
    method: 'POST',
    headers,
    body: reqBody,
  }, {
    label: `doubao:${action}`,
  });

  const text = await r.text();
  console.log(`[${nowIso()}] <<< Doubao status: ${r.status} ${r.statusText}`);
  logVerbose(`[${nowIso()}] <<< Doubao body: ${text}`);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return {
    ok: r.ok,
    httpStatus: r.status,
    json,
    action,
  };
}

function deepFindStringByKey(obj, candidateKeys) {
  const keys = new Set(candidateKeys.map((k) => String(k).toLowerCase()));
  const stack = [obj];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    for (const [k, v] of Object.entries(current)) {
      if (keys.has(String(k).toLowerCase()) && typeof v === 'string' && v.trim()) {
        return v.trim();
      }
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return '';
}

function deepFindAudioUrl(obj) {
  const stack = [obj];
  const keySet = new Set(['audio_url', 'audiourl', 'url', 'musicurl', 'songurl', 'resulturl', 'fileurl']);
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    for (const [k, v] of Object.entries(current)) {
      if (keySet.has(String(k).toLowerCase()) && typeof v === 'string' && /^https?:\/\//i.test(v)) {
        return v;
      }
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return '';
}

function mapMusicVoiceToGender(voice) {
  const v = String(voice || '').toLowerCase();
  if (v.includes('女') || v.includes('female')) return 'Female';
  if (v.includes('男') || v.includes('male')) return 'Male';
  return '';
}

function mapDoubaoTaskStatus(resp) {
  const raw = deepFindStringByKey(resp, ['Status', 'TaskStatus', 'State', 'status', 'task_status', 'state']);
  const s = String(raw || '').toLowerCase();
  if (!s) return '';
  if (['success', 'succeeded', 'finished', 'done', 'completed'].includes(s)) return 'success';
  if (['failed', 'error', 'cancelled', 'canceled', 'timeout'].includes(s)) return 'failed';
  if (['pending', 'running', 'processing', 'queued', 'in_progress'].includes(s)) return 'running';
  return s;
}

// DashScope 图片生成辅助函数
function normalizeSize(size) {
  const allowed = ['1696*960', '1664*928', '1472*1140', '1328*1328', '1140*1472', '928*1664'];
  if (allowed.includes(size)) return size;
  const size2 = size.replace(/[xX]/g, '*');
  if (allowed.includes(size2)) return size2;
  return '1664*928'; // 默认值：固定16:9比例
}

// 通义千问大语言模型调用函数（用于文本生成）
async function callQwenLLM(messages, model = 'qwen-plus') {
  // DashScope 文本生成API（兼容chat completion格式）
  const DASHSCOPE_LLM_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
  
  const payload = {
    model: model,
    input: {
      messages: messages,
    },
    parameters: {
      temperature: 0.7,
      max_tokens: 2000,
      result_format: 'message', // 返回消息格式
    },
  };

  console.log(`[${nowIso()}] >>> DashScope (Qwen LLM) text generation request`);
  logVerbose(`[${nowIso()}] >>> request body:`, JSON.stringify(payload, null, 2));

  const r = await fetchWithRetry(DASHSCOPE_LLM_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, {
    label: 'dashscope-llm',
  });

  const text = await r.text();
  console.log(`[${nowIso()}] <<< DashScope LLM response status: ${r.status} ${r.statusText}`);
  logVerbose(`[${nowIso()}] <<< DashScope LLM response body:`, text);

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`DashScope LLM response parse error: ${e.message}`);
  }

  if (!r.ok) {
    throw new Error(`DashScope LLM API error: ${JSON.stringify(json)}`);
  }

  // 解析响应格式：output.choices[0].message.content
  const output = json.output;
  if (!output) {
    throw new Error('No output in DashScope LLM response');
  }

  const choices = output.choices;
  if (!choices || !Array.isArray(choices) || choices.length === 0) {
    throw new Error('No choices in DashScope LLM output');
  }

  const firstChoice = choices[0];
  const message = firstChoice?.message;
  if (!message) {
    throw new Error('No message in DashScope LLM choice');
  }

  const content = message.content;
  if (!content) {
    throw new Error('No content in DashScope LLM message');
  }

  return content;
}

async function generateImageDashScope(prompt, size, negativePrompt, promptExtend, watermark) {
  // 阿里云百炼 Qwen-image 同步接口
  const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  const normalizedSize = normalizeSize(size);
  
  // 构建请求 payload（根据阿里云百炼 API 文档）
  const payload = {
    model: 'qwen-image-max-2025-12-30',
    input: {
      messages: [
        {
          role: 'user',
          content: [
            {
              text: prompt,
            },
          ],
        },
      ],
    },
    parameters: {
      size: normalizedSize,
      prompt_extend: promptExtend !== undefined ? promptExtend : true,
      watermark: watermark !== undefined ? watermark : false,
    },
  };
  
  // 添加负面提示词（可选）
  if (negativePrompt && negativePrompt.trim()) {
    payload.parameters.negative_prompt = negativePrompt.trim();
  }

  console.log(`[${nowIso()}] >>> DashScope (Qwen-image) image generation request`);
  logVerbose(`[${nowIso()}] >>> request body:`, JSON.stringify(payload, null, 2));

  
  const r = await fetchWithRetry(DASHSCOPE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, {
    label: 'dashscope-image',
  });

  const text = await r.text();
  console.log(`[${nowIso()}] <<< DashScope response status: ${r.status} ${r.statusText}`);
  logVerbose(`[${nowIso()}] <<< DashScope response body:`, text);

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`DashScope response parse error: ${e.message}`);
  }

  if (!r.ok) {
    throw new Error(`DashScope API error: ${JSON.stringify(json)}`);
  }

  return json;
}

// 注意：阿里云百炼 Qwen-image 使用同步接口，不需要 fetchImageTask 函数
// 此函数保留用于兼容性，但不会被调用
// async function fetchImageTask(taskId) {
//   throw new Error('Qwen-image 使用同步接口，不需要轮询任务');
// }

// 请求处理函数（兼容 Vercel serverless 和本地开发）
async function handler(req, res) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  // 记录所有请求
  console.log(`[${nowIso()}] [${requestId}] ${req.method} ${req.url}`);
  if (ENABLE_HEADER_LOGS) {
    console.log(`[${nowIso()}] [${requestId}] Headers:`, JSON.stringify(req.headers, null, 2));
  }
  
  try {
    // 处理 Vercel serverless 和本地开发的 URL 解析
    let requestUrl = req.url || '/';
    let host = req.headers.host || 'localhost:5173';
    
    // 解析 URL
    let url;
    try {
      url = new URL(requestUrl, `http://${host}`);
    } catch (e) {
      // 如果 URL 解析失败，使用简单的路径解析
      url = {
        pathname: requestUrl.split('?')[0],
        searchParams: new URLSearchParams(requestUrl.split('?')[1] || '')
      };
    }

    // 处理 OPTIONS 预检请求（CORS）
    if (req.method === 'OPTIONS') {
      console.log(`[${nowIso()}] [${requestId}] Handling OPTIONS preflight request`);
      res.writeHead(200, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'access-control-allow-headers': 'Content-Type, Authorization, X-Internal-Admin-Secret',
      });
      return res.end();
    }

    // =========================
    // Auth APIs
    // =========================
    if (req.method === 'POST' && url.pathname === '/api/auth/send-code') {
      const body = await readJson(req);
      const phoneNumber = normalizePhoneNumber(body?.phoneNumber || body?.username || '');
      const phoneErr = validatePhoneNumber(phoneNumber);
      if (phoneErr) return send(res, 400, { error: phoneErr });

      try {
        const sent = await sendAliyunSmsVerifyCode(phoneNumber);
        if (!sent.success || String(sent.code || '').toUpperCase() !== 'OK') {
          return send(res, 502, {
            success: false,
            error: sent.message || '发送验证码失败',
            code: sent.code || 'ALIYUN_SMS_SEND_FAILED',
          });
        }

        const outId = String(sent?.model?.outId || sent.outId || '');
        if (!outId) {
          return send(res, 502, { success: false, error: '发送验证码失败：缺少 outId' });
        }

        const smsMeta = {
          outId,
          bizId: String(sent?.model?.bizId || ''),
          requestId: String(sent?.model?.requestId || sent?.requestId || ''),
          countryCode: ALIYUN_SMS_COUNTRY_CODE,
          createdAt: nowIso(),
        };

        await kv.set(getPhoneOutIdKey(phoneNumber), smsMeta, {
          ex: Math.max(60, ALIYUN_SMS_VALID_TIME),
        });

        return send(res, 200, {
          success: true,
          message: '验证码发送成功',
          outId,
          validTime: ALIYUN_SMS_VALID_TIME,
          interval: ALIYUN_SMS_INTERVAL,
        });
      } catch (e) {
        console.error(`[${nowIso()}] Send SMS verify code error:`, e);
        return send(res, 500, { error: String(e?.message || e) });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const body = await readJson(req);
      const phoneNumber = normalizePhoneNumber(body?.phoneNumber || body?.username || '');
      const password = String(body?.password || '');
      const verifyCode = String(body?.verifyCode || '').trim();
      const outIdFromBody = String(body?.outId || '').trim();

      const phoneErr = validatePhoneNumber(phoneNumber);
      if (phoneErr) return send(res, 400, { error: phoneErr });
      const passwordError = validatePassword(password);
      if (passwordError) return send(res, 400, { error: passwordError });
      if (!verifyCode) return send(res, 400, { error: '验证码不能为空' });

      const usernameNormalized = normalizeUsername(phoneNumber);
      const usernameKey = getUsernameKey(usernameNormalized);
      const existingUserId = await kv.get(usernameKey);
      if (existingUserId) {
        return send(res, 409, { error: '手机号已注册' });
      }

      const cachedSmsMetaRaw = await kv.get(getPhoneOutIdKey(phoneNumber));
      const cachedSmsMeta = (cachedSmsMetaRaw && typeof cachedSmsMetaRaw === 'object') ? cachedSmsMetaRaw : null;
      const cachedOutId = cachedSmsMeta ? String(cachedSmsMeta.outId || '').trim() : String(cachedSmsMetaRaw || '').trim();

      try {
        const outIdCandidates = [...new Set([outIdFromBody, cachedOutId, ''].map((v) => String(v || '').trim()))];
        const countryCodeCandidates = [...new Set([ALIYUN_SMS_COUNTRY_CODE, '86'].map((v) => String(v || '').trim().replace(/^\+/, '')).filter(Boolean))];

        let verified = false;
        let lastChecked = null;
        let lastErrorMessage = '';

        for (const countryCodeCandidate of countryCodeCandidates) {
          for (const outIdCandidate of outIdCandidates) {
            try {
              const checked = await checkAliyunSmsVerifyCode(phoneNumber, verifyCode, {
                outId: outIdCandidate,
                countryCode: countryCodeCandidate,
              });
              lastChecked = checked;
              const codeOk = String(checked.code || '').toUpperCase() === 'OK';
              if (checked.success && codeOk && checked.verifyPassed) {
                verified = true;
                break;
              }
            } catch (checkErr) {
              lastErrorMessage = String(checkErr?.message || checkErr);
            }
          }
          if (verified) break;
        }

        if (!verified) {
          const failCode = String(lastChecked?.code || '').toUpperCase();
          const failMsg = lastChecked?.message || lastErrorMessage || '验证码错误或已失效';
          console.warn(`[${nowIso()}] SMS verify failed phone=${phoneNumber}, code=${failCode}, msg=${failMsg}, reqId=${lastChecked?.requestId || ''}`);
          return send(res, 400, {
            success: false,
            error: failMsg,
            code: failCode || 'ALIYUN_SMS_VERIFY_FAILED',
            verifyResult: String(lastChecked?.verifyResult || ''),
            requestId: String(lastChecked?.requestId || ''),
          });
        }
      } catch (e) {
        console.error(`[${nowIso()}] Check SMS verify code error:`, e);
        return send(res, 500, { error: String(e?.message || e) });
      }

      const userId = `u_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const user = {
        id: userId,
        username: phoneNumber,
        phoneNumber,
        usernameNormalized,
        passwordHash: await hashPassword(password),
        role: 'user',
        status: 'active',
        dailyLimit: DEFAULT_DAILY_LIMIT,
        createdAt: nowIso(),
      };

      // 小规模场景下做“先检查后写入”；若出现并发冲突，以最后 set 为准
      await kv.set(getUserKey(userId), user);
      await kv.set(usernameKey, userId);
      await kv.del(getPhoneOutIdKey(phoneNumber));

      const session = await createSessionForUser(user);
      const quota = await getQuotaStatus(user);
      return send(res, 200, {
        success: true,
        token: session.token,
        expiresAt: session.expiresAt,
        user: publicUser(user),
        quota,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJson(req);
      const phoneNumber = normalizePhoneNumber(body?.phoneNumber || body?.username || '');
      const password = String(body?.password || '');

      if (!phoneNumber || !password) {
        return send(res, 400, { error: '手机号和密码不能为空' });
      }

      const usernameNormalized = normalizeUsername(phoneNumber);
      const userId = await kv.get(getUsernameKey(usernameNormalized));
      if (!userId) {
        return send(res, 401, { error: '手机号或密码错误' });
      }

      const user = await kv.get(getUserKey(userId));
      if (!user || user.status === 'disabled') {
        return send(res, 401, { error: '手机号或密码错误' });
      }

      if (!await verifyPassword(password, user.passwordHash)) {
        return send(res, 401, { error: '手机号或密码错误' });
      }

      const session = await createSessionForUser(user);
      const quota = await getQuotaStatus(user);
      return send(res, 200, {
        success: true,
        token: session.token,
        expiresAt: session.expiresAt,
        user: publicUser(user),
        quota,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      const auth = await getAuthContext(req);
      if (auth?.tokenHash) {
        await kv.del(getTokenKey(auth.tokenHash));
      }
      return send(res, 200, { success: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const quota = await getQuotaStatus(auth.user);
      return send(res, 200, {
        success: true,
        user: publicUser(auth.user),
        quota,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/quota/me') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const quota = await getQuotaStatus(auth.user);
      return send(res, 200, { success: true, quota });
    }

    // 无管理员系统版本：通过内部密钥调整指定用户每日配额
    if (req.method === 'PATCH' && url.pathname === '/api/internal/users/daily-limit') {
      if (!INTERNAL_ADMIN_SECRET) {
        return send(res, 501, { error: 'INTERNAL_ADMIN_SECRET is not configured' });
      }
      const secret = String(req.headers['x-internal-admin-secret'] || '');
      if (secret !== INTERNAL_ADMIN_SECRET) {
        return send(res, 403, { error: 'Forbidden' });
      }

      const body = await readJson(req);
      const usernameRaw = String(body?.username || '').trim();
      const dailyLimit = Number(body?.dailyLimit);
      if (!usernameRaw) return send(res, 400, { error: 'username is required' });
      if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100000) {
        return send(res, 400, { error: 'dailyLimit must be an integer between 1 and 100000' });
      }

      const userId = await kv.get(getUsernameKey(normalizeUsername(usernameRaw)));
      if (!userId) return send(res, 404, { error: 'user not found' });
      const user = await kv.get(getUserKey(userId));
      if (!user) return send(res, 404, { error: 'user not found' });

      user.dailyLimit = dailyLimit;
      user.dailyLimitCustomized = true;
      user.updatedAt = nowIso();
      await kv.set(getUserKey(userId), user);
      const quota = await getQuotaStatus(user);
      return send(res, 200, { success: true, user: publicUser(user), quota });
    }

    // API: 提交音乐生成任务（Doubao GenSongForTime v4.3）
    if (req.method === 'POST' && url.pathname === '/api/music-submit') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = await readJson(req);

      if (!VOLC_AK || !VOLC_SK) {
        return send(res, 500, { error: 'VOLC_AK / VOLC_SK not configured' });
      }

      const payload = {
        Lyrics: String(body.lyrics || body.prompt || '').trim(),
        ModelVersion: DOUBAO_MODEL_VERSION,
        Genre: String(body.genre || 'Pop').trim(),
        Mood: String(body.mood || 'Happy').trim(),
        Duration: Number(body.duration || 60),
        Lang: String(body.lang || 'Chinese').trim(),
        VodFormat: 'mp3',
        SkipCopyCheck: true,
      };
      if (body.gender) payload.Gender = String(body.gender).trim();
      // V4.3 直传字段
      if (body.timbre) payload.Timbre = String(body.timbre).trim();
      if (body.kmode) payload.Kmode = String(body.kmode).trim();
      if (body.tempo) payload.Tempo = String(body.tempo).trim();
      if (body.instrument) payload.Instrument = String(body.instrument).trim();
      if (body.scene) payload.Scene = String(body.scene).trim();
      if (DOUBAO_CALLBACK_URL) payload.CallbackURL = DOUBAO_CALLBACK_URL;

      logVerbose(`[${nowIso()}] >>> Doubao ${DOUBAO_SUBMIT_ACTION} payload:`, JSON.stringify(payload));
      const result = await callDoubaoMusicApi(DOUBAO_SUBMIT_ACTION, payload);
      console.log(`[${nowIso()}] <<< Doubao submit httpStatus: ${result.httpStatus}`);
      logVerbose(`[${nowIso()}] <<< Doubao submit body:`, JSON.stringify(result.json));

      if (!result.ok) {
        // 不把 Doubao 的 401/403 透传给客户端（避免被误认为是会话鉴权失败）
        const statusCode = [401, 403].includes(result.httpStatus) ? 502 : result.httpStatus;
        return send(res, statusCode, { ...result.json, _doubao_http_status: result.httpStatus });
      }
      if (!isDoubaoBizSuccess(result.json)) return send(res, 502, result.json);
      return send(res, 200, result.json);
    }

    // API: 查询音乐生成状态（Doubao QuerySong）
    if (req.method === 'GET' && url.pathname === '/api/music-fetch') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const id = String(url.searchParams.get('id') || '').trim();
      if (!id) return send(res, 400, { error: 'missing id' });

      if (!VOLC_AK || !VOLC_SK) {
        return send(res, 500, { error: 'VOLC_AK / VOLC_SK not configured' });
      }

      const queryActions = ['QuerySongV4', 'QuerySong', ...DOUBAO_QUERY_ACTIONS];
      const uniqueActions = [...new Set(queryActions)];
      let lastResult = null;
      for (const action of uniqueActions) {
        const result = await callDoubaoMusicApi(action, { TaskID: id });
        console.log(`[${nowIso()}] <<< Doubao ${action} httpStatus: ${result.httpStatus}`);
        logVerbose(`[${nowIso()}] <<< Doubao ${action} body:`, JSON.stringify(result.json));
        lastResult = result;
        if (result.ok && !isActionNotFound(result.json)) {
          return send(res, 200, result.json);
        }
      }
      return send(res, lastResult?.httpStatus || 502, lastResult?.json || { error: 'All query actions failed' });
    }

    // API: 分解用户目标为学习步骤（使用通义千问LLM）
    if (req.method === 'POST' && url.pathname === '/api/decompose-prompt') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      console.log(`[${nowIso()}] [${requestId}] Processing decompose-prompt request`);
      
      if (!DASHSCOPE_API_KEY) {
        console.error(`[${nowIso()}] [${requestId}] DASHSCOPE_API_KEY not configured`);
        return send(res, 500, { error: 'DASHSCOPE_API_KEY not configured' });
      }

      logVerbose(`[${nowIso()}] [${requestId}] Reading request body...`);
      const body = await readJson(req);
      logVerbose(`[${nowIso()}] [${requestId}] Request body:`, JSON.stringify(body, null, 2));
      
      const {
        userGoal,
        learningFocus,
        musicMood,
        musicVoice,
        pictureBookStyle,
        characterType,
        characterName
      } = body;

      if (!userGoal || typeof userGoal !== 'string' || userGoal.trim().length === 0) {
        return send(res, 400, { error: 'userGoal is required' });
      }

      const queueAdmission = await acquireDecomposeSlot();
      if (!queueAdmission.ok) {
        return send(res, 429, {
          success: false,
          error: '系统繁忙，分解请求排队已满，请稍后重试',
          code: 'DECOMPOSE_QUEUE_FULL',
          queue: getDecomposeQueueStats(),
        });
      }
      if (queueAdmission.queued) {
        const stats = getDecomposeQueueStats();
        console.warn(`[${nowIso()}] [${requestId}] decompose queued, active=${stats.active}, queued=${stats.queued}`);
      }

      try {
        // 使用提示词工程生成分解提示词
        const decomposePrompt = prompts.getDecomposePrompt(
          userGoal.trim(),
          learningFocus || '',
          musicMood || '欢快',
          musicVoice,
          pictureBookStyle || '童话',
          characterType || '男生',
          characterName || '乐乐'
        );

        // 调用通义千问LLM
        const llmResponse = await callQwenLLM([
          {
            role: 'user',
            content: decomposePrompt,
          },
        ]);

        // 尝试解析JSON响应
        let parsedResult;
        try {
          // 尝试提取JSON（可能包含markdown代码块）
          const jsonMatch = llmResponse.match(/```json\s*([\s\S]*?)\s*```/) || 
                           llmResponse.match(/```\s*([\s\S]*?)\s*```/) ||
                           [null, llmResponse];
          const jsonText = jsonMatch[1] || jsonMatch[0] || llmResponse;
          
          // 清理 JSON 文本，移除可能的 BOM 和其他不可见字符
          const cleanedJson = jsonText.trim().replace(/^\uFEFF/, '');
          parsedResult = JSON.parse(cleanedJson);
          
          // 验证解析结果的结构
          if (!parsedResult.steps || !Array.isArray(parsedResult.steps)) {
            throw new Error('Invalid response structure: missing steps array');
          }
        } catch (e) {
          // JSON 解析失败，返回错误而不是 fallback（避免步骤数不匹配）
          console.error(`[${nowIso()}] [${requestId}] Failed to parse LLM response as JSON:`, e);
          console.error(`[${nowIso()}] [${requestId}] Raw LLM response:`, llmResponse);
          return send(res, 502, {
            success: false,
            error: `LLM返回格式错误，请重试。详情：${e.message}`,
            error_type: 'decompose_parse_error',
          });
        }

        // 验证步骤数量必须正好为4
        if (parsedResult.steps.length !== 4) {
          console.warn(`[${nowIso()}] [${requestId}] LLM returned ${parsedResult.steps.length} steps instead of 4`);
          return send(res, 502, {
            success: false,
            error: `LLM返回了${parsedResult.steps.length}个步骤（需要正好4个），请重试`,
            error_type: 'decompose_step_count_error',
          });
        }

        return send(res, 200, {
          success: true,
          result: parsedResult,
        });
      } catch (e) {
        console.error(`[${nowIso()}] [${requestId}] Decompose prompt error:`, e);
        console.error(`[${nowIso()}] [${requestId}] Error stack:`, e.stack);
        const errorMessage = e?.message || String(e) || 'Unknown error';
        return send(res, 502, { 
          success: false,
          error: errorMessage,
          error_type: 'decompose_error'
        });
      } finally {
        releaseDecomposeSlot();
      }
    }

    // API: 生成歌词（使用通义千问LLM）
    if (req.method === 'POST' && url.pathname === '/api/generate-lyrics') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!DASHSCOPE_API_KEY) {
        return send(res, 500, { error: 'DASHSCOPE_API_KEY not configured' });
      }

      const body = await readJson(req);
      const { step, characterName, musicMood, musicVoice, stepNumber, totalSteps, musicDuration } = body;

      if (!step || !characterName) {
        return send(res, 400, { error: 'step and characterName are required' });
      }

      try {
        // 使用提示词工程生成歌词提示词
        const lyricsPrompt = prompts.getLyricsPrompt(
          step,
          characterName,
          musicMood || '欢快',
          (musicVoice && String(musicVoice).trim()) ? String(musicVoice).trim() : '男生',
          stepNumber || 1,
          totalSteps || 1,
          Number(musicDuration) || 60
        );

        // 调用通义千问LLM（返回纯文本歌词）
        const raw = await callQwenLLM([
          {
            role: 'user',
            content: lyricsPrompt,
          },
        ]);

        // 清理LLM输出（去除可能的markdown代码块包裹）
        let lyrics = String(raw || '').trim();
        const mdMatch = lyrics.match(/```(?:\w*)\s*([\s\S]*?)\s*```/);
        if (mdMatch) lyrics = mdMatch[1].trim();

        if (!lyrics) {
          throw new Error('歌词生成结果为空');
        }

        return send(res, 200, {
          success: true,
          lyrics: lyrics,
        });
      } catch (e) {
        console.error(`[${nowIso()}] Generate lyrics error:`, e);
        return send(res, 502, { error: String(e.message || e) });
      }
    }

    // API: 生成完整歌曲歌词（包含所有4个步骤）
    if (req.method === 'POST' && url.pathname === '/api/generate-complete-song') {
      const auth = await requireAuth(req, res);
      if (!auth) return;

      const quotaResult = await consumeDailyQuota(auth.user);
      if (!quotaResult.ok) {
        return send(res, 429, {
          error: '今日生成次数已用完',
          code: 'DAILY_LIMIT_EXCEEDED',
          quota: quotaResult,
        });
      }

      if (!DASHSCOPE_API_KEY) {
        return send(res, 500, { error: 'DASHSCOPE_API_KEY not configured' });
      }

      const body = await readJson(req);
      const { steps, characterName, musicMood, musicVoice, musicDuration } = body;

      if (!steps || !Array.isArray(steps) || steps.length !== 4) {
        return send(res, 400, { error: 'steps must be an array with exactly 4 steps' });
      }

      if (!characterName) {
        return send(res, 400, { error: 'characterName is required' });
      }

      try {
        // 验证并记录参数
        const finalMusicMood = musicMood || '欢快';
        const finalMusicVoice = (musicVoice && String(musicVoice).trim()) ? String(musicVoice).trim() : '男生';
        const finalDuration = Number(musicDuration) || 60;
        console.log(`[${nowIso()}] Generate complete song - 使用参数:`, {
          musicMood: finalMusicMood,
          musicVoice: finalMusicVoice,
          musicDuration: finalDuration,
          characterName,
          stepsCount: steps.length
        });

        // 使用提示词工程生成完整歌曲歌词提示词（自由文本输出）
        const lyricsPrompt = prompts.getCompleteSongLyricsPrompt(
          steps,
          characterName,
          finalMusicMood,
          finalMusicVoice,
          finalDuration
        );

        // 调用通义千问LLM（返回纯文本歌词）
        const raw = await callQwenLLM([
          {
            role: 'user',
            content: lyricsPrompt,
          },
        ]);

        // 清理LLM输出（去除可能的markdown代码块包裹）
        let lyrics = String(raw || '').trim();
        // 去除 ```...``` 包裹
        const mdMatch = lyrics.match(/```(?:\w*)\s*([\s\S]*?)\s*```/);
        if (mdMatch) lyrics = mdMatch[1].trim();

        if (!lyrics) {
          throw new Error('歌词生成结果为空');
        }

        return send(res, 200, {
          success: true,
          lyrics: lyrics,
          quota: quotaResult,
        });
      } catch (e) {
        console.error(`[${nowIso()}] Generate complete song error:`, e);
        return send(res, 502, { error: String(e.message || e) });
      }
    }

    // API: 生成组合图片（包含4个小图的大图）
    if (req.method === 'POST' && url.pathname === '/api/generate-combined-image') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!DASHSCOPE_API_KEY) {
        return send(res, 500, { error: 'DASHSCOPE_API_KEY not configured' });
      }

      const body = await readJson(req);
      const { steps, characterName, characterDescription, characterSheet, pictureBookStyle } = body;

      if (!steps || !Array.isArray(steps) || steps.length !== 4) {
        return send(res, 400, { error: 'steps must be an array with exactly 4 steps' });
      }

      if (!characterName) {
        return send(res, 400, { error: 'characterName is required' });
      }

      try {
        // 验证并记录参数
        const finalPictureBookStyle = pictureBookStyle || '柔和水彩扁平';
        console.log(`[${nowIso()}] Generate combined image - 使用参数:`, {
          pictureBookStyle: finalPictureBookStyle,
          characterName,
          hasCharacterSheet: !!characterSheet,
          stepsCount: steps.length
        });

        // 使用提示词工程生成组合图片提示词
        const imagePrompt = prompts.getCombinedImagePrompt(
          steps,
          characterName,
          characterDescription || '',
          characterSheet || null,
          finalPictureBookStyle
        );

        // 调用图片生成API
        const response = await generateImageDashScope(
          imagePrompt.trim(),
          '1664*928', // 固定尺寸
          null, // 使用默认负面提示词
          true, // prompt_extend
          false // watermark
        );

        // 解析响应格式
        const output = response.output;
        if (!output) {
          return send(res, 502, { error: 'No output in response', response });
        }

        const choices = output.choices;
        if (!choices || !Array.isArray(choices) || choices.length === 0) {
          return send(res, 502, { error: 'No choices in output', response });
        }

        const firstChoice = choices[0];
        const message = firstChoice?.message;
        if (!message) {
          return send(res, 502, { error: 'No message in choice', response });
        }

        const content = message.content;
        if (!content || !Array.isArray(content) || content.length === 0) {
          return send(res, 502, { error: 'No content in message', response });
        }

        const firstContent = content[0];
        const imageUrl = firstContent?.image;
        
        if (!imageUrl) {
          return send(res, 502, { error: 'No image URL in content', response });
        }

        // 成功返回图片 URL
        return send(res, 200, {
          request_id: response.request_id,
          image_url: imageUrl,
          usage: response.usage,
        });
      } catch (e) {
        console.error(`[${nowIso()}] Combined image generation error:`, e);
        return send(res, 502, { error: String(e.message || e) });
      }
    }

    // API: 保存生成的内容（Vercel Blob + KV）
    if (req.method === 'POST' && url.pathname === '/api/save-content') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = await readJson(req);
      const { stepIndex, stepName, lyrics, imageUrl, audioUrl, sessionId } = body;

      if (!stepIndex || !stepName) {
        return send(res, 400, { error: 'stepIndex and stepName are required' });
      }

      const subDirName = sessionId || `session_${Date.now()}`;

      try {
        const saved = {
          lyricsUrl: null,
          imageUrl: null,
          audioUrl: null,
        };

        // 保存歌词到 Blob
        if (lyrics) {
          const key = `${subDirName}/step_${stepIndex}_lyrics.txt`;
          const blob = await put(key, lyrics, {
            access: 'public',
            contentType: 'text/plain; charset=utf-8',
            addRandomSuffix: false,
            allowOverwrite: true,
          });
          saved.lyricsUrl = blob.url;
        }

        // 下载并保存图片到 Blob
        if (imageUrl) {
          try {
            const imageResp = await fetch(imageUrl);
            if (imageResp.ok) {
              const imageBuffer = await imageResp.arrayBuffer();
              const key = `${subDirName}/step_${stepIndex}_image.png`;
              const blob = await put(key, Buffer.from(imageBuffer), {
                access: 'public',
                contentType: 'image/png',
                addRandomSuffix: false,
                allowOverwrite: true,
              });
              saved.imageUrl = blob.url;
            }
          } catch (e) {
            console.error(`[${nowIso()}] Failed to save image to blob:`, e);
          }
        }

        // 下载并保存音频到 Blob
        if (audioUrl) {
          try {
            const audioResp = await fetch(audioUrl);
            if (audioResp.ok) {
              const audioBuffer = await audioResp.arrayBuffer();
              const key = `${subDirName}/step_${stepIndex}_audio.mp3`;
              const blob = await put(key, Buffer.from(audioBuffer), {
                access: 'public',
                contentType: 'audio/mpeg',
                addRandomSuffix: false,
                allowOverwrite: true,
              });
              saved.audioUrl = blob.url;
            }
          } catch (e) {
            console.error(`[${nowIso()}] Failed to save audio to blob:`, e);
          }
        }

        // 将“本地可读的 asset url”映射写入 KV，供导入历史时快速生成 URL
        // 只要保存过就写；重复写是幂等的
        const kvKey = getStepCacheKey(auth.user.id, subDirName, stepIndex);
        await kv.hset(kvKey, {
          stepIndex: String(stepIndex),
          stepName: String(stepName || ''),
          lyricsUrl: saved.lyricsUrl || '',
          imageUrl: saved.imageUrl || '',
          audioUrl: saved.audioUrl || '',
          userId: String(auth.user.id),
          updatedAt: new Date().toISOString(),
        });

        return send(res, 200, {
          success: true,
          sessionId: subDirName,
          urls: saved,
        });
      } catch (e) {
        console.error(`[${nowIso()}] Save content error:`, e);
        return send(res, 500, { error: String(e.message || e) });
      }
    }

    // API: 保存历史记录元数据（当所有步骤都生成完成时）（KV 持久化）
    if (req.method === 'POST' && url.pathname === '/api/save-history') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = await readJson(req);
      const { sessionId, decomposedData, stepContents, userGoal, learningFocus, musicSettings, musicVoice, pictureBookStyle, characterType } = body;

      if (!sessionId || !decomposedData || !stepContents) {
        return send(res, 400, { error: 'sessionId, decomposedData, and stepContents are required' });
      }

      try {
        // 检查所有步骤是否都完全生成
        const allStepsComplete = decomposedData.steps.every((step, index) => {
          const content = stepContents[index];
          if (!content) return false;
          const hasLyrics = content.lyrics || content.lyricsError;
          const hasImage = content.imageUrl || content.imageError;
          const hasAudio = content.audioUrl || content.audioError;
          return hasLyrics && hasImage && hasAudio;
        });

        if (!allStepsComplete) {
          return send(res, 400, { error: 'Not all steps are complete. History will not be saved.' });
        }

        const createdAt = new Date().toISOString();

        // 保存历史记录元数据（同时将 URL 固化为 KV 中保存的稳定 URL，如果存在）
        const normalizedStepContents = await Promise.all(stepContents.map(async (content, index) => {
          const stepNumber = index + 1;
          const kvKey = getStepCacheKey(auth.user.id, sessionId, stepNumber);
          let saved = null;
          try {
            saved = await kv.hgetall(kvKey);
          } catch (e) {
            // ignore
          }

          return {
            stepIndex: index,
            lyrics: content.lyrics || null,
            imageUrl: (saved && saved.imageUrl) ? saved.imageUrl : (content.imageUrl || null),
            audioUrl: (saved && saved.audioUrl) ? saved.audioUrl : (content.audioUrl || null),
            lyricsUrl: (saved && saved.lyricsUrl) ? saved.lyricsUrl : null,
            lyricsError: content.lyricsError || null,
            imageError: content.imageError || null,
            audioError: content.audioError || null,
          };
        }));

        const historyData = {
          sessionId,
          userId: auth.user.id,
          userGoal,
          learningFocus,
          musicSettings: musicSettings || {},
          musicVoice,
          pictureBookStyle,
          characterType,
          decomposedData,
          stepContents: normalizedStepContents,
          createdAt,
        };

        // 主记录
        await kv.set(getHistoryDataKey(auth.user.id, sessionId), historyData);

        // 列表索引：用 sorted set 按时间排序，列表接口可分页
        await kv.zadd(getHistoryIndexKey(auth.user.id), { score: Date.now(), member: sessionId });

        return send(res, 200, {
          success: true,
          message: 'History saved successfully',
          sessionId,
        });
      } catch (e) {
        console.error(`[${nowIso()}] Save history error:`, e);
        return send(res, 500, { error: String(e.message || e) });
      }
    }

    // API: 获取历史记录列表（KV）
    if (req.method === 'GET' && url.pathname === '/api/history') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      try {
        // 默认返回最近 50 条
        const limit = Math.min(Number(url.searchParams?.get?.('limit') || 50) || 50, 200);
        const sessionIds = await kv.zrange(getHistoryIndexKey(auth.user.id), -limit, -1);

        if (!sessionIds || sessionIds.length === 0) {
          return send(res, 200, { history: [] });
        }

        // zrange(-limit,-1) 是从旧到新，这里反转成新到旧
        const idsDesc = sessionIds.slice().reverse();

        const items = await Promise.all(idsDesc.map(async (sid) => {
          try {
            const data = await kv.get(getHistoryDataKey(auth.user.id, sid));
            if (!data) return null;
            return {
              sessionId: data.sessionId,
              userGoal: data.userGoal,
              createdAt: data.createdAt,
              stepCount: data.decomposedData?.steps?.length || 0,
              hasAudio: !!(data.stepContents || []).some((s) => s?.audioUrl && !s?.audioDeleted),
            };
          } catch {
            return null;
          }
        }));

        return send(res, 200, { history: items.filter(Boolean) });
      } catch (e) {
        console.error(`[${nowIso()}] Get history error:`, e);
        return send(res, 500, { error: String(e.message || e) });
      }
    }

    // API: 加载历史记录（KV）
    if (req.method === 'GET' && url.pathname.startsWith('/api/history/')) {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const sessionId = url.pathname.replace('/api/history/', '');
      
      if (!sessionId) {
        return send(res, 400, { error: 'sessionId is required' });
      }

      try {
        const historyData = await kv.get(getHistoryDataKey(auth.user.id, sessionId));
        if (!historyData) {
          return send(res, 404, { error: 'History not found' });
        }

        const normalized = await normalizeHistoryStepContents(
          auth.user.id,
          sessionId,
          historyData.stepContents
        );

        if (normalized.changed) {
          historyData.stepContents = normalized.stepContents;
          historyData.updatedAt = nowIso();
          await kv.set(getHistoryDataKey(auth.user.id, sessionId), historyData);
        }

        return send(res, 200, { success: true, data: historyData });
      } catch (e) {
        console.error(`[${nowIso()}] Load history error:`, e);
        return send(res, 500, { error: String(e.message || e) });
      }
    }

    // API: 删除历史记录中的音乐（仅删除当前用户自己的音乐引用）
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/history/')) {
      const auth = await requireAuth(req, res);
      if (!auth) return;

      const raw = url.pathname.replace('/api/history/', '');
      const [sessionId, action] = raw.split('/');
      if (!sessionId || action !== 'music') {
        return send(res, 404, { error: 'Not found' });
      }

      try {
        const historyKey = getHistoryDataKey(auth.user.id, sessionId);
        const historyData = await kv.get(historyKey);
        if (!historyData) return send(res, 404, { error: 'History not found' });

        const stepContents = Array.isArray(historyData.stepContents) ? historyData.stepContents : [];
        const now = nowIso();
        const audioUrls = [];

        const nextStepContents = stepContents.map((item, idx) => {
          const audioUrl = item?.audioUrl ? String(item.audioUrl) : '';
          if (audioUrl) audioUrls.push(audioUrl);
          return {
            ...item,
            audioUrl: null,
            audioDeleted: true,
            audioDeletedAt: now,
            audioError: item?.audioError || '音乐已删除',
          };
        });

        historyData.stepContents = nextStepContents;
        historyData.updatedAt = now;
        await kv.set(historyKey, historyData);

        // 同步更新每步缓存映射，便于后续历史导入和回放保持一致
        await Promise.all(nextStepContents.map(async (item, index) => {
          const stepNumber = index + 1;
          const stepCacheKey = getStepCacheKey(auth.user.id, sessionId, stepNumber);
          await kv.hset(stepCacheKey, {
            audioUrl: '',
            updatedAt: now,
          });
        }));

        // 尝试删除 Vercel Blob 资源（可选，失败不影响业务结果）
        const uniqueUrls = [...new Set(audioUrls)];
        await Promise.all(uniqueUrls.map(async (audioUrl) => {
          try {
            // 仅尝试删除 blob.vercel-storage URL；外部 URL（如 suno）无法删除
            if (audioUrl.includes('.blob.vercel-storage.com')) {
              await del(audioUrl);
            }
          } catch (e) {
            console.warn(`[${nowIso()}] delete blob audio failed (${audioUrl}):`, e?.message || e);
          }
        }));

        return send(res, 200, {
          success: true,
          sessionId,
          deletedAudioCount: uniqueUrls.length,
          message: '音乐已删除',
        });
      } catch (e) {
        console.error(`[${nowIso()}] Delete music error:`, e);
        return send(res, 500, { error: String(e.message || e) });
      }
    }

    // NOTE: /api/asset 本地文件读取接口已弃用。
    // 资源现在通过 Vercel Blob 提供稳定公开 URL；历史导入也直接使用历史数据中的 URL。

    // API: 图片生成 (DashScope qwen-image)
    if (req.method === 'POST' && url.pathname === '/api/generate-image') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      if (!DASHSCOPE_API_KEY) {
        return send(res, 500, { error: 'DASHSCOPE_API_KEY not configured' });
      }

      const body = await readJson(req);
      const { 
        prompt, 
        size = '1664*928', 
        negative_prompt = null,
        prompt_extend = true,
        watermark = false
      } = body;

      const DEFAULT_NEGATIVE_PROMPT = 'horror, creepy, scary, dark, low light, dramatic shadows, uncanny, realistic skin, pores, wrinkles, lifeless eyes, distorted face, deformed, extra fingers, malformed hands, disfigured, text, watermark, logo, gore';
      const effectiveNegativePrompt = (negative_prompt && String(negative_prompt).trim().length > 0)
        ? String(negative_prompt)
        : DEFAULT_NEGATIVE_PROMPT;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return send(res, 400, { error: 'prompt is required' });
      }

      try {
        // 调用阿里云百炼 Qwen-image 同步接口
        const response = await generateImageDashScope(
          prompt.trim(), 
          size, 
          effectiveNegativePrompt,
          prompt_extend,
          watermark
        );

        // 解析响应格式：output.choices[0].message.content[0].image
        const output = response.output;
        if (!output) {
          return send(res, 502, { error: 'No output in response', response });
        }

        const choices = output.choices;
        if (!choices || !Array.isArray(choices) || choices.length === 0) {
          return send(res, 502, { error: 'No choices in output', response });
        }

        const firstChoice = choices[0];
        const message = firstChoice?.message;
        if (!message) {
          return send(res, 502, { error: 'No message in choice', response });
        }

        const content = message.content;
        if (!content || !Array.isArray(content) || content.length === 0) {
          return send(res, 502, { error: 'No content in message', response });
        }

        const firstContent = content[0];
        const imageUrl = firstContent?.image;
        
        if (!imageUrl) {
          return send(res, 502, { error: 'No image URL in content', response });
        }

        // 成功返回图片 URL
        return send(res, 200, {
          request_id: response.request_id,
          image_url: imageUrl,
          usage: response.usage,
        });
      } catch (e) {
        console.error(`[${nowIso()}] Image generation error:`, e);
        return send(res, 502, { error: String(e.message || e) });
      }
    }

    // 静态文件处理
    if (req.method === 'GET') {
      let filePath;
      
      // 处理根路径
      if (url.pathname === '/' || url.pathname === '') {
        filePath = path.join(__dirname, 'index.html');
      } else {
        // 处理其他静态文件（图片、CSS、JS等）
        // 移除开头的斜杠，避免路径问题
        const cleanPath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
        filePath = path.join(__dirname, cleanPath);
      }
      
      // 在 Vercel 上，__dirname 可能指向不同的位置，需要特殊处理
      // 尝试多个可能的路径
      const possiblePaths = [
        filePath,
        path.join(process.cwd(), url.pathname === '/' ? 'index.html' : url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname),
        path.join(__dirname, '..', url.pathname === '/' ? 'index.html' : url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname)
      ];
      
      let foundPath = null;
      for (const testPath of possiblePaths) {
        // 安全检查：确保文件在项目目录内
        const resolvedPath = path.resolve(testPath);
        const projectRoot = path.resolve(process.cwd());
        
        // 允许访问项目根目录下的文件
        if (resolvedPath.startsWith(projectRoot) && fs.existsSync(testPath) && fs.statSync(testPath).isFile()) {
          foundPath = testPath;
          break;
        }
      }
      
      if (foundPath) {
        return sendFile(res, foundPath);
      } else {
        // 如果文件不存在，记录日志但不返回错误（让其他路由处理）
        console.log(`[${nowIso()}] [${requestId}] Static file not found: ${url.pathname}, tried paths:`, possiblePaths);
      }
    }

    console.log(`[${nowIso()}] [${requestId}] 404 Not Found: ${req.method} ${url.pathname}`);
    res.writeHead(404, {
      'access-control-allow-origin': '*',
      'content-type': 'application/json; charset=utf-8',
    });
    res.end(JSON.stringify({ error: 'Not found', path: url.pathname }));
  } catch (e) {
    console.error(`[${nowIso()}] [${requestId}] Unhandled server error:`, e);
    console.error(`[${nowIso()}] [${requestId}] Error stack:`, e.stack);
    send(res, 500, { error: String(e?.message || e) });
  } finally {
    const duration = Date.now() - startTime;
    console.log(`[${nowIso()}] [${requestId}] Request completed in ${duration}ms`);
  }
}

// 兼容 Vercel serverless 和本地开发
// Vercel 会提供 req 和 res，本地开发时使用 http.createServer
if (typeof module !== 'undefined' && require.main !== module) {
  // 作为模块导入（Vercel serverless）
  module.exports = handler;
} else {
  // 本地开发模式
  const server = http.createServer(handler);
server.listen(PORT, () => {
  console.log('\n========================================');
  console.log('Server started successfully!');
  console.log('========================================');
  console.log(`Server running: http://localhost:${PORT}`);
  console.log(`Proxy BASE_URL: ${BASE_URL}`);
  console.log(`Suno API Key: ${API_KEY && API_KEY.length >= 10 ? `✓ Set (${maskKey(API_KEY)})` : '✗ Not set or invalid'}`);
  console.log(`DashScope API Key: ${DASHSCOPE_API_KEY && DASHSCOPE_API_KEY.length >= 10 ? `✓ Set (${maskKey(DASHSCOPE_API_KEY)})` : '✗ Not set or invalid'}`);
  /*
  console.log(`Tianpuyue API Key: ${TIANPUYUE_API_KEY && TIANPUYUE_API_KEY.length >= 10 ? `✓ Set (${maskKey(TIANPUYUE_API_KEY)})` : '✗ Not set or invalid'}`);
  console.log(`Tianpuyue model: ${TIANPUYUE_MODEL}, voice_id: ${TIANPUYUE_VOICE_ID}`);
  */
  console.log(`Doubao VOLC_AK: ${VOLC_AK && VOLC_AK.length >= 10 ? `✓ Set (${maskKey(VOLC_AK)})` : '✗ Not set or invalid'}`);
  console.log(`Doubao VOLC_SK: ${VOLC_SK && VOLC_SK.length >= 10 ? `✓ Set (${maskKey(VOLC_SK)})` : '✗ Not set or invalid'}`);
  console.log(`Doubao submit action: ${DOUBAO_SUBMIT_ACTION}, model version: ${DOUBAO_MODEL_VERSION}`);
  console.log(`Doubao query actions: ${DOUBAO_QUERY_ACTIONS.join(', ')}`);
  console.log(`Verbose logs: ${ENABLE_VERBOSE_LOGS ? 'ON' : 'OFF'} (headers: ${ENABLE_HEADER_LOGS ? 'ON' : 'OFF'})`);
  console.log(`Upstream retry: max=${UPSTREAM_MAX_RETRIES}, base=${UPSTREAM_RETRY_BASE_MS}ms, maxDelay=${UPSTREAM_RETRY_MAX_DELAY_MS}ms`);
  console.log(`Decompose queue: concurrency=${DECOMPOSE_MAX_CONCURRENCY}, maxQueue=${DECOMPOSE_MAX_QUEUE}`);
  console.log('========================================\n');
});
}
