# 提取的URL和Prompts

## 一、从终端日志中提取的URL

### 音频URL（Suno生成）
- https://audiopipe.suno.ai/?item_id=37af1d7a-c3da-4b97-8e50-da9c73bfcd00
- https://audiopipe.suno.ai/?item_id=7f3cc713-346b-4506-b7e9-ce58ddb11cd8
- https://audiopipe.suno.ai/?item_id=8e04c7c3-10b2-44af-a2c2-0621bc3ed3f2
- https://audiopipe.suno.ai/?item_id=ee237a37-de82-47e0-9c9b-7205764b8cb4

### 图片URL（Suno生成 - 音频封面）
- https://cdn2.suno.ai/image_37af1d7a-c3da-4b97-8e50-da9c73bfcd00.jpeg
- https://cdn2.suno.ai/image_7f3cc713-346b-4506-b7e9-ce58ddb11cd8.jpeg
- https://cdn2.suno.ai/image_8e04c7c3-10b2-44af-a2c2-0621bc3ed3f2.jpeg
- https://cdn2.suno.ai/image_ee237a37-de82-47e0-9c9b-7205764b8cb4.jpeg
- https://cdn2.suno.ai/image_large_37af1d7a-c3da-4b97-8e50-da9c73bfcd00.jpeg
- https://cdn2.suno.ai/image_large_7f3cc713-346b-4506-b7e9-ce58ddb11cd8.jpeg
- https://cdn2.suno.ai/image_large_8e04c7c3-10b2-44af-a2c2-0621bc3ed3f2.jpeg
- https://cdn2.suno.ai/image_large_ee237a37-de82-47e0-9c9b-7205764b8cb4.jpeg

### 图片URL（DashScope生成 - 学习内容图片）
- https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/7d/74/20260125/d23adf3d/d3e59974-8e2c-4c7f-ae80-8b8e5d5fc5c34088409780.png?Expires=1769879984&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=Z9kMDvNOfIKK33931cf1iDQJB4M%3D

### API端点URL
- https://api.defapi.org
- https://api.defapi.org/api/suno/generate
- https://api.defapi.org/api/task/query?task_id=ta2d86a6-4df7-4aca-a940-83d8e4183878
- https://api.defapi.org/api/task/query?task_id=ta651f1b-9bc9-4faf-844f-250431af05de
- https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation
- https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation

---

## 二、Prompts.js中的所有Prompt函数

### 1. getDecomposePrompt - 目标分解提示词
**用途：** 用于通义千问LLM分解用户输入的目标为4个学习步骤

**参数：**
- userGoal: 用户目标
- learningFocus: 学习重点
- musicStyle: 音乐风格
- musicVoice: 音乐声音
- pictureBookStyle: 绘本风格
- characterType: 角色类型
- characterName: 角色名称（新增）

**核心要求：**
- 必须正好4个步骤
- 每个步骤简单明确，适合3-6岁自闭症儿童
- 步骤之间逻辑连贯
- 严格避免恐怖、暴力、危险内容
- 返回JSON格式，包含steps、character_name、character_description、character_sheet

---

### 2. getImagePrompt - 图片生成提示词
**用途：** 用于通义千问文生图，生成单个步骤的绘本场景插画

**参数：**
- step: 学习步骤对象
- characterName: 角色名称
- characterDescription: 角色描述
- stepNumber: 当前步骤编号
- totalSteps: 总步骤数
- characterSheet: 角色设定卡

**核心要求：**
- 绘本场景（不要只画一个物体）
- 角色全程一致且必须出现
- 学习对象清晰可辨
- 符合生活常识
- 画面简洁但不空
- 突出核心认知点
- 严格安全性要求
- 画面连续性
- 绘本风格统一
- **文字要求（重要）：图片一般不需要添加任何文字，如果需要加文字，必须与内容一致**

---

### 3. getMusicPrompt - 音乐生成提示词（用于Suno）
**用途：** 用于Suno生成单个步骤的歌曲

**参数：**
- step: 学习步骤对象
- characterName: 角色名称
- musicStyle: 音乐风格
- stepNumber: 当前步骤编号
- totalSteps: 总步骤数

**核心要求：**
- 总时长控制在40-60秒之间
- 歌曲结构简单：1个Verse + Chorus重复1-2次
- 无前奏间奏
- 严格避免恐怖、不适内容

---

### 4. getLyricsPrompt - 歌词生成提示词
**用途：** 为每个步骤生成详细歌词

**参数：**
- step: 学习步骤对象
- characterName: 角色名称
- musicStyle: 音乐风格
- musicVoice: 音乐声音
- stepNumber: 当前步骤编号
- totalSteps: 总步骤数

**核心要求：**
- 最后一步：2-3个主歌 + 1-2次副歌，总时长35-45秒
- 非最后一步：1-2段Verse + 1段可重复的Chorus，总时长40-60秒
- 每行4-10个字（最后一步）或4-8个字（非最后一步）
- 包含角色名称
- 强拍起唱（不要弱起）
- 人声一致性硬规则（所有步骤必须完全一致）

---

### 5. getCompleteSongLyricsPrompt - 完整歌曲歌词生成提示词
**用途：** 生成包含所有4个步骤的完整歌曲歌词

**参数：**
- steps: 所有步骤数组
- characterName: 角色名称
- musicStyle: 音乐风格
- musicVoice: 音乐声音

**核心要求（必须严格遵守）：**

**1. 歌曲时长和结构：**
- 总时长必须严格控制在40-50秒之间，绝对不能高于60秒，也不能少于30秒
- 歌曲结构：扩展的、并列式多乐句一段体
- 每个乐句不宜过长，2小节或8拍为佳
- 适当使用重复的句子和词语，增强记忆点
- 前奏不要超过8秒
- 总歌词行数建议：8-12行（包含4个步骤，每个步骤2-3行）

**2. 歌词要求：**
- 每行歌词3-8个字，可以灵活变化
- 使用简单、重复的句式，类似经典儿歌
- 歌词与音高是一字对一音的关系
- 可以包含角色名称
- 突出每个步骤的核心概念
- 带"固定句头"的并列乐段（必须严格遵守）

**3. 音乐风格和特点：**
- 调性：C大调、F大调或G大调（必须选择其中之一）
- 节拍：2/4或4/4拍，节拍规整，没有弱起小节
- 音域：严格控制在小字组b至小字二组e范围内
- 节奏：以四分音符和八分音符为主，适当使用附点节奏，少量使用紧凑的节奏型，不要有切分节奏
- 风格：轻快、活泼、朗朗上口
- 旋律：以二度级进为主，不要有4度以上的跳进，将旋律核心音域控制在五度内。旋律风格请参考传统童谣《小星星》

**4. 人声与伴奏：**
- 人声：清晰度高于一切，咬字清楚，只能用标准的普通话，不要有任何粤语、方言等
- 人声与伴奏的声音比例为6（人声）：4（伴奏）
- 伴奏：主要提供基础的节奏支撑和和声氛围，音量低于人声，但律动感仍在

**示例格式（固定句头模式）：**
- 示例1（句头为"小牙刷"）
- 示例2（句头为"小点心"）
- 示例3（句头为"星期一"）

**输出格式：**
- 每个步骤3-4行歌词，共12-16行歌词
- 确保总时长在40-50秒之间
- 只输出歌词内容，不要包含任何标记

---

### 6. getCombinedImagePrompt - 组合图片生成提示词
**用途：** 生成包含4个小图的大图（1664*928像素）

**参数：**
- steps: 所有步骤数组
- characterName: 角色名称
- characterDescription: 角色描述
- characterSheet: 角色设定卡
- pictureBookStyle: 绘本风格

**核心要求：**

**1. 布局要求（2x2网格）：**
- 生成一张1664*928像素的大图
- 大图必须包含4个小图，按照2x2网格排列
- 左上角：步骤1的插画（832*464像素）
- 右上角：步骤2的插画（832*464像素）
- 左下角：步骤3的插画（832*464像素）
- 右下角：步骤4的插画（832*464像素）
- 4个小图的尺寸必须完全一致，位置必须对齐

**2. 每个小图的要求：**
- 绘本场景（不要只画一个物体）
- 角色全程一致且必须出现
- 学习对象清晰可辨
- 符合生活常识
- 画面简洁但不空
- 突出核心认知点
- 严格安全性要求
- 画面连续性
- **文字要求（重要）：图片一般不需要添加任何文字，如果需要加文字，必须与内容一致**

**3. 整体要求：**
- 4个小图之间可以有细微的分隔线或留白
- 整体色调统一，风格一致
- 绘本风格统一

---

## 三、Prompt函数导出列表

```javascript
module.exports = {
  getDecomposePrompt,           // 目标分解
  getImagePrompt,                // 单个步骤图片生成
  getMusicPrompt,                // 单个步骤音乐生成（Suno）
  getLyricsPrompt,               // 单个步骤歌词生成
  getCompleteSongLyricsPrompt,  // 完整歌曲歌词生成
  getCombinedImagePrompt,        // 组合图片生成（4个小图）
};
```

---

## 四、关键配置参数

### 时长要求
- **完整歌曲：** 40-50秒（绝对不能高于60秒，也不能少于30秒）
- **前奏：** 不超过8秒
- **歌词行数：** 8-12行（每个步骤2-3行）

### 音乐参数
- **调性：** C大调、F大调或G大调
- **节拍：** 2/4或4/4拍
- **音域：** 小字组b至小字二组e
- **人声伴奏比例：** 6:4

### 图片参数
- **大图尺寸：** 1664*928像素
- **小图尺寸：** 832*464像素
- **布局：** 2x2网格

---

## 五、重要提示

1. 所有prompt函数都强调"必须严格遵守"的要求
2. 角色一致性是图片生成的核心要求
3. 文字要求：图片一般不需要添加任何文字，如果需要加文字，必须与内容一致
4. 音乐生成强调时长、调性、节拍、音域、人声伴奏比例等核心要求
5. 所有内容必须正面、积极、安全、温馨，严格避免恐怖、暴力、危险内容
