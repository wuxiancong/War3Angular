const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '../src/app/core/i18n/locales');
const labels = {
  zh_CN: '观看录像',
  zh_TW: '觀看錄像',
  en: 'REPLAY',
  ja: 'リプレイ',
  ko: '리플레이',
  ru: 'ПОВТОР',
};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
  const loc = f.replace(/\.ts$/, '');
  const p = path.join(dir, f);
  let s = fs.readFileSync(p, 'utf8');
  // only touch nav block: insert after matches: in nav section
  if (/nav:\s*\{[\s\S]*?\breplay\s*:/.test(s)) {
    console.log('nav.replay exists', loc);
    continue;
  }
  const label = labels[loc] || 'REPLAY';
  const next = s.replace(
    /(nav:\s*\{[\s\S]*?matches:\s*"[^"]+",)/,
    `$1\n        replay: "${label}",`
  );
  if (next === s) {
    console.log('FAIL', loc);
    continue;
  }
  fs.writeFileSync(p, next);
  console.log('added nav.replay', loc, label);
}
