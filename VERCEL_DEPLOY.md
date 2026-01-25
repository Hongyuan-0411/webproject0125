# Vercel 部署指南

## 已修复的问题

### 1. 图片显示问题
- ✅ 修复了静态文件路径解析，支持 Vercel serverless 环境
- ✅ 添加了多路径尝试机制，确保在不同环境下都能找到文件
- ✅ 配置了 `vercel.json` 路由规则

### 2. API 响应格式问题
- ✅ 改进了 JSON 响应处理，确保始终返回有效的 JSON
- ✅ 增强了错误处理，即使解析失败也返回有效的响应结构
- ✅ 添加了响应验证和清理机制

### 3. Vercel 兼容性
- ✅ 修改了 `server.js` 以支持 Vercel serverless function 格式
- ✅ 保持了本地开发的兼容性
- ✅ 配置了正确的超时时间（60秒）

## 部署步骤

### 1. 准备文件

确保以下文件已创建：
- ✅ `vercel.json` - Vercel 配置文件
- ✅ `package.json` - Node.js 项目配置
- ✅ `server.js` - 已修改为兼容 Vercel
- ✅ `prompts.js` - 提示词模块
- ✅ `index.html` - 前端页面
- ✅ `yinhuixing.png` - Logo 图片

### 2. 在 Vercel 上部署

#### 方法1：通过 Vercel CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
vercel

# 生产环境部署
vercel --prod
```

#### 方法2：通过 GitHub 集成

1. 将代码推送到 GitHub
2. 在 [Vercel Dashboard](https://vercel.com/dashboard) 中点击 "New Project"
3. 导入你的 GitHub 仓库
4. Vercel 会自动检测配置并部署

### 3. 配置环境变量

在 Vercel 项目设置中添加环境变量：

```
SUNO_API_KEY=your-suno-api-key
DASHSCOPE_API_KEY=your-dashscope-api-key
```

**注意**：如果 `server.js` 中有硬编码的 API Keys，它们会作为默认值使用，但建议使用环境变量。

### 4. 验证部署

部署完成后，访问你的 Vercel URL，检查：
- ✅ 页面能正常加载
- ✅ Logo 图片能正常显示
- ✅ "分解学习目标" 功能能正常工作
- ✅ API 请求返回有效的 JSON 响应

## 故障排查

### 图片不显示

如果图片仍然不显示：
1. 检查 `yinhuixing.png` 是否在项目根目录
2. 检查 Vercel 构建日志，确认文件被正确上传
3. 在浏览器开发者工具中检查图片请求的响应

### API 返回无效响应

如果仍然遇到 "服务器返回了无效的响应格式"：
1. 检查 Vercel 函数日志，查看详细的错误信息
2. 确认环境变量已正确设置
3. 检查 DashScope API Key 是否有效
4. 查看浏览器控制台的网络请求详情

### 超时问题

如果请求超时：
- 当前配置的超时时间为 60 秒
- 可以在 `vercel.json` 中调整 `maxDuration`
- 注意 Vercel 免费版有超时限制

## 项目结构

```
.
├── vercel.json          # Vercel 配置
├── package.json         # Node.js 配置
├── server.js            # 服务器（兼容 Vercel）
├── prompts.js           # 提示词模块
├── index.html           # 前端页面
├── yinhuixing.png       # Logo 图片
└── .gitignore           # Git 忽略文件
```

## 注意事项

1. **API Keys 安全**：虽然代码中有默认 API Keys，但建议使用环境变量
2. **文件大小**：确保上传的文件不超过 Vercel 的限制
3. **冷启动**：Vercel serverless functions 可能有冷启动延迟
4. **日志**：在 Vercel Dashboard 中可以查看函数执行日志

## 本地测试

在部署前，可以在本地测试 Vercel 环境：

```bash
# 安装 Vercel CLI
npm i -g vercel

# 在项目目录运行
vercel dev
```

这会启动一个本地服务器，模拟 Vercel 环境。
