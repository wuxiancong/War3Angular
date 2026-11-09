const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '../src/app/core/i18n/locales');
const map = {
  zh_CN: '观看录像',
  zh_TW: '觀看錄像',
  en: 'REPLAY',
  ja: 'リプレイ',
  ko: '리플레이',
  ru: 'ПОВТОР',
  de: 'REPLAY',
  fr: 'REPLAY',
  es: 'REPLAY',
  it: 'REPLAY',
  pt: 'REPLAY',
  pl: 'REPLAY',
  tr: 'REPLAY',
  uk: 'REPLAY',
  ar: 'REPLAY',
  bg: 'REPLAY',
  ca: 'REPLAY',
  cs: 'REPLAY',
  da: 'REPLAY',
  fi: 'REPLAY',
  gd: 'REPLAY',
  he: 'REPLAY',
  hu: 'REPLAY',
  lv: 'REPLAY',
  sk: 'REPLAY',
};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
  const loc = f.replace(/\.ts$/, '');
  const p = path.join(dir, f);
  let s = fs.readFileSync(p, 'utf8');
  if (/\breplay\s*:/.test(s)) {
    console.log('skip', loc);
    continue;
  }
  const label = map[loc] || 'REPLAY';
  const next = s.replace(/(matches:\s*"[^"]+",)\s*(ladder:)/, `$1 replay: "${label}", $2`);
  if (next === s) {
    console.log('FAIL', loc);
    continue;
  }
  fs.writeFileSync(p, next);
  console.log('ok', loc, label);
}
