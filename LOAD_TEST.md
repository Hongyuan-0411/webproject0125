# 并发压测说明（k6 / autocannon）

本项目推荐分两类压测：

1. **应用层稳定性**（本服务吞吐、队列、限流行为）
2. **端到端稳定性**（包含 DashScope / Doubao / 阿里云短信真实上游）

## 0. 预备环境

- Node.js >= 18
- 服务启动：

```bash
node server.js
```

建议压测前显式设置：

```bash
export ENABLE_VERBOSE_LOGS=0
export ENABLE_HEADER_LOGS=0
export DECOMPOSE_MAX_CONCURRENCY=8
export DECOMPOSE_MAX_QUEUE=120
export UPSTREAM_MAX_RETRIES=2
export UPSTREAM_RETRY_BASE_MS=300
```

## 1. Decompose 并发压测（autocannon）

脚本：`scripts/loadtest/decompose.autocannon.sh`

```bash
export BASE_URL="http://localhost:5173"
export AUTH_TOKEN="<你的token>"
export CONNECTIONS=100
export DURATION=60
./scripts/loadtest/decompose.autocannon.sh
```

关注指标：

- `Req/Sec`
- `Latency p95/p99`
- 非 2xx 比例（队列满会出现 429）

## 2. Decompose 并发压测（k6）

脚本：`scripts/loadtest/decompose.k6.js`

```bash
k6 run \
  -e BASE_URL=http://localhost:5173 \
  -e AUTH_TOKEN=<你的token> \
  -e VUS=100 \
  -e DURATION=60s \
  scripts/loadtest/decompose.k6.js
```

## 3. 注册并发压测注意事项

当前注册链路依赖阿里云短信验证码，真实并发压测需满足：

- 测试手机号池
- 验证码发送与校验速率白名单
- 成本预算

若没有短信沙箱，不建议直接在生产短信通道做 100 并发注册压测。

可先执行登录并发压测（已有账号）：

```bash
k6 run \
  -e BASE_URL=http://localhost:5173 \
  -e PHONE=<测试手机号> \
  -e PASSWORD=<测试密码> \
  -e VUS=100 \
  -e DURATION=30s \
  scripts/loadtest/login.k6.js
```

## 4. 建议通过标准（参考）

- `http_req_failed < 10%`（短时高压）
- `p95 < 5s`，`p99 < 8s`
- 队列满（429）比例可控且可恢复
- 无明显内存持续上涨 / 事件循环卡顿

## 5. 压测后结论必须包含

- 可稳定承载并发（例如：40 / 60 / 100）
- 触发瓶颈点（本服务/上游）
- 推荐生产参数（并发阈值、队列长度、重试次数）
