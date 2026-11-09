const fs = require('fs');
const path = 'src/app/pages/replay-3d.component.ts';

// One more latin1→utf8 pass on whole file
let s = fs.readFileSync(path, 'utf8');
const once = Buffer.from(s, 'latin1').toString('utf8');
const cjkBefore = (s.match(/[\u4e00-\u9fff]/g) || []).length;
const cjkAfter = (once.match(/[\u4e00-\u9fff]/g) || []).length;
console.log({ cjkBefore, cjkAfter, fffd: (once.match(/\uFFFD/g) || []).length });
if (cjkAfter > cjkBefore) s = once;

// Explicit toolbar UI strings via unicode escapes (immune to editor encoding)
const U = (codes) => String.fromCharCode(...codes);

const labels = {
  showToolbar: '显示工具栏',
  show: '显示',
  hideToolbar: '隐藏工具栏',
  hide: '隐藏',
  switchReplay: '切换录像文件',
  replayTitle: 'DotA 6.83d 3D 录像回放',
  replayShort: '3D 回放',
  pause: '暂停',
  play: '播放',
  speed: '播放倍速',
  jumpTitle: '跳转商店 / 神符 / 肉山',
  camTitle: '镜头模式',
  hpTitle: '开关 3D 战场头顶生命值血条',
  hp: '血条',
  on: '开',
  off: '关',
  heroTitle: '切换英雄 3D 模型',
  hideDebug: '隐藏调试',
  events: '事件流',
};

// Normalize collapsed + expanded toolbar titles/buttons
s = s.replace(
  /\(click\)="setToolbarCollapsed\(false\)"\s+title="[^"]*"/,
  `(click)="setToolbarCollapsed(false)"\n            title="${labels.showToolbar}"`
);
s = s.replace(
  /visibility<\/span>[^<]*<\/button>/,
  `visibility</span>\n            ${labels.show}</button>`
);
s = s.replace(
  /\(click\)="setToolbarCollapsed\(true\)"\s+title="[^"]*"/,
  `(click)="setToolbarCollapsed(true)"\n            title="${labels.hideToolbar}"`
);
s = s.replace(
  /visibility_off<\/span>\s*[^<\n]*\n\s*<\/button>/,
  `visibility_off</span>\n            ${labels.hide}\n          </button>`
);

// Titles on match triggers
s = s.replace(/title="[^"]*"(\s+>\s*\n\s*<span class="rt-dd-label">\{\{ matchMenuLabel\(\)\}\})/g,
  `title="${labels.switchReplay}"$1`);
// simpler: all match dropdown titles near data-rt-dd="match"
s = s.replace(
  /(data-rt-dd="match">[\s\S]*?title=")[^"]*(")/g,
  `$1${labels.switchReplay}$2`
);

s = s.replace(/DotA 6\.83d 3D [^\n<]*/, labels.replayTitle);
s = s.replace(/>3D [^\n<]*回放</, `>${labels.replayShort}<`);
s = s.replace(/>3D [^\n<]*</, (m) => (m.includes('回放') || /3D /.test(m) ? `>${labels.replayShort}<` : m));

// Play button ternary
s = s.replace(
  /\{\{\s*isPlaying\(\)\s*\?\s*'[^']*'\s*:\s*'[^']*'\s*\}\}/g,
  `{{ isPlaying() ? '${labels.pause}' : '${labels.play}' }}`
);

s = s.replace(/title="[^"]*倍速"/, `title="${labels.speed}"`);
s = s.replace(/title="[^"]*跳转[^"]*"/, `title="${labels.jumpTitle}"`);
s = s.replace(/title="[^"]*镜头模式"/, `title="${labels.camTitle}"`);
s = s.replace(/title="[^"]*血条[^"]*"/, `title="${labels.hpTitle}"`);
s = s.replace(/title="[^"]*英雄[^"]*模型[^"]*"/, `title="${labels.heroTitle}"`);

s = s.replace(
  /血条\{\{\s*showHealthBars\(\)\s*\?\s*'[^']*'\s*:\s*'[^']*'\s*\}\}/,
  `${labels.hp}{{ showHealthBars() ? '${labels.on}' : '${labels.off}' }}`
);
s = s.replace(
  /\{\{\s*showDebug\(\)\s*\?\s*'[^']*'\s*:\s*'[^']*'\s*\}\}/,
  `{{ showDebug() ? '${labels.hideDebug}' : '${labels.events}' }}`
);

// jump/camera options
s = s.replace(
  /readonly jumpMenuOptions: \{ value: string; label: string \}\[\] = \[[\s\S]*?\];/,
  `readonly jumpMenuOptions: { value: string; label: string }[] = [
    { value: '', label: '镜头跳转' },
    { value: 'radiant_shop', label: '近卫商店' },
    { value: 'dire_shop', label: '天灾商店' },
    { value: 'side_top', label: '上路边路商店' },
    { value: 'side_bot', label: '下路边路商店' },
    { value: 'secret_radiant', label: '近卫神秘商店' },
    { value: 'secret_dire', label: '天灾神秘商店' },
    { value: 'rune_top', label: '上河神符' },
    { value: 'rune_bot', label: '下河神符' },
    { value: 'roshan', label: '肉山' },
  ];`
);
s = s.replace(
  /readonly cameraMenuOptions: \{ value: 'hero' \| 'free' \| 'map'; label: string \}\[\] = \[[\s\S]*?\];/,
  `readonly cameraMenuOptions: { value: 'hero' | 'free' | 'map'; label: string }[] = [
    { value: 'hero', label: '跟随英雄' },
    { value: 'free', label: '自由镜头' },
    { value: 'map', label: '全图俯视' },
  ];`
);

fs.writeFileSync(path, s, 'utf8');

const out = fs.readFileSync(path, 'utf8');
console.log({
  hide: out.includes('隐藏工具栏'),
  show: out.includes('显示工具栏'),
  play: out.includes('播放'),
  cjk: (out.match(/[\u4e00-\u9fff]/g) || []).length,
  // verify bytes of 隐藏
  hideBytes: out.includes('隐藏') && Buffer.from('隐藏', 'utf8').equals(
    (() => {
      const i = out.indexOf('隐藏');
      return Buffer.from(out.slice(i, i + 2), 'utf8');
    })()
  ),
});
