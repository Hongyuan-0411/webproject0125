/**
 * 火山引擎 API 中转代理（Windows 服务器生产版）
 * 用途：将 Vercel（美国服务器）的请求通过国内服务器转发给火山引擎
 *
 * 部署方式（Windows 服务器）：
 *   1. 安装 Node.js：https://nodejs.org
 *   2. 安装 PM2：npm install -g pm2 pm2-windows-startup
 *   3. 启动代理：pm2 start proxy.js --name volc-proxy
 *   4. 设置开机自启：pm2-startup install  →  pm2 save
 *   5. 在 Vercel 环境变量中设置：DOUBAO_PROXY_URL=http://你的服务器IP:8080
 */

'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── 配置 ──────────────────────────────────────────────────
const PORT        = Number(process.env.PROXY_PORT) || 8080;
const TARGET_HOST = 'open.volcengineapi.com';
const LOG_FILE    = path.join(__dirname, 'proxy.log');
const MAX_LOG_BYTES = 50 * 1024 * 1024; // 日志超过 50MB 自动清空

// 允许访问的来源 IP 白名单（留空 [] 则不限制）
// 建议填入你的 Vercel 出口 IP 段，或留空先跑通再加
const ALLOWED_IPS = (process.env.PROXY_ALLOWED_IPS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// 请求超时（毫秒）
const TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS) || 30000;
// ──────────────────────────────────────────────────────────

// ── 日志 ──────────────────────────────────────────────────
function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  process.stdout.write(line);
  try {
    // 超过大小限制就清空
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) {
      fs.writeFileSync(LOG_FILE, line);
    } else {
      fs.appendFileSync(LOG_FILE, line);
    }
  } catch (_) { /* 磁盘写失败不影响主流程 */ }
}
// ──────────────────────────────────────────────────────────

// ── 服务器 ────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const clientIp = req.socket.remoteAddress || '';

  // IP 白名单校验
  if (ALLOWED_IPS.length > 0 && !ALLOWED_IPS.some(ip => clientIp.includes(ip))) {
    log('WARN', `拒绝访问 来自 ${clientIp}`);
    res.writeHead(403);
    res.end(JSON.stringify({ error: 'forbidden' }));
    return;
  }

  // 健康检查接口
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', target: TARGET_HOST, uptime: process.uptime() }));
    return;
  }

  const chunks = [];

  req.setTimeout(TIMEOUT_MS, () => {
    log('WARN', `请求读取超时 ${req.method} ${req.url}`);
    req.destroy();
  });

  req.on('data', chunk => chunks.push(chunk));

  req.on('end', () => {
    const body = Buffer.concat(chunks);

    const options = {
      hostname: TARGET_HOST,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: TARGET_HOST,
      },
      timeout: TIMEOUT_MS,
    };

    const proxy = https.request(options, (volcRes) => {
      // 过滤掉可能引起问题的 hop-by-hop 响应头
      const filteredHeaders = Object.fromEntries(
        Object.entries(volcRes.headers).filter(
          ([k]) => !['connection', 'transfer-encoding', 'keep-alive'].includes(k.toLowerCase())
        )
      );
      filteredHeaders['access-control-allow-origin'] = '*';

      res.writeHead(volcRes.statusCode, filteredHeaders);
      volcRes.pipe(res);

      log('INFO', `${req.method} ${req.url} → ${volcRes.statusCode} 来自 ${clientIp}`);
    });

    proxy.on('timeout', () => {
      log('WARN', `转发超时 ${req.method} ${req.url}`);
      proxy.destroy();
      if (!res.headersSent) {
        res.writeHead(504);
        res.end(JSON.stringify({ error: 'gateway timeout' }));
      }
    });

    proxy.on('error', (err) => {
      log('ERROR', `转发失败 ${req.method} ${req.url} : ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(502);
        res.end(JSON.stringify({ error: 'proxy error', detail: err.message }));
      }
    });

    proxy.end(body);
  });

  req.on('error', (err) => {
    log('ERROR', `请求读取失败: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(400);
      res.end();
    }
  });
});

server.on('error', (err) => {
  log('ERROR', `服务器错误: ${err.message}`);
});

server.listen(PORT, '0.0.0.0', () => {
  log('INFO', '========================================');
  log('INFO', `火山引擎中转代理已启动（生产模式）`);
  log('INFO', `监听端口：${PORT}`);
  log('INFO', `转发目标：https://${TARGET_HOST}`);
  log('INFO', `日志文件：${LOG_FILE}`);
  log('INFO', '========================================');
});

// ── 优雅退出 ──────────────────────────────────────────────
function gracefulShutdown(signal) {
  log('INFO', `收到 ${signal}，正在关闭服务器...`);
  server.close(() => {
    log('INFO', '服务器已安全关闭');
    process.exit(0);
  });
  // 超过 5 秒强制退出
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  log('ERROR', `未捕获异常: ${err.message}\n${err.stack}`);
  // PM2 会自动重启，这里直接退出
  process.exit(1);
});
