// 提示词工程文件
// 用于3-6岁自闭症儿童认知能力结构化提升系统

/**
 * 1. 目标分解提示词（用于通义千问LLM分解用户输入的目标）
 */
function getDecomposePrompt(userGoal, learningFocus, musicMood, musicVoice, pictureBookStyle, characterType, characterName) {
  const focusText = learningFocus ? `\n学习重点：${learningFocus}` : '';
  const charName = characterName || '乐乐';

  return `你是一位专业的特殊教育专家，专门为3-6岁自闭症儿童设计认知学习方案。

用户目标：${userGoal}${focusText}
音乐心情：${musicMood}
音乐声音：${musicVoice}
绘本风格：${pictureBookStyle}
角色名称：${charName}
角色类型：${characterType || '男生'}

请将上述目标分解为4个循序渐进的学习步骤（必须正好4个步骤，不能多也不能少），每个步骤应该：
${learningFocus ? '1. 特别关注学习重点"' + learningFocus + '"，确保每个步骤都围绕这个重点内容展开，重点突出需要让孩子学会的内容\n' : ''}${learningFocus ? '2. ' : '1. '}简单明确，适合3-6岁自闭症儿童理解
${learningFocus ? '3. ' : '2. '}循序渐进，内容需要简单、具体、易于理解
${learningFocus ? '4. ' : '3. '}每个步骤可以独立成为一个学习单元
${learningFocus ? '5. ' : '4. '}步骤之间逻辑连贯，形成完整的学习路径
${learningFocus ? '6. ' : '5. '}每个步骤之间的画面需要有连续性，不要出现跳跃、人物、目标物不一致的情况
${learningFocus ? '7. ' : '6. '}严格避免出现任何可能恐吓或引起孩子不适的内容，包括但不限于：
   - 恐怖、黑暗、阴森的画面或情节
   - 暴力、冲突、争吵的场景
   - 悲伤、哭泣、害怕的情绪表达
   - 危险物品（如刀具、火、尖锐物品等）
   - 怪物、鬼怪、恐怖角色
   - 突然的惊吓、巨响、快速移动的物体
   - 任何可能引起焦虑、恐惧的内容
${learningFocus ? '8. ' : '7. '}确保所有内容都是正面、积极、安全、温馨的

请以JSON格式返回，格式如下（必须严格输出合法JSON，不要额外文字，不要Markdown代码块）：
{
  "steps": [
    {
      "step_number": 1,
      "step_name": "步骤名称",
      "step_description": "步骤详细描述",
      "learning_objective": "学习目标"
    }
  ],
  "character_name": "${charName}",
  "character_description": "角色描述（20字以内）",
  "character_sheet": {
    "name": "${charName}",
    "type": "角色类型（必须与用户选择一致，例如：男生/女生/爸爸/妈妈/动物/自定义）",
    "age": "大约5岁（如为爸爸妈妈则写成人）",
    "face": "脸型与五官特征（固定，例如：圆脸，大眼睛，微笑）",
    "hair": "发型发色（固定）",
    "outfit": "服装（固定，不换装）",
    "accessory": "配饰（固定，可为空）",
    "main_colors": ["主色1","主色2"],
    "reference_prompt": "一句话角色设定卡：包含脸型/发型/衣服/配色/配饰，要求所有步骤完全一致，不换装不换发型不换画风"
  }
}`;
}

/**
 * 2. 图片生成提示词（用于通义千问文生图）
 */
function getImagePrompt(step, characterName, characterDescription, stepNumber, totalSteps, characterSheet) {
  const csText = characterSheet?.reference_prompt ? String(characterSheet.reference_prompt).trim() : '';
  const csBlock = csText
    ? `\n\n角色设定卡（必须严格遵守，所有步骤完全一致，不允许任何变化）：\n${csText}\n\n一致性硬规则：\n- 必须保持同一张脸、同一发型、同一衣服、同一配饰、同一主色调、同一画风\n- 禁止换装、禁止换发型、禁止变成不同人物/不同动物、禁止年龄变化\n- 如果无法保证一致性，请重新生成直到一致\n`
    : `\n\n角色一致性硬规则（缺少设定卡时仍必须遵守）：\n- 角色必须出现在画面中\n- 所有步骤保持同一张脸、同一发型、同一衣服、同一画风，不换装不换发型\n`;

  return `为3-6岁自闭症儿童创作"绘本场景插画"。\n\n学习内容：\n- 学习步骤：${step.step_name}\n- 步骤描述：${step.step_description}\n- 学习目标：${step.learning_objective}\n- 当前步骤：第${stepNumber}步，共${totalSteps}步\n- 角色：${characterName}${characterDescription ? `（${characterDescription}）` : ''}\n${csBlock}\n核心要求：\n1. **绘本场景（不要只画一个物体）**：学习对象必须处在一个温馨的生活场景中（家里/教室/公园/厨房/浴室/客厅等），并有适量背景元素，但画面不拥挤。\n2. **角色全程一致且必须出现**：角色必须出现在画面中，并严格遵守"角色设定卡/硬规则"，所有步骤保持同一位角色。\n3. **学习对象清晰可辨**：学习对象清晰、准确、占画面重要位置；角色可以指向/拿起/使用该对象。\n4. **符合生活常识**：场景与物品符合现实生活常识，不扭曲、不超现实。\n5. **画面简洁但不空**：色调明亮柔和，避免高刺激对比与复杂文字。\n6. **突出核心认知点**：通过角色动作突出要学的点（如洗手就在洗手台前洗手）。\n7. **严格安全性要求**：温馨安全正面，避免恐怖/暴力/危险物品等。\n8. **画面连续性**：多步骤尽量保持同一地点/同一角色/同一物品外观连续。\n9. **绘本风格统一**：儿童绘本插画风格，线条干净，色彩统一，温馨可爱。\n10. **文字要求（重要）**：\n   - **图片一般不需要添加任何文字**，优先使用视觉元素表达内容\n   - 如果确实需要添加文字（如钟表上的数字、物品标签等），文字必须与学习内容完全一致\n   - **严禁添加与学习内容不一致的文字**，例如：学习内容是"认识钟表"，图片上不能出现"认识水果"等无关文字\n   - 如果学习内容不涉及文字（如认识形状、颜色等），图片中不要添加任何文字\n\n请生成一幅符合要求的绘本插画。`;
}

/**
 * 3. 音乐生成提示词（用于Suno生成歌曲，当前未活跃使用）
 */
function getMusicPrompt(step, characterName, musicMood, stepNumber, totalSteps) {
  const styleMap = {
    '欢快': 'cheerful children song, upbeat, happy, bouncy, lively',
    '快乐': 'happy children song, joyful, fun, energetic',
    '活力四射': 'energetic children song, dynamic, vibrant, exciting',
    '感人': 'touching children song, heartfelt, warm, emotional',
    '平静': 'calm children song, peaceful, soothing, gentle',
    '抒情': 'lyrical children song, expressive, melodic, flowing',
  };

  const styleTags = styleMap[musicMood] || 'children song, gentle, educational, upbeat, cheerful';

  return `[主歌]
${step.step_name}
${step.step_description}
Let's learn together
With ${characterName} by our side

[副歌]
Step by step we go
Learning every day
${step.learning_objective}
We're getting better, hooray!

[主歌 2]
Repeat and practice
One more time, let's try
${step.step_name}
We can do it, you and I

[副歌]
Step by step we go
Learning every day
${step.learning_objective}
We're getting better, hooray!

音乐风格要求：
- ${styleTags}
- 适合3-6岁儿童
- 轻快、活泼、朗朗上口的音调
- 节奏明快但不急促，易于跟随
- 旋律简单、易记、温馨友好
- 音调明亮、欢快，传递快乐和正能量
- **总时长控制在90-120秒之间**
- 歌曲结构：3-4个Verse + 2-3次Chorus
- 严格避免任何可能恐吓或引起孩子不适的内容
- 歌词和旋律必须正面、积极、安全、温馨`;
}

/**
 * 4. 歌词生成提示词（用于为每个步骤生成详细歌词）
 */
function getLyricsPrompt(step, characterName, musicMood, musicVoice, stepNumber, totalSteps, durationSeconds) {
  const dur = Number(durationSeconds) || 60;
  let lyricsGuide;
  if (dur <= 30) {
    lyricsGuide = '总歌词行数：6-10行，结构：1段主歌 + 1段副歌';
  } else if (dur <= 45) {
    lyricsGuide = '总歌词行数：10-15行，结构：1-2段主歌 + 1段副歌';
  } else if (dur <= 60) {
    lyricsGuide = '总歌词行数：12-18行，结构：2段主歌 + 1-2段副歌';
  } else if (dur <= 90) {
    lyricsGuide = '总歌词行数：18-25行，结构：2-3段主歌 + 2段副歌';
  } else {
    lyricsGuide = '总歌词行数：25-35行，结构：3-4段主歌 + 2-3段副歌';
  }

  return `你是一位专业的儿童音乐创作专家，专门为3-6岁自闭症儿童创作认知学习儿歌。

学习步骤信息：
- 步骤名称：${step.step_name}
- 步骤描述：${step.step_description}
- 学习目标：${step.learning_objective}
- 角色名称：${characterName}
- 音乐心情：${musicMood}
- 音乐声音：${musicVoice}
- 当前步骤：第${stepNumber}步，共${totalSteps}步
- 目标时长：约${dur}秒

请为这个学习步骤创作一首儿童学习歌曲的歌词，歌词将直接输入到音乐生成模型中。

**创作要求：**
1. ${lyricsGuide}
2. 每行歌词4-10个字，朗朗上口
3. 多用重复句、叠词、拟声词，适合3-6岁儿童跟唱
4. 必须包含角色${characterName}的名字
5. 突出当前步骤的核心概念
6. 使用标准普通话，正面积极安全
7. 风格：${musicMood}
8. 强拍起唱，句首直接是有意义的词

**输出要求：**
- 只输出歌词，使用[主歌]和[副歌]标签分段
- 不要输出任何解释、说明、JSON格式、BPM/调性说明

请直接输出歌词。`;
}

/**
 * 5. 生成包含所有4个步骤的完整歌曲歌词（自由生成版 — 直接输出歌词文本，用于输入音乐生成模型）
 */
function getCompleteSongLyricsPrompt(steps, characterName, musicMood, musicVoice, durationSeconds) {
  const stepsText = steps.map((step, index) =>
    `步骤${index + 1}：${step.step_name}\n  描述：${step.step_description}\n  学习目标：${step.learning_objective}`
  ).join('\n\n');

  // 根据时长动态调整歌词量
  const dur = Number(durationSeconds) || 60;
  let lyricsGuide;
  if (dur <= 30) {
    lyricsGuide = '歌词总量约6-10行，结构简洁：1段主歌 + 1段副歌即可';
  } else if (dur <= 45) {
    lyricsGuide = '歌词总量约10-15行，结构：1-2段主歌 + 1段副歌';
  } else if (dur <= 60) {
    lyricsGuide = '歌词总量约12-18行，结构：2段主歌 + 1-2段副歌';
  } else if (dur <= 90) {
    lyricsGuide = '歌词总量约18-25行，结构：2-3段主歌 + 2段副歌';
  } else {
    lyricsGuide = '歌词总量约25-35行，结构：3-4段主歌 + 2-3段副歌';
  }

  return `你是一位专业的儿童音乐创作专家，专门为3-6岁自闭症儿童创作认知学习儿歌。

学习内容（共4个步骤）：
${stepsText}

角色名称：${characterName}
音乐心情：${musicMood}
音乐声音：${musicVoice}
目标时长：约${dur}秒

请为以上4个学习步骤创作一首完整的儿童学习歌曲的歌词。歌词将直接输入到音乐生成模型中生成歌曲。

**创作要求：**
1. ${lyricsGuide}
2. 歌词必须涵盖4个学习步骤的核心内容，按步骤顺序展开
3. 使用[主歌]和[副歌]标签组织歌词结构
4. 每行歌词4-10个字，朗朗上口
5. 多用重复句、叠词、拟声词，适合3-6岁儿童跟唱
6. 必须包含角色名称"${characterName}"
7. 使用标准普通话，正面积极安全，严禁任何恐吓/不适内容
8. 风格：${musicMood}，适合儿童
9. 强拍起唱，句首直接是有意义的词，不要弱起

**输出要求：**
- 只输出歌词内容，不要输出任何解释、说明、JSON格式
- 使用[主歌]和[副歌]标签分段
- 不要输出Markdown代码块

请直接输出歌词。`;
}

/**
 * 6. 生成包含4个小图的大图提示词（新增）
 */
function getCombinedImagePrompt(steps, characterName, characterDescription, characterSheet, pictureBookStyle) {
  const csText = characterSheet?.reference_prompt ? String(characterSheet.reference_prompt).trim() : '';
  const csBlock = csText
    ? `\n\n角色设定卡（必须严格遵守，所有步骤完全一致，不允许任何变化）：\n${csText}\n\n一致性硬规则：\n- 必须保持同一张脸、同一发型、同一衣服、同一配饰、同一主色调、同一画风\n- 禁止换装、禁止换发型、禁止变成不同人物/不同动物、禁止年龄变化\n`
    : `\n\n角色一致性硬规则（缺少设定卡时仍必须遵守）：\n- 角色必须出现在画面中\n- 所有步骤保持同一张脸、同一发型、同一衣服、同一画风，不换装不换发型\n`;

  const stepsText = steps.map((step, index) =>
    `步骤${index + 1}：${step.step_name}\n  描述：${step.step_description}\n  学习目标：${step.learning_objective}`
  ).join('\n\n');

  return `为3-6岁自闭症儿童创作"绘本场景插画组合图"。

学习内容（共4个步骤）：
${stepsText}

角色：${characterName}${characterDescription ? `（${characterDescription}）` : ''}
绘本风格：${pictureBookStyle}
${csBlock}

**核心要求：**

1. **布局要求（2x2网格）**：
   - 生成一张1664*928像素的大图
   - 大图必须包含4个小图，按照2x2网格排列（上下两行，每行两个）
   - 左上角：步骤1的插画（832*464像素）
   - 右上角：步骤2的插画（832*464像素）
   - 左下角：步骤3的插画（832*464像素）
   - 右下角：步骤4的插画（832*464像素）
   - 4个小图的尺寸必须完全一致，位置必须对齐，方便后续裁剪

2. **每个小图的要求**：
   - 绘本场景（不要只画一个物体）：学习对象必须处在一个温馨的生活场景中（家里/教室/公园/厨房/浴室/客厅等），并有适量背景元素，但画面不拥挤
   - 角色全程一致且必须出现：角色必须出现在每个小图中，并严格遵守"角色设定卡/硬规则"，所有小图保持同一位角色
   - 学习对象清晰可辨：学习对象清晰、准确、占画面重要位置；角色可以指向/拿起/使用该对象
   - 符合生活常识：场景与物品符合现实生活常识，不扭曲、不超现实
   - 画面简洁但不空：色调明亮柔和，避免高刺激对比与复杂文字
   - 突出核心认知点：通过角色动作突出要学的点（如洗手就在洗手台前洗手）
   - 严格安全性要求：温馨安全正面，避免恐怖/暴力/危险物品等
   - 画面连续性：4个小图尽量保持同一地点/同一角色/同一物品外观连续
   - **文字要求（重要）**：
     - **图片一般不需要添加任何文字**，优先使用视觉元素表达内容
     - 如果确实需要添加文字（如钟表上的数字、物品标签等），文字必须与学习内容完全一致
     - **严禁添加与学习内容不一致的文字**，例如：学习内容是"认识钟表"，图片上不能出现"认识水果"等无关文字
     - 如果学习内容不涉及文字（如认识形状、颜色等），图片中不要添加任何文字

3. **整体要求**：
   - 4个小图之间可以有细微的分隔线或留白，但不要过于明显
   - 整体色调统一，风格一致
   - 绘本风格统一：儿童绘本插画风格，线条干净，色彩统一，温馨可爱

请生成一幅符合要求的2x2网格组合插画（1664*928像素）。`;
}

module.exports = {
  getDecomposePrompt,
  getImagePrompt,
  getMusicPrompt,
  getLyricsPrompt,
  getCompleteSongLyricsPrompt,
  getCombinedImagePrompt,
};
