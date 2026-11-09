const fs = require('fs');
const path = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(path, 'utf8');
const before = (s.match(/\uFFFD/g) || []).length;

/** Exact substring replacements (broken → clean). Order: longer first where needed. */
const pairs = [
  // top comments
  [
    /\/\/ 基于 1600x342 console-assembled\.png[^\n]*/,
    '// 基于 1600x342 console-assembled.png 像素孔位精确对齐的小地图、头像、血蓝条、信息栏、6格背包、12格技能槽百分比',
  ],
  [
    /\/\/ 血\uFFFD\?蓝条上下靠拢（间隙约 0\.15%），避免蓝条离血条过\uFFFD\?/,
    '// 血/蓝条上下靠拢（间隙约 0.15%），避免蓝条离血条过近',
  ],
  [
    /\/\* 工具条下拉：结构对齐语言选择，配色跟随回放页黑金主题（不吃站点红\/浅色变量\uFFFD\?\*\//,
    '/* 工具条下拉：结构对齐语言选择，配色跟随回放页黑金主题（不吃站点红/浅色变量）*/',
  ],
  [
    /\/\* WC3 64x64 内容常略偏右上：略放大并向左下偏移，让主体在槽内更居\uFFFD\?\*\//,
    '/* WC3 64x64 内容常略偏右上：略放大并向左下偏移，让主体在槽内更居中 */',
  ],

  // HTML comments / titles
  [
    /<!-- 左上\uFFFD\?4 个原生魔兽菜[\s\S]*?-->/,
    '<!-- 左上 4 个原生魔兽菜单槽（精确对齐 UpperButtonBar.fdf 孔位与原生贴图，严丝合缝） -->',
  ],
  ['title="查看地图信息与机制说\uFFFD?(F9)"', 'title="查看地图信息与机制说明 (F9)"'],
  ['title="查看对局聊天与事件记\uFFFD?(F12)"', 'title="查看对局聊天与事件记录 (F12)"'],
  [
    /<!-- 顶部中央日夜[\s\S]*?-->/,
    '<!-- 顶部中央日夜球时钟读数（分:秒 精确居中） -->',
  ],
  [
    /<!-- 右侧 4 个原生魔兽资源槽（精确对\uFFFD\?ResourceBar\.fdf 4个凹槽：金币 \/ 木材 \/ 人口等级 \/ 地图版本\uFFFD\?-->/,
    '<!-- 右侧 4 个原生魔兽资源槽（精确对齐 ResourceBar.fdf 4个凹槽：金币 / 木材 / 人口等级 / 地图版本） -->',
  ],
  ['title="DotA 地图版本与维修费状\uFFFD"', 'title="DotA 地图版本与维修费状态"'],
  ['<!-- 左上角实时动作指令浮动提\uFFFD?-->', '<!-- 左上角实时动作指令浮动提示 -->'],
  ['<!-- 右上角经\uFFFD?DotA 6.83d 计分板（Multiboard\uFFFD?-->', '<!-- 右上角经典 DotA 6.83d 计分板（Multiboard） -->'],
  ['<span>野\uFFFD?', '<span>野怪'],
  [
    /<!-- 顶部四联菜单弹窗（地图信\uFFFD\?F9 \/ 菜单 F10 \/ 盟友 F11 \/ 聊天 F12\uFFFD\?-->/,
    '<!-- 顶部四联菜单弹窗（地图信息 F9 / 菜单 F10 / 盟友 F11 / 聊天 F12） -->',
  ],
  [
    /@case \('quests'\) \{[^}]+\}/,
    "@case ('quests') { 地图信息与任务说明 (F9) }",
  ],
  [
    /@case \('menu'\) \{[^}]+\}/,
    "@case ('menu') { 魔兽争霸 III 游戏菜单 (F10) }",
  ],
  [
    /@case \('allies'\) \{[^}]+\}/,
    "@case ('allies') { 盟友与对局阵容 (F11) }",
  ],
  [
    /@case \('chat'\) \{[^}]+\}/,
    "@case ('chat') { 对局聊天与事件日志 (F12) }",
  ],
  ['关闭 \uFFFD?', '关闭 ×'],
  [
    /小地图[\uFFFD\u0080-\u00FF��友颜色��¦��式：]?/,
    null, // handled below
  ],
];

// Apply simple string/regex pairs (skip null)
for (const p of pairs) {
  if (!p || p[1] == null) continue;
  const [a, b] = p;
  if (typeof a === 'string') {
    if (s.includes(a)) s = s.split(a).join(b);
    else {
      // try with literal replacement char already in source
      const a2 = a.replace(/\\uFFFD/g, '\uFFFD');
      if (s.includes(a2)) s = s.split(a2).join(b);
    }
  } else {
    s = s.replace(a, b);
  }
}

// Ally color span — rewrite whole line fragment
s = s.replace(
  /<span>小地图[\s\S]{0,40}\{\{ mmAllyColorMode\(\) \? '阵营双色' : '玩家原色' \}\}<\/span>/,
  "<span>小地图盟友颜色模式：{{ mmAllyColorMode() ? '阵营双色' : '玩家原色' }}</span>"
);

// Middle-dot corruption Ã� / Ã‚· leftovers
s = s.replace(/Ã\uFFFD/g, '·');
s = s.replace(/ÃÂ·/g, '·');
s = s.replace(/Ã‚·/g, '·');

// More UI strings
const more = [
  ['加载 3D 地形与录像中\uFFFD?', '加载 3D 地形与录像中…'],
  [
    /<!-- 魔兽争霸3 底部控制\uFFFD\?HUD[\s\S]*?-->/,
    '<!-- 魔兽争霸3 底部控制台 HUD (1600x342，直接叠在 3D 视口底部，消除黑边) -->',
  ],
  [
    /<!-- 原版野怪营地[\s\S]*?-->/,
    '<!-- 原版野怪营地小地图图标（绿=小野 / 黄=中大野 / 红=远古与肉山，可通过右侧 1 个按钮开关） -->',
  ],
  [
    /<!-- 防御\uFFFD\?兵营\/遗迹\/商店标记[\s\S]*?-->/,
    '<!-- 防御塔/兵营/遗迹/商店标记（商店使用原版 mm-icon-shop.png，防御塔与兵营使用魔兽原生锐利小方块） -->',
  ],
  [
    '<!-- 实时兵线小兵与存活野怪点（还原魔\uFFFD?原生锐利像素小方块） -->',
    '<!-- 实时兵线小兵与存活野怪点（还原魔兽原生锐利像素小方块） -->',
  ],
  [
    '<!-- 英雄当前位置（魔兽原生英雄小地图图标 + 高亮光环\uFFFD?-->',
    '<!-- 英雄当前位置（魔兽原生英雄小地图图标 + 高亮光环） -->',
  ],
  ['<!-- 小地图信号波纹动\uFFFD?-->', '<!-- 小地图信号波纹动画 -->'],
  ['<!-- 当前镜头视野\uFFFD?-->', '<!-- 当前镜头视野框 -->'],
  ['alt="发信\uFFFD"', 'alt="发信号"'],
  ['title="切换显示小地图地\uFFFD?(Alt+T)"', 'title="切换显示小地图地形 (Alt+T)"'],
  ['title="显示/隐藏中立野怪营地标\uFFFD?(Alt+C)"', 'title="显示/隐藏中立野怪营地标记 (Alt+C)"'],
  ['alt="野怪营\uFFFD"', 'alt="野怪营地"'],
  [
    "[title]=\"formationOn() ? '队形移动：已开\uFFFD?(Alt+F)' : '队形移动：已关闭 (Alt+F)'\"",
    "[title]=\"formationOn() ? '队形移动：已开启 (Alt+F)' : '队形移动：已关闭 (Alt+F)'\"",
  ],
  ['alt="队形开\uFFFD"', 'alt="队形开关"'],
  [
    'title="点击聚焦英雄\uFFFD?D 实时动态英雄对白肖像）"',
    'title="点击聚焦英雄（3D 实时动态英雄对白肖像）"',
  ],
  [
    '<!-- 原生贴图经验条（仅显示等级文案；进度来自录像真实经验，无数据时为 0\uFFFD?-->',
    '<!-- 原生贴图经验条（仅显示等级文案；进度来自录像真实经验，无数据时为 0） -->',
  ],
  ['<!-- 攻击与护\uFFFD?-->', '<!-- 攻击与护甲 -->'],
  [
    /护甲 · 移\uFFFD\?\{\{ heroMoveSpeed\(\) \}\}/,
    '护甲 · 移速 {{ heroMoveSpeed() }}',
  ],
  [
    '<!-- 5. 6格物品栏（实时同\uFFFD?PUI/DRI、合成与臂章开关状态） -->',
    '<!-- 5. 6格物品栏（实时同步 PUI/DRI、合成与臂章开关状态） -->',
  ],
  [
    "'物品\uFFFD?(' + it.hotkey + ')'",
    "'物品栏(' + it.hotkey + ')'",
  ],
  ['<!-- 6. 12格命令与英雄技能面\uFFFD?-->', '<!-- 6. 12格命令与英雄技能面板 -->'],
  [
    /录像事[\s\S]{0,20}\(\{\{ recentEvents\(\)\.length \}\}\)/,
    '录像事件流 ({{ recentEvents().length }})',
  ],
  [
    /<p>场景建[\s\S]{0,40}\{\{ buildingCount\(\) \}\} · 兵线野[\s\S]{0,20}\{\{ simUnits\(\) \}\}<\/p>/,
    '<p>场景建筑/装饰 {{ buildingCount() }} · 兵线野怪 {{ simUnits() }}</p>',
  ],
  [
    /<p>当前序[\s\S]{0,20}\{\{ activeSequenceName\(\) \|\| '—' \}\}<\/p>/,
    "<p>当前序列 {{ activeSequenceName() || '—' }}</p>",
  ],

  // TS comments / strings
  [
    /\/\/ 获取底部控制\uFFFD\?3D 动态英雄肖像画布引\uFFFD\?/,
    '// 获取底部控制台 3D 动态英雄肖像画布引用',
  ],
  [
    /\/\/ 录像播放控制、顶部菜单弹窗、小地图侧边五按钮与实时英雄状态信\uFFFD\?/,
    '// 录像播放控制、顶部菜单弹窗、小地图侧边五按钮与实时英雄状态信息',
  ],
  ["name: '近卫中野\uFFFD?\uFFFD?'", "name: '近卫中野点'"],
  ["name: '近卫大野\uFFFD?\uFFFD?'", "name: '近卫大野点'"],
  ["name: '天灾中野\uFFFD?\uFFFD?'", "name: '天灾中野点'"],
  ["name: '天灾大野\uFFFD?\uFFFD?'", "name: '天灾大野点'"],
  // more specific camp names from HEAD
];

for (const [a, b] of more) {
  if (typeof a === 'string') {
    const a2 = a.replace(/\\uFFFD/g, '\uFFFD');
    if (s.includes(a2)) s = s.split(a2).join(b);
    else if (s.includes(a)) s = s.split(a).join(b);
  } else {
    s = s.replace(a, b);
  }
}

// Camp names — replace any remaining broken camp labels by id
const camps = [
  ['rad_med_1', '近卫中野点(东)'],
  ['rad_med_2', '近卫中野点(南)'],
  ['rad_large_1', '近卫大野点(东)'],
  ['rad_large_2', '近卫大野点(西)'],
  ['dire_med_1', '天灾中野点(西)'],
  ['dire_med_2', '天灾中野点(北)'],
  ['dire_large_1', '天灾大野点(西)'],
  ['dire_large_2', '天灾大野点(东)'],
];
for (const [id, name] of camps) {
  s = s.replace(
    new RegExp(`\\{ id: '${id}', name: '[^']*',`),
    `{ id: '${id}', name: '${name}',`
  );
}

const rest = [
  [/\/\/ 小地图河道神符实时状态信\uFFFD\?/, '// 小地图河道神符实时状态信息'],
  [/\/\*\* 英雄下拉（ZH_HERO_NAMES 顺序\uFFFD\?\*\//, '/** 英雄下拉（ZH_HERO_NAMES 顺序） */'],
  [
    /\/\*\* 当前选中英雄 key（unit code 小写）；手动选择后锁定不被录像覆\uFFFD\?\*\//,
    '/** 当前选中英雄 key（unit code 小写）；手动选择后锁定不被录像覆盖 */',
  ],
  [
    /\/\/ 基础命令用本地正确解码的 WC3 图标；属性附\uFFFD\?学习技能默认空槽，有等级或技能点时再显示/,
    '// 基础命令用本地正确解码的 WC3 图标；属性附加/学习技能默认空槽，有等级或技能点时再显示',
  ],
  [
    /\/\*\* 工具条自定义下拉（对齐语言选择：dropdown-blur \+ custom-scrollbar\uFFFD\?\*\//,
    '/** 工具条自定义下拉（对齐语言选择：dropdown-blur + custom-scrollbar） */',
  ],
  [
    /return `\$\{m\.heroName\} · \$\{m\.matchId\} \(\$\{this\.formatDuration\(m\.durationMs\)\} \/ \$\{m\.moveActions\}\uFFFD\?`;/,
    'return `${m.heroName} · ${m.matchId} (${this.formatDuration(m.durationMs)} / ${m.moveActions})`;',
  ],
  [
    /\/\*\* 兵线\/野\uFFFD\?神符始终运行，不再提供开\uFFFD\?\*\//,
    '/** 兵线/野怪/神符始终运行，不再提供开关 */',
  ],
  [/\/\/ 德鲁伊命令卡 \+ 1 技能召唤独立熊\uFFFD\?/, '// 德鲁伊命令卡 + 1 技能召唤独立熊灵'],
  [/\/\/ 已存在则仅刷新位置跟随，不换德鲁伊模\uFFFD\?/, '// 已存在则仅刷新位置跟随，不换德鲁伊模型'],
  [/\/\/ 同步渲染上下河道神符在小地图上的实时位置与颜\uFFFD\?/, '// 同步渲染上下河道神符在小地图上的实时位置与颜色'],
  [/name: `\$\{r\.spotName\}\uFFFD\?\{r\.nameCn\}`,/, 'name: `${r.spotName}·${r.nameCn}`,'],
  [
    /\/\/ 对齐原版 DotA 6\.83d 小地图，仅在 2 个神秘商店与 2 个边路商店显示中立商店图标，基地内部 10 \uFFFD\?NPC 商人不在小地图显示小房子/,
    '// 对齐原版 DotA 6.83d 小地图，仅在 2 个神秘商店与 2 个边路商店显示中立商店图标，基地内部 10 个 NPC 商人不在小地图显示小房子',
  ],
  [
    /\/\/ Vite CSR 回退\uFFFD\?index\.html 时不\uFFFD\?JSON，避免把录像列表\/技能冲成空/,
    '// Vite CSR 回退到 index.html 时不是 JSON，避免把录像列表/技能冲成空',
  ],
  [
    /console\.warn\('\[replay-3d\] API 未返\uFFFD\?JSON（可\uFFFD\?SSR\/Express 未启动）',/,
    "console.warn('[replay-3d] API 未返回 JSON（可能 SSR/Express 未启动）',",
  ],
  [
    /this\.matchLabel\.set\(`\$\{payload\.player\} · \$\{payload\.heroName\} · \$\{payload\.matchId\}`\);/,
    'this.matchLabel.set(`${payload.player} · ${payload.heroName} · ${payload.matchId}`);',
  ],
  [
    /\? `学习技[\s\S]{0,20}（剩余 \$\{state\.unspentSkillPoints\} 点）`/,
    '? `学习技能（剩余 ${state.unspentSkillPoints} 点）`',
  ],
  [
    /\/\/ basicCommand 已在 timeline\.sampleAt \uFFFD\?isMoving 收敛（到达后不再锁死「移动」）/,
    '// basicCommand 已在 timeline.sampleAt 与 isMoving 收敛（到达后不再锁死「移动」）',
  ],
  [
    /\/\/ 德鲁伊预设锁定命令卡（含独立 1 技能熊灵），不被录像技能覆\uFFFD\?/,
    '// 德鲁伊预设锁定命令卡（含独立 1 技能熊灵），不被录像技能覆盖',
  ],
  [/\/\*\* \uFFFD\?flex 布局给出真实宽高；已有尺寸则立刻返回 \*\//, '/** 等 flex 布局给出真实宽高；已有尺寸则立刻返回 */'],
  [
    /\/\/ 地形就绪即结\uFFFD\?loading 并开渲，不再[\s\S]{0,20}英\uFFFD\?兵线全部加载\uFFFD\?/,
    '// 地形就绪即结束 loading 并开渲，不再等英雄/兵线全部加载完',
  ],
  [/\/\/ 启动即加载先\uFFFD\?MalFurionNoStag，刷新即可验\uFFFD\?/, '// 启动即加载先知 MalFurionNoStag，刷新即可验证'],
  [/\/\/ 启动\uFFFD\?HUD 同步为先知（ZH \uFFFD\?20\uFFFD\?\)/, '// 启动时 HUD 同步为先知（ZH 序 20）'],
  [
    /\/\/ 仅号角后时钟驱动；无 GameStart \uFFFD\?gameT=0 绝不刷兵；有录像时墙钟恒\uFFFD\?0/,
    '// 仅号角后时钟驱动；无 GameStart 时 gameT=0 绝不刷兵；有录像时墙钟恒为 0',
  ],
  [
    /\/\/ 每帧\uFFFD\?3D 战场战斗单位血条与飘金跳字投影至视口屏幕，并同步金钱统\uFFFD\?/,
    '// 每帧将 3D 战场战斗单位血条与飘金跳字投影至视口屏幕，并同步金钱统计',
  ],
];

for (const [a, b] of rest) {
  if (typeof a === 'string') {
    const a2 = a.replace(/\\uFFFD/g, '\uFFFD');
    if (s.includes(a2)) s = s.split(a2).join(b);
  } else {
    const beforeN = (s.match(/\uFFFD/g) || []).length;
    s = s.replace(a, b);
    const afterN = (s.match(/\uFFFD/g) || []).length;
    if (afterN === beforeN && a.toString().includes('FFFD')) {
      // try without escaping issues - already unicode in regex via \uFFFD
    }
  }
}

// Aggressive: any remaining "字\uFFFD?" patterns for common suffixes
const suffixFixes = [
  [/说\uFFFD\?/g, '说明'],
  [/记\uFFFD\?/g, '记录'],
  [/状\uFFFD/g, '状态'],
  [/提\uFFFD\?/g, '提示'],
  [/信\uFFFD\?/g, '信息'],
  [/经\uFFFD\?/g, '经典'],
  [/动\uFFFD\?/g, '动画'],
  [/野\uFFFD\?/g, '野怪'],
  [/地\uFFFD\?/g, '地形'],
  [/标\uFFFD\?/g, '标记'],
  [/营\uFFFD/g, '营地'],
  [/开\uFFFD\?/g, '开启'],
  [/开\uFFFD/g, '开关'],
  [/护\uFFFD\?/g, '护甲'],
  [/同\uFFFD\?/g, '同步'],
  [/面\uFFFD\?/g, '面板'],
  [/移\uFFFD\?/g, '移速'],
  [/覆\uFFFD\?/g, '覆盖'],
  [/模\uFFFD\?/g, '模型'],
  [/颜\uFFFD\?/g, '颜色'],
  [/引\uFFFD\?/g, '引用'],
  [/验\uFFFD\?/g, '验证'],
  [/统\uFFFD\?/g, '统计'],
  [/中\uFFFD\?/g, '中…'],
  [/过\uFFFD\?/g, '过近'],
  [/居\uFFFD\?/g, '居中'],
  [/变量\uFFFD\?/g, '变量）'],
  [/版本\uFFFD\?/g, '版本）'],
  [/光环\uFFFD\?/g, '光环）'],
  [/为 0\uFFFD\?/g, '为 0）'],
  [/发信\uFFFD/g, '发信号'],
];
for (const [a, b] of suffixFixes) s = s.replace(a, b);

fs.writeFileSync(path, s, 'utf8');

const after = (fs.readFileSync(path, 'utf8').match(/\uFFFD/g) || []).length;
const lines = fs.readFileSync(path, 'utf8').split(/\n/);
const left = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('\uFFFD')) left.push((i + 1) + ':' + lines[i].trim().slice(0, 140));
}
console.log({ before, after, leftLines: left.length });
left.forEach((x) => console.log(x));
