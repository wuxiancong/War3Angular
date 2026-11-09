const fs = require('fs');
const p = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(p, 'utf8');

/** Exact substring replacements: broken → fixed (UTF-8) */
const pairs = [
  // signals / returns
  ["readonly matchLabel = signal('Ã¥ÂÂ Ã¨Â½Â½Ã¤Â¸Â­Ã¢Â?);", "readonly matchLabel = signal('加载中');"],
  ["readonly heroNameCn = signal('Ã¨ÂÂÃ¨ÂÂÃ¦Â?);", "readonly heroNameCn = signal('芙莉莲');"],
  ["readonly basicCommandLabel = signal('Ã¦Â?);", "readonly basicCommandLabel = signal('无');"],
  ["if (!m) return file || 'Ã©ÂÂÃ¦ÂÂ©Ã¥Â½ÂÃ¥ÂÂÃ¢Â?;", "if (!m) return file || '选择录像…';"],
  ["?.label || 'Ã©ÂÂÃ¥Â¤Â´Ã¨Â·Â³Ã¨Â½Â¬Ã¢Â?;", "?.label || '镜头跳转';"],
  [": 'Ã©ÂÂÃ¦ÂÂ©Ã¨ÂÂ±Ã©ÂÂÃ¢Â?;", ": '选择英雄…';"],
  ["this.basicCommandLabel.set(cmdLabels[cmd] || 'Ã¦Â?);", "this.basicCommandLabel.set(cmdLabels[cmd] || '无');"],
  ["this.error.set('Ã¨Â§ÂÃ¥ÂÂ£Ã¦ÂÂªÃ¥Â°Â±Ã§Â»?);", "this.error.set('视口未就绪');"],

  // camps
  ["name: 'Ã¨Â¿ÂÃ¥ÂÂ«Ã¥Â°ÂÃ©ÂÂÃ§Â?,", "name: '近卫小野怪',"],
  ["name: 'Ã¨Â¿ÂÃ¥ÂÂ«Ã¨Â¿ÂÃ¥ÂÂ¤Ã©Â?,", "name: '近卫远古怪',"],
  ["name: 'Ã¥Â¤Â©Ã§ÂÂ¾Ã¥Â°ÂÃ©ÂÂÃ§Â?,", "name: '天灾小野怪',"],
  ["name: 'Ã¥Â¤Â©Ã§ÂÂ¾Ã¨Â¿ÂÃ¥ÂÂ¤Ã©Â?,", "name: '天灾远古怪',"],

  // commands / skills (appear multiple times)
  ["name: 'Ã¥Â·Â¡Ã©Â?,", "name: '巡逻',"],
  ["patrol: 'Ã¥Â·Â¡Ã©Â?,", "patrol: '巡逻',"],
  ["name: 'Ã¥Â­Â¦Ã¤Â¹Â Ã¦ÂÂÃ¨Â?,", "name: '学习技能',"],
  [": 'Ã¥Â­Â¦Ã¤Â¹Â Ã¦ÂÂÃ¨Â?,", ": '学习技能',"],
  ["name: 'Ã¦ÂÂ Ã¦ÂÂÃ¦Â?,", "name: '无敌斩',"],
  ["name: 'Ã§ÂÂÃ¥Â®ÂÃ¥Â½Â¢Ã¦Â?,", "name: '真实形态',"],
  ["name: 'Ã¥Â±ÂÃ¦ÂÂ§Ã©ÂÂÃ¥Â?,", "name: '属性附加',"],

  // template ternaries
  ["showHealthBars() ? 'Ã¥Â¼Â' : 'Ã¥Â? }}", "showHealthBars() ? '开' : '关' }}"],
  ["showDebug() ? 'Ã©ÂÂÃ¨ÂÂÃ¨Â°ÂÃ¨Â¯Â' : 'Ã¤ÂºÂÃ¤Â»Â¶Ã¦Âµ? }}", "showDebug() ? '隐藏调试' : '事件流' }}"],
  ["activeSequenceName() || 'Ã¢Â? }}", "activeSequenceName() || '—' }}"],
];

let n = 0;
for (const [a, b] of pairs) {
  if (!s.includes(a)) {
    // try replace_all style soft match for multi-occurrence pieces
    const soft = a;
    if (!s.includes(soft)) {
      console.log('MISS', JSON.stringify(a).slice(0, 80));
      continue;
    }
  }
  const before = s;
  // global replace for repeated fragments
  s = s.split(a).join(b);
  if (s !== before) {
    n++;
    console.log('OK', b.slice(0, 40));
  }
}

fs.writeFileSync(p, s);
console.log('pairs applied', n);

// Rescan odd quotes outside HTML-ish lines
const lines = s.split(/\n/);
const odd = [];
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  const t = L.trim();
  if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('<!--')) continue;
  if (L.includes('class=') || L.includes('</') || L.includes('routerLink') || L.includes('style=')) continue;
  const code = L.split('//')[0];
  if ((code.match(/'/g) || []).length % 2 === 1) odd.push((i + 1) + ': ' + t.slice(0, 140));
}
console.log('remaining odd:', odd.length);
odd.forEach((x) => console.log(x));
