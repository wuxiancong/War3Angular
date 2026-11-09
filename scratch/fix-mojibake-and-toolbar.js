const fs = require('fs');
const path = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(path, 'utf8');

/** Decode classic UTF-8→Latin1→UTF-8 mojibake. Safe on already-correct CJK. */
function looksMojibake(str) {
  return /Ã.|Â.|å.|æ.|ç.|è.|é.|ä.|å.|ï¿½/.test(str) || /[\u00C0-\u00FF]{2,}/.test(str);
}

function decodeOnce(str) {
  try {
    const out = Buffer.from(str, 'latin1').toString('utf8');
    if (out.includes('\uFFFD') && (out.match(/\uFFFD/g) || []).length > 2) return str;
    return out;
  } catch {
    return str;
  }
}

function decodeMojibake(str) {
  let cur = str;
  for (let i = 0; i < 3; i++) {
    if (!looksMojibake(cur)) break;
    const next = decodeOnce(cur);
    if (next === cur) break;
    // Prefer result with more CJK / fewer mojibake markers
    const score = (t) =>
      ((t.match(/[\u4e00-\u9fff]/g) || []).length) * 3 -
      ((t.match(/Ã.|Â./g) || []).length);
    if (score(next) >= score(cur)) cur = next;
    else break;
  }
  return cur;
}

// Decode string/template literal contents and HTML text nodes carefully:
// 1) Single-quoted TS/HTML attribute string bodies
s = s.replace(/'([^'\\]|\\.)*'/g, (m) => {
  const inner = m.slice(1, -1);
  if (!looksMojibake(inner)) return m;
  const fixed = decodeMojibake(inner);
  return `'${fixed.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
});

// 2) Double-quoted attribute bodies
s = s.replace(/"([^"\\]|\\.)*"/g, (m) => {
  // skip pure ascii / URLs / class names without mojibake
  const inner = m.slice(1, -1);
  if (!looksMojibake(inner)) return m;
  const fixed = decodeMojibake(inner);
  return `"${fixed.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
});

// 3) HTML text between tags that is mojibake (not Angular bindings alone)
s = s.replace(/>([^<{}]+)</g, (m, text) => {
  if (!looksMojibake(text)) return m;
  return '>' + decodeMojibake(text) + '<';
});

// 4) Comments
s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => (looksMojibake(m) ? decodeMojibake(m) : m));
s = s.replace(/\/\/[^\n]*/g, (m) => (looksMojibake(m) ? decodeMojibake(m) : m));
s = s.replace(/<!--[\s\S]*?-->/g, (m) => (looksMojibake(m) ? decodeMojibake(m) : m));

// --- Toolbar UX: 返回 → 隐藏/显示；隐藏时只保留录像 ComboBox ---

const collapsedBlock = `      @if (toolbarCollapsed()) {
        <div class="replay-toolbar sticky z-30 shrink-0 text-[11px] px-2 sm:px-3 py-2 flex items-center gap-2">
          <button
            type="button"
            class="rt-collapse-btn shrink-0"
            (click)="setToolbarCollapsed(false)"
            title="显示工具栏"
          >
            <span class="material-icons text-[16px]">visibility</span>
            显示
          </button>
          <div class="rt-dd rt-dd-fill" data-rt-dd="match">
            <button
              type="button"
              class="rt-dd-trigger"
              [class.open]="toolbarMenu() === 'match'"
              (click)="toggleToolbarMenu('match')"
              title="切换录像文件"
            >
              <span class="rt-dd-label">{{ matchMenuLabel() }}</span>
              <span class="material-icons text-[14px] opacity-50 transition-transform" [class.rotate-180]="toolbarMenu() === 'match'">expand_more</span>
            </button>
            @if (toolbarMenu() === 'match') {
              <div class="rt-dd-panel wide">
                @for (m of matchList(); track m.fileName) {
                  <button
                    type="button"
                    class="rt-dd-item"
                    [class.active]="selectedFile() === m.fileName"
                    (click)="pickMatchFile(m.fileName)"
                  >
                    <span class="truncate">{{ m.heroName }} · {{ m.matchId }} ({{ formatDuration(m.durationMs) }} / {{ m.moveActions }})</span>
                    @if (selectedFile() === m.fileName) {
                      <span class="material-icons text-accent text-sm ml-auto shrink-0">check</span>
                    }
                  </button>
                }
              </div>
            }
          </div>
        </div>
      } @else {`;

// Replace from @if (toolbarCollapsed()) through the first toolbar row's back-link opening,
// by matching the whole collapsed + else start through first row back button.
const toolbarStartRe =
  /@if \(toolbarCollapsed\(\)\) \{[\s\S]*?\} @else \{\s*<!--[\s\S]*?-->\s*<div class="replay-toolbar sticky z-30 shrink-0 text-\[11px\] px-2 sm:px-3 py-2 flex flex-col gap-1\.5">\s*<!--[\s\S]*?-->\s*<div class="flex items-center gap-2 min-w-0">\s*<a routerLink="\/matches"[\s\S]*?<\/a>/;

if (!toolbarStartRe.test(s)) {
  console.error('toolbarStartRe NOT matched');
  // dump nearby for debug
  const i = s.indexOf('@if (toolbarCollapsed())');
  console.log(JSON.stringify(s.slice(i, i + 500)));
  process.exit(1);
}

s = s.replace(
  toolbarStartRe,
  `${collapsedBlock}
      <!-- 响应式工具栏 -->
      <div class="replay-toolbar sticky z-30 shrink-0 text-[11px] px-2 sm:px-3 py-2 flex flex-col gap-1.5">
        <!-- 第1行：隐藏 + 标题 + 录像 -->
        <div class="flex items-center gap-2 min-w-0">
          <button
            type="button"
            class="rt-collapse-btn shrink-0"
            (click)="setToolbarCollapsed(true)"
            title="隐藏工具栏"
          >
            <span class="material-icons text-[16px]">visibility_off</span>
            隐藏
          </button>`
);

// Remove trailing 收起 button near end of toolbar row 3
s = s.replace(
  /\s*<button\s+type="button"\s+class="rt-collapse-btn shrink-0"\s+\(click\)="setToolbarCollapsed\(true\)"[\s\S]*?<\/button>\s*<\/div>\s*<\/div>\s*\n\s*\}/,
  `
        </div>
      </div>

      }`
);

// Clean obsolete collapsed-bar CSS if present (keep rt-collapse-btn styles)
s = s.replace(
  /\.replay-toolbar-collapsed-bar \{[\s\S]*?\}\s*\.replay-toolbar-collapsed-bar > button,\s*/g,
  ''
);

fs.writeFileSync(path, s);

const out = fs.readFileSync(path, 'utf8');
console.log('返回', out.includes('返回'));
console.log('隐藏', out.includes('隐藏'));
console.log('显示', out.includes('显示'));
console.log('收起 btn left?', /setToolbarCollapsed\(true\)[\s\S]{0,80}收起/.test(out));
console.log('mojibake Ã count', (out.match(/Ã/g) || []).length);
console.log('CJK sample 近卫', out.includes('近卫'));
console.log('toolbarCollapsed branches', (out.match(/toolbarCollapsed\(\)/g) || []).length);
