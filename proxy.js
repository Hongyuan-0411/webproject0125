/**
 * 火山引擎 API 中转代理
 * 用途：将 Vercel（美国服务器）的请求通过本机（中国大陆 IP）转发给火山引擎
 * 使用方法：node proxy.js
 */

const http = require('http');
const https = require('https');

const PORT = 8080;

const server = http.createServer((req, res) => {
  const chunks = [];

  req.on('data', chunk => chunks.push(chunk));

  req.on('end', () => {
    const body = Buffer.concat(chunks);

    // 转发到火山引擎
    const options = {
      hostname: 'open.volcengineapi.com',
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: 'open.volcengineapi.com',
      },
    };

    const proxy = https.request(options, (volcRes) => {
      res.writeHead(volcRes.statusCode, volcRes.headers);
      volcRes.pipe(res);
    });

    proxy.on('error', (err) => {
      console.error('[proxy] 转发失败:', err.message);
      if (!res.headersSent) {
        res.writeHead(502);
        res.end(JSON.stringify({ error: 'proxy error', detail: err.message }));
      }
    });

    proxy.end(body);

    // 打印日志
    const now = new Date().toISOString();
    console.log(`[${now}] ${req.method} ${req.url} → 转发至 open.volcengineapi.com`);
  });

  req.on('error', (err) => {
    console.error('[proxy] 请求读取失败:', err.message);
    res.writeHead(400);
    res.end();
  });
});

server.listen(PORT, () => {
  console.log('========================================');
  console.log(`火山引擎 API 中转代理已启动`);
  console.log(`本地监听：http://localhost:${PORT}`);
  console.log(`目标服务：https://open.volcengineapi.com`);
  console.log('========================================');
  console.log('下一步：打开新终端，运行 ngrok http 8080');
  console.log('========================================');
});
