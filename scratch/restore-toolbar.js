const fs = require('fs');
const path = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(path, 'utf8');

const expanded = `
      } @else {
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
          </button>
          <span class="hidden md:inline text-accent font-black italic uppercase tracking-tight shrink-0">
            DotA 6.83d 3D 录像回放
          </span>
          <span class="md:hidden text-accent font-black italic shrink-0">3D 回放</span>
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

        <!-- 第2行：播放 + 进度 + 倍速 -->
        <div class="flex items-center gap-2 min-w-0 w-full">
          <button
            type="button"
            (click)="togglePlay()"
            class="px-2.5 py-1 rounded font-bold border border-amber-400/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 shrink-0"
          >
            {{ isPlaying() ? '暂停' : '播放' }}
          </button>
          <span class="font-mono text-[10px] text-amber-300 w-11 sm:w-12 shrink-0 text-right tabular-nums">{{ currentTimeText() }}</span>
          <input
            type="range"
            min="0"
            [max]="durationMs()"
            [value]="currentMs()"
            (input)="onScrub(+$any($event.target).value)"
            class="flex-1 min-w-0 accent-amber-400 cursor-pointer h-1.5"
          />
          <span class="font-mono text-[10px] text-white/60 w-11 sm:w-12 shrink-0 tabular-nums">{{ totalTimeText() }}</span>
          <div class="rt-dd rt-dd-sm" data-rt-dd="speed">
            <button
              type="button"
              class="rt-dd-trigger"
              [class.open]="toolbarMenu() === 'speed'"
              (click)="toggleToolbarMenu('speed')"
              title="播放倍速"
            >
              <span class="rt-dd-label font-mono">{{ playSpeed() }}x</span>
              <span class="material-icons text-[14px] opacity-50 transition-transform" [class.rotate-180]="toolbarMenu() === 'speed'">expand_more</span>
            </button>
            @if (toolbarMenu() === 'speed') {
              <div class="rt-dd-panel">
                @for (spd of playSpeedOptions; track spd) {
                  <button
                    type="button"
                    class="rt-dd-item font-mono"
                    [class.active]="playSpeed() === spd"
                    (click)="pickPlaySpeed(spd)"
                  >
                    <span>{{ spd }}x</span>
                    @if (playSpeed() === spd) {
                      <span class="material-icons text-accent text-sm ml-auto">check</span>
                    }
                  </button>
                }
              </div>
            }
          </div>
        </div>

        <!-- 第3行：跳转 / 镜头 / 血条 / 英雄 / 调试 -->
        <div class="flex flex-wrap items-center gap-1.5">
          <div class="rt-dd rt-dd-md" data-rt-dd="jump">
            <button
              type="button"
              class="rt-dd-trigger"
              [class.open]="toolbarMenu() === 'jump'"
              (click)="toggleToolbarMenu('jump')"
              title="跳转商店 / 神符 / 肉山"
            >
              <span class="rt-dd-label">{{ jumpMenuLabel() }}</span>
              <span class="material-icons text-[14px] opacity-50 transition-transform" [class.rotate-180]="toolbarMenu() === 'jump'">expand_more</span>
            </button>
            @if (toolbarMenu() === 'jump') {
              <div class="rt-dd-panel">
                @for (opt of jumpMenuOptions; track opt.value) {
                  <button
                    type="button"
                    class="rt-dd-item"
                    [class.active]="jumpTargetKey() === opt.value"
                    (click)="pickJumpTarget(opt.value)"
                  >
                    <span>{{ opt.label }}</span>
                    @if (jumpTargetKey() === opt.value) {
                      <span class="material-icons text-accent text-sm ml-auto">check</span>
                    }
                  </button>
                }
              </div>
            }
          </div>

          <div class="rt-dd rt-dd-md" data-rt-dd="camera">
            <button
              type="button"
              class="rt-dd-trigger"
              [class.open]="toolbarMenu() === 'camera'"
              (click)="toggleToolbarMenu('camera')"
              title="镜头模式"
            >
              <span class="rt-dd-label">{{ cameraMenuLabel() }}</span>
              <span class="material-icons text-[14px] opacity-50 transition-transform" [class.rotate-180]="toolbarMenu() === 'camera'">expand_more</span>
            </button>
            @if (toolbarMenu() === 'camera') {
              <div class="rt-dd-panel">
                @for (opt of cameraMenuOptions; track opt.value) {
                  <button
                    type="button"
                    class="rt-dd-item"
                    [class.active]="cameraMode() === opt.value"
                    (click)="pickCameraMode(opt.value)"
                  >
                    <span>{{ opt.label }}</span>
                    @if (cameraMode() === opt.value) {
                      <span class="material-icons text-accent text-sm ml-auto">check</span>
                    }
                  </button>
                }
              </div>
            }
          </div>

          <button
            type="button"
            (click)="toggleHealthBars()"
            class="px-2 py-1 border rounded shrink-0"
            [ngClass]="showHealthBars() ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 font-bold' : 'border-white/20 text-white/50'"
            title="开关 3D 战场头顶生命值血条"
          >
            血条{{ showHealthBars() ? '开' : '关' }}
          </button>

          <div class="rt-dd rt-dd-lg" data-rt-dd="hero">
            <button
              type="button"
              class="rt-dd-trigger"
              [class.open]="toolbarMenu() === 'hero'"
              (click)="toggleToolbarMenu('hero')"
              title="切换英雄 3D 模型"
            >
              <span class="rt-dd-label">{{ heroMenuLabel() }}</span>
              <span class="material-icons text-[14px] opacity-50 transition-transform" [class.rotate-180]="toolbarMenu() === 'hero'">expand_more</span>
            </button>
            @if (toolbarMenu() === 'hero') {
              <div class="rt-dd-panel wide">
                @for (h of heroRoster; track h.key) {
                  <button
                    type="button"
                    class="rt-dd-item"
                    [class.active]="currentHeroKey() === h.key"
                    (click)="pickHeroPreset(h.key)"
                  >
                    <span class="truncate">{{ h.index }}. {{ h.nameZh }}</span>
                    @if (currentHeroKey() === h.key) {
                      <span class="material-icons text-accent text-sm ml-auto shrink-0">check</span>
                    }
                  </button>
                }
              </div>
            }
          </div>

          <button type="button" (click)="showDebug.set(!showDebug())" class="px-2 py-1 border border-white/20 rounded shrink-0">
            {{ showDebug() ? '隐藏调试' : '事件流' }}
          </button>
        </div>
      </div>

      }
`;

const re = /\} @else \{[\s\S]*?\n\s*\}\n\s*\n\s*<div class="flex flex-col lg:flex-row flex-grow min-h-0">/;
if (!re.test(s)) {
  console.error('else block not found');
  const i = s.indexOf('} @else {');
  console.log(JSON.stringify(s.slice(i, i + 400)));
  process.exit(1);
}

s = s.replace(re, expanded.trimStart() + '\n\n      <div class="flex flex-col lg:flex-row flex-grow min-h-0">');

// Fix collapsed-branch titles that may still be latin1-displayed incorrectly in some editors:
// rewrite collapsed match menu title/button labels we control
s = s.replace(
  /@if \(toolbarCollapsed\(\)\) \{[\s\S]*?\} @else \{/,
  (block) => {
    // ensure clean Chinese in collapsed branch via explicit replacements
    return block
      .replace(/title="[^"]*工具栏"/, 'title="显示工具栏"')
      .replace(/title="切换录像文件"/, 'title="切换录像文件"')
      .replace(/>\s*显示\s*</, '>显示<')
      .replace(/\{\{ m\.heroName \}\}[^<{]*\{\{ m\.matchId \}\}/, '{{ m.heroName }} · {{ m.matchId }}');
  }
);

// Fix remaining broken TS string labels if still mojibake
const labelFixes = [
  [/readonly matchLabel = signal\('([^']*)'\);/, "readonly matchLabel = signal('加载中');"],
  [/readonly heroNameCn = signal\('([^']*)'\);/, "readonly heroNameCn = signal('芙莉莲');"],
  [/readonly basicCommandLabel = signal\('([^']*)'\);/, "readonly basicCommandLabel = signal('无');"],
];
for (const [reFix, rep] of labelFixes) {
  if (reFix.test(s)) s = s.replace(reFix, rep);
}

// jump/camera menu options — rewrite whole arrays if present
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

// Fallback labels in methods
fs.writeFileSync(path, s, 'utf8');

const out = fs.readFileSync(path, 'utf8');
console.log('隐藏', out.includes('隐藏'));
console.log('显示', out.includes('显示'));
console.log('播放', out.includes('播放'));
console.log('血条', out.includes('血条'));
console.log('expanded rows', (out.match(/第[123]行/g) || []).length);
console.log('else empty?', /@else \{\s*<div class="replay-toolbar[\s\S]{0,200}<div class="flex items-center gap-2 min-w-0">\s*<\/div>/.test(out));
console.log('file has 返回 link?', /routerLink="\/matches"/.test(out));
