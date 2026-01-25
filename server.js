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
const prompts = require('./prompts.js');

const { put } = require('@vercel/blob');
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
  console.log(`[DEBUG] DASHSCOPE_API_KEY (完整): ${DASHSCOPE_API_KEY}`);
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
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
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

async function proxyJson(req, res, targetUrl, method, bodyObj, customHeaders = {}) {
  const reqBodyText = bodyObj ? JSON.stringify(bodyObj) : undefined;

  // 打印"全文"（请求 body）以及目标 URL，便于核对是否真的发出了内容
  console.log(`\n[${nowIso()}] >>> proxy ${method} ${targetUrl}`);
  if (reqBodyText !== undefined) {
    console.log(`[${nowIso()}] >>> request body (FULL):`);
    console.log(reqBodyText);
  } else {
    console.log(`[${nowIso()}] >>> request body: <empty>`);
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
      console.log(`[${nowIso()}] >>> Using X-API-Key header: ${maskKey(API_KEY)}`);
    } else {
      // 方式2: Authorization: Bearer {token}（标准方式，默认）
      headers['Authorization'] = `Bearer ${API_KEY}`;
      console.log(`[${nowIso()}] >>> Using Authorization: Bearer ${maskKey(API_KEY)}`);
    }
    console.log(`[${nowIso()}] >>> API Key length: ${API_KEY.length} characters`);
  } else {
    console.warn(`[${nowIso()}] >>> WARNING: No API_KEY provided for request to ${targetUrl}`);
  }

  let r;
  let text;
  try {
    // 连接超时在某些网络环境会频繁发生，这里做更强健的错误处理，避免直接崩溃
    r = await fetch(targetUrl, {
    method,
    headers,
    body: reqBodyText,
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
  console.log(`[${nowIso()}] <<< response body (FULL):`);
  console.log(text);

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
  console.log(`[${nowIso()}] >>> request body:`, JSON.stringify(payload, null, 2));

  const r = await fetch(DASHSCOPE_LLM_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await r.text();
  console.log(`[${nowIso()}] <<< DashScope LLM response status: ${r.status} ${r.statusText}`);
  console.log(`[${nowIso()}] <<< DashScope LLM response body:`, text);

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
  console.log(`[${nowIso()}] >>> request body:`, JSON.stringify(payload, null, 2));

  
  const r = await fetch(DASHSCOPE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await r.text();
  console.log(`[${nowIso()}] <<< DashScope response status: ${r.status} ${r.statusText}`);
  console.log(`[${nowIso()}] <<< DashScope response body:`, text);

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
  console.log(`[${nowIso()}] [${requestId}] Headers:`, JSON.stringify(req.headers, null, 2));
  
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
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'Content-Type, Authorization',
      });
      return res.end();
    }

    // API: submit music generation
    if (req.method === 'POST' && url.pathname === '/api/suno/submit/music') {
      const body = await readJson(req);

      // 根据 BASE_URL 判断使用哪个 API 格式
      const isGetGoAPI = BASE_URL.includes('getgoapi.com');
      const isDefAPI = BASE_URL.includes('defapi.org');

      let submitUrl, payload;

      if (isGetGoAPI) {
        // cn.getgoapi.com 格式：根据错误信息，/api/v1/generate 返回 404
        // 可能需要使用其他端点，但根据错误信息，这个服务可能已经不支持或端点已变更
        // 建议用户切换到 defapi.org 或检查 getgoapi.com 的最新文档
        console.warn(`[${nowIso()}] WARNING: cn.getgoapi.com /api/v1/generate 返回 404，端点可能已变更或不支持`);
        console.warn(`[${nowIso()}] 建议：1) 检查 getgoapi.com 的最新 API 文档 2) 切换到 defapi.org`);
        
        // 尝试使用 /api/v1/generate（虽然会失败，但保持代码结构）
        submitUrl = `${BASE_URL}/api/v1/generate`;
        const customMode = body.custom_mode ?? true;
        payload = {
          customMode: customMode,
          instrumental: body.make_instrumental ?? false,
          model: body.mv ?? 'chirp-v4-5',
          callBackUrl: body.callback_url || 'https://example.com/callback', // 必需字段
          prompt: body.prompt ?? '',
        };
        
        // 如果开启 customMode，添加额外字段
        if (customMode) {
          if (body.title) payload.style = body.title; // getgoapi 使用 style 而不是 title
          if (body.tags) payload.style = (payload.style || '') + (payload.style ? ', ' : '') + body.tags;
        }
        
        console.log(`[${nowIso()}] submit payload check (getgoapi): prompt_len=${String(payload.prompt || '').length}, model=${payload.model}, customMode=${payload.customMode}, instrumental=${payload.instrumental}`);
      } else if (isDefAPI) {
        // api.defapi.org 格式：/api/suno/generate
        submitUrl = `${BASE_URL}/api/suno/generate`;
        payload = {
          mv: body.mv ?? 'chirp-v4-5',
          custom_mode: body.custom_mode ?? true,
          make_instrumental: body.make_instrumental ?? false,
          prompt: body.prompt ?? '',
          title: body.title ?? '',
          tags: body.tags ?? '',
          negative_tags: body.negative_tags ?? '',
          continue_at: body.continue_at,
          continue_clip_id: body.continue_clip_id,
          cover_clip_id: body.cover_clip_id,
          callback_url: body.callback_url,
        };
        
        // 移除 undefined 字段
        Object.keys(payload).forEach(key => {
          if (payload[key] === undefined) delete payload[key];
        });
        
        console.log(`[${nowIso()}] submit payload check (defapi): prompt_len=${String(payload.prompt || '').length}, title=${payload.title}, tags=${payload.tags}, mv=${payload.mv}, custom_mode=${payload.custom_mode}`);
      } else {
        // 默认使用 defapi 格式
        submitUrl = `${BASE_URL}/api/suno/generate`;
        payload = {
          mv: body.mv ?? 'chirp-v4-5',
          custom_mode: body.custom_mode ?? true,
          make_instrumental: body.make_instrumental ?? false,
          prompt: body.prompt ?? '',
          title: body.title ?? '',
          tags: body.tags ?? '',
        };
        console.log(`[${nowIso()}] submit payload check (default): prompt_len=${String(payload.prompt || '').length}, title=${payload.title}, tags=${payload.tags}, mv=${payload.mv}`);
      }

      return proxyJson(req, res, submitUrl, 'POST', payload);
    }

    // API: fetch task status
    if (req.method === 'GET' && url.pathname === '/api/suno/fetch') {
      const id = url.searchParams.get('id');
      if (!id) return send(res, 400, { error: 'missing id' });
      
      // 根据 BASE_URL 判断使用哪个 fetch 端点
      const isGetGoAPI = BASE_URL.includes('getgoapi.com');
      const isDefAPI = BASE_URL.includes('defapi.org');
      
      let fetchUrl;
      if (isGetGoAPI) {
        // cn.getgoapi.com 格式：尝试多个可能的端点
        // 根据 main.py，可能的端点有：/api/v1/fetch 或 /suno/fetch
        // 先尝试 /api/v1/fetch?id=xxx
        fetchUrl = `${BASE_URL}/api/v1/fetch?id=${encodeURIComponent(id)}`;
      } else if (isDefAPI) {
        // api.defapi.org 格式：/api/task/query?task_id=xxx
        fetchUrl = `${BASE_URL}/api/task/query?task_id=${encodeURIComponent(id)}`;
      } else {
        // 默认使用 defapi 格式
        fetchUrl = `${BASE_URL}/api/task/query?task_id=${encodeURIComponent(id)}`;
      }
      
      return proxyJson(req, res, fetchUrl, 'GET');
    }

    // API: 分解用户目标为学习步骤（使用通义千问LLM）
    if (req.method === 'POST' && url.pathname === '/api/decompose-prompt') {
      console.log(`[${nowIso()}] [${requestId}] Processing decompose-prompt request`);
      
      if (!DASHSCOPE_API_KEY) {
        console.error(`[${nowIso()}] [${requestId}] DASHSCOPE_API_KEY not configured`);
        return send(res, 500, { error: 'DASHSCOPE_API_KEY not configured' });
      }

      console.log(`[${nowIso()}] [${requestId}] Reading request body...`);
      const body = await readJson(req);
      console.log(`[${nowIso()}] [${requestId}] Request body:`, JSON.stringify(body, null, 2));
      
      const { 
        userGoal, 
        learningFocus, 
        musicStyle, 
        musicVoice, 
        pictureBookStyle, 
        characterType,
        characterName
      } = body;

      if (!userGoal || typeof userGoal !== 'string' || userGoal.trim().length === 0) {
        return send(res, 400, { error: 'userGoal is required' });
      }

      try {
        // 使用提示词工程生成分解提示词
        const decomposePrompt = prompts.getDecomposePrompt(
          userGoal.trim(),
          learningFocus || '',
          musicStyle || '欢快',
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
          // 如果解析失败，记录详细错误并返回默认结构
          console.warn(`[${nowIso()}] [${requestId}] Failed to parse LLM response as JSON:`, e);
          console.warn(`[${nowIso()}] [${requestId}] Raw LLM response:`, llmResponse);
          
          // 返回一个有效的默认结构，确保前端能正常处理
          parsedResult = {
            steps: [
              {
                step_number: 1,
                step_name: '学习准备',
                step_description: '请检查API响应格式',
                learning_objective: '确保API正常工作'
              }
            ],
            character_name: '乐乐',
            character_description: '温暖友好的伙伴',
            parse_error: e.message,
            raw_response: llmResponse.substring(0, 500), // 限制长度避免响应过大
          };
        }

        // 确保返回有效的 JSON 结构
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
      }
    }

    // API: 生成歌词（使用通义千问LLM）
    if (req.method === 'POST' && url.pathname === '/api/generate-lyrics') {
      if (!DASHSCOPE_API_KEY) {
        return send(res, 500, { error: 'DASHSCOPE_API_KEY not configured' });
      }

      const body = await readJson(req);
      const { step, characterName, musicStyle, musicVoice, stepNumber, totalSteps } = body;

      if (!step || !characterName) {
        return send(res, 400, { error: 'step and characterName are required' });
      }

      try {
        // 使用提示词工程生成歌词提示词
        const lyricsPrompt = prompts.getLyricsPrompt(
          step,
          characterName,
          musicStyle || '欢快',
          (musicVoice && String(musicVoice).trim()) ? String(musicVoice).trim() : '男生',
          stepNumber || 1,
          totalSteps || 1
        );

        // 调用通义千问LLM（要求返回严格JSON：{ fixed_prefix, steps_lyrics[4] }）
        const raw = await callQwenLLM([
          {
            role: 'user',
            content: lyricsPrompt,
          },
        ]);

        let parsed;
        try {
          parsed = JSON.parse(String(raw).trim());
        } catch (e) {
          throw new Error('完整歌曲歌词返回不是合法JSON，请检查prompt或模型输出：' + (e?.message || e));
        }

        const fixedPrefix = String(parsed?.fixed_prefix || '').trim();
        const stepsLyrics = parsed?.steps_lyrics;

        if (!Array.isArray(stepsLyrics) || stepsLyrics.length !== 4) {
          throw new Error('完整歌曲歌词JSON格式错误：steps_lyrics 必须为长度=4的数组');
        }

        const normalizedStepsLyrics = stepsLyrics.map((s, idx) => {
          const line = String(s ?? '').trim();
          if (!line) throw new Error(`第${idx + 1}步歌词为空`);
          if (/[\r\n]/.test(line)) throw new Error(`第${idx + 1}步歌词包含换行符（不允许）`);
          if (fixedPrefix && !line.startsWith(fixedPrefix)) {
            throw new Error(`第${idx + 1}步歌词未以固定句头“${fixedPrefix}”开头`);
          }
          return line;
        });

        const fullLyrics = normalizedStepsLyrics.join('\n');

        return send(res, 200, {
          success: true,
          fixed_prefix: fixedPrefix,
          steps_lyrics: normalizedStepsLyrics,
          full_lyrics: fullLyrics,
        });
      } catch (e) {
        console.error(`[${nowIso()}] Generate lyrics error:`, e);
        return send(res, 502, { error: String(e.message || e) });
      }
    }

    // API: 生成完整歌曲歌词（包含所有4个步骤）
    if (req.method === 'POST' && url.pathname === '/api/generate-complete-song') {
      if (!DASHSCOPE_API_KEY) {
        return send(res, 500, { error: 'DASHSCOPE_API_KEY not configured' });
      }

      const body = await readJson(req);
      const { steps, characterName, musicStyle, musicVoice } = body;

      if (!steps || !Array.isArray(steps) || steps.length !== 4) {
        return send(res, 400, { error: 'steps must be an array with exactly 4 steps' });
      }

      if (!characterName) {
        return send(res, 400, { error: 'characterName is required' });
      }

      try {
        // 验证并记录参数
        const finalMusicStyle = musicStyle || '欢快';
        const finalMusicVoice = (musicVoice && String(musicVoice).trim()) ? String(musicVoice).trim() : '男生';
        console.log(`[${nowIso()}] Generate complete song - 使用参数:`, {
          musicStyle: finalMusicStyle,
          musicVoice: finalMusicVoice,
          characterName,
          stepsCount: steps.length
        });

        // 使用提示词工程生成完整歌曲歌词提示词
        const lyricsPrompt = prompts.getCompleteSongLyricsPrompt(
          steps,
          characterName,
          finalMusicStyle,
          finalMusicVoice
        );

        // 调用通义千问LLM（要求返回严格JSON：{ fixed_prefix, steps_lyrics[4] }）
        const raw = await callQwenLLM([
          {
            role: 'user',
            content: lyricsPrompt,
          },
        ]);

        let parsed;
        try {
          parsed = JSON.parse(String(raw).trim());
        } catch (e) {
          console.error(`[${nowIso()}] Generate complete song JSON parse error. Raw:`, raw);
          throw new Error('完整歌曲歌词返回不是合法JSON，请检查prompt或模型输出：' + (e?.message || e));
        }

        const fixedPrefix = String(parsed?.fixed_prefix || '').trim();
        const stepsLyrics = parsed?.steps_lyrics;

        if (!Array.isArray(stepsLyrics) || stepsLyrics.length !== 4) {
          throw new Error('完整歌曲歌词JSON格式错误：steps_lyrics 必须为长度=4的数组');
        }

        const normalizedStepsLyrics = stepsLyrics.map((s, idx) => {
          const line = String(s ?? '').trim();
          if (!line) throw new Error(`第${idx + 1}步歌词为空`);
          if (/[\r\n]/.test(line)) throw new Error(`第${idx + 1}步歌词包含换行符（不允许）`);
          if (fixedPrefix && !line.startsWith(fixedPrefix)) {
            throw new Error(`第${idx + 1}步歌词未以固定句头“${fixedPrefix}”开头`);
          }
          return line;
        });

        const fullLyrics = normalizedStepsLyrics.join('\n');

        return send(res, 200, {
          success: true,
          fixed_prefix: fixedPrefix,
          steps_lyrics: normalizedStepsLyrics,
          full_lyrics: fullLyrics,
        });
      } catch (e) {
        console.error(`[${nowIso()}] Generate complete song error:`, e);
        return send(res, 502, { error: String(e.message || e) });
      }
    }

    // API: 生成组合图片（包含4个小图的大图）
    if (req.method === 'POST' && url.pathname === '/api/generate-combined-image') {
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
              });
              saved.audioUrl = blob.url;
            }
          } catch (e) {
            console.error(`[${nowIso()}] Failed to save audio to blob:`, e);
          }
        }

        // 将“本地可读的 asset url”映射写入 KV，供导入历史时快速生成 URL
        // 只要保存过就写；重复写是幂等的
        const kvKey = `session:${subDirName}:step:${stepIndex}`;
        await kv.hset(kvKey, {
          stepIndex: String(stepIndex),
          stepName: String(stepName || ''),
          lyricsUrl: saved.lyricsUrl || '',
          imageUrl: saved.imageUrl || '',
          audioUrl: saved.audioUrl || '',
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
      const body = await readJson(req);
      const { sessionId, decomposedData, stepContents, userGoal, learningFocus, musicStyle, musicVoice, pictureBookStyle, characterType } = body;

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
          const kvKey = `session:${sessionId}:step:${stepNumber}`;
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
          userGoal,
          learningFocus,
          musicStyle,
          musicVoice,
          pictureBookStyle,
          characterType,
          decomposedData,
          stepContents: normalizedStepContents,
          createdAt,
        };

        // 主记录
        await kv.set(`history:${sessionId}`, historyData);

        // 列表索引：用 sorted set 按时间排序，列表接口可分页
        await kv.zadd('history:index', { score: Date.now(), member: sessionId });

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
      try {
        // 默认返回最近 50 条
        const limit = Math.min(Number(url.searchParams?.get?.('limit') || 50) || 50, 200);
        const sessionIds = await kv.zrange('history:index', -limit, -1);

        if (!sessionIds || sessionIds.length === 0) {
          return send(res, 200, { history: [] });
        }

        // zrange(-limit,-1) 是从旧到新，这里反转成新到旧
        const idsDesc = sessionIds.slice().reverse();

        const items = await Promise.all(idsDesc.map(async (sid) => {
          try {
            const data = await kv.get(`history:${sid}`);
            if (!data) return null;
            return {
              sessionId: data.sessionId,
              userGoal: data.userGoal,
              createdAt: data.createdAt,
              stepCount: data.decomposedData?.steps?.length || 0,
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
      const sessionId = url.pathname.replace('/api/history/', '');
      
      if (!sessionId) {
        return send(res, 400, { error: 'sessionId is required' });
      }

      try {
        const historyData = await kv.get(`history:${sessionId}`);
        if (!historyData) {
          return send(res, 404, { error: 'History not found' });
        }

        return send(res, 200, { success: true, data: historyData });
      } catch (e) {
        console.error(`[${nowIso()}] Load history error:`, e);
        return send(res, 500, { error: String(e.message || e) });
      }
    }

    // NOTE: /api/asset 本地文件读取接口已弃用。
    // 资源现在通过 Vercel Blob 提供稳定公开 URL；历史导入也直接使用历史数据中的 URL。

    // API: 图片生成 (DashScope qwen-image)
    if (req.method === 'POST' && url.pathname === '/api/generate-image') {
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
  console.log('========================================\n');
});
}
