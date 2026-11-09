const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/app/pages/replay-3d.component.ts');
let src = fs.readFileSync(file, 'utf8');

// 1) Ensure CSS for collapsed bar exists
if (!src.includes('.replay-toolbar-collapsed-bar')) {
  src = src.replace(
    `.replay-toolbar {
        background: #080c12;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);`,
    `.replay-toolbar {
        background: #080c12;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);`
  );
  // insert after margin-top: 0; of replay-toolbar block
  src = src.replace(
    /(?<=\.replay-toolbar \{[\s\S]*?margin-top: 0;\n\s*\}\n)/,
    `      .replay-toolbar-collapsed-bar {
        position: sticky;
        top: var(--app-header-height, 4.5rem);
        z-index: 30;
        display: flex;
        justify-content: flex-end;
        padding: 0.25rem 0.5rem;
        background: transparent;
        pointer-events: none;
      }
      .replay-toolbar-collapsed-bar > button,
      .replay-toolbar .rt-collapse-btn {
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
        padding: 0.25rem 0.55rem;
        border-radius: 0.4rem;
        border: 1px solid rgba(212, 175, 55, 0.4);
        background: rgba(12, 16, 24, 0.92);
        color: #f0e0b0;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      }
      .replay-toolbar-collapsed-bar > button:hover,
      .replay-toolbar .rt-collapse-btn:hover {
        border-color: rgba(240, 192, 96, 0.75);
        color: #e0b84a;
      }
`
  );
  console.log('css inserted');
} else {
  console.log('css ok');
}

// 2) Fix collapsed expand button text (ASCII-safe rewrite of that block)
src = src.replace(
  /@if \(toolbarCollapsed\(\)\) \{[\s\S]*?\} @else \{/,
  `@if (toolbarCollapsed()) {
        <div class="replay-toolbar-collapsed-bar">
          <button type="button" class="rt-collapse-btn" (click)="setToolbarCollapsed(false)" title="Expand toolbar">
            <span class="material-icons text-[16px]">unfold_more</span>
            Expand
          </button>
        </div>
      } @else {`
);

// 3) Add collapse button + close @else before main content flex
if (!src.includes('setToolbarCollapsed(true)')) {
  const marker = `\n      <div class="flex flex-col lg:flex-row flex-grow min-h-0">`;
  const idx = src.indexOf(marker);
  if (idx < 0) throw new Error('main content marker not found');
  // find the toolbar closing just before marker: last "      </div>\n\n" before marker that closes toolbar
  const before = src.slice(0, idx);
  // Replace the showDebug button area near end of toolbar - use unique ASCII
  if (!before.includes('setToolbarCollapsed(true)')) {
    // Insert before the closing of toolbar's last row - look for showDebug button
    const dbg = before.lastIndexOf('(click)="showDebug.set(!showDebug())"');
    if (dbg < 0) throw new Error('showDebug button not found');
    // find the </button> after it
    const btnEnd = before.indexOf('</button>', dbg);
    if (btnEnd < 0) throw new Error('showDebug end not found');
    const insertAt = btnEnd + '</button>'.length;
    const collapseBtn = `
          <button
            type="button"
            class="rt-collapse-btn shrink-0"
            (click)="setToolbarCollapsed(true)"
            title="Collapse toolbar"
          >
            <span class="material-icons text-[16px]">unfold_less</span>
            Collapse
          </button>`;
    src = before.slice(0, insertAt) + collapseBtn + before.slice(insertAt) + src.slice(idx);
    console.log('collapse button inserted');
  }
}

// 4) Close @else before main content if missing
{
  const marker = `\n      <div class="flex flex-col lg:flex-row flex-grow min-h-0">`;
  const idx = src.indexOf(marker);
  const before = src.slice(Math.max(0, idx - 80), idx);
  if (!/}\s*$/.test(before.trimEnd()) && !before.includes('}\n\n')) {
    // check if already closed with "      }\n"
    if (!src.slice(idx - 20, idx).includes('}\n')) {
      src = src.slice(0, idx) + `\n      }\n` + src.slice(idx);
      console.log('closed @else');
    } else {
      console.log('else already closed?');
    }
  } else {
    console.log('else close check:', JSON.stringify(before.slice(-30)));
  }
}

// More reliable: ensure pattern "      </div>\n      }\n\n      <div class=\"flex flex-col lg"
if (!/<\/div>\s*\}\s*<div class="flex flex-col lg:flex-row flex-grow min-h-0">/.test(src.replace(/\r\n/g, '\n'))) {
  src = src.replace(
    /(\n\s*<\/div>\n)(\n\s*<div class="flex flex-col lg:flex-row flex-grow min-h-0">)/,
    `$1      }\n$2`
  );
  console.log('forced else close');
} else {
  console.log('else close pattern ok');
}

// 5) Add signal + method if missing
if (!src.includes('toolbarCollapsed = signal')) {
  src = src.replace(
    `readonly toolbarMenu = signal<'match' | 'speed' | 'jump' | 'camera' | 'hero' | null>(null);`,
    `readonly toolbarMenu = signal<'match' | 'speed' | 'jump' | 'camera' | 'hero' | null>(null);
  readonly toolbarCollapsed = signal(false);

  setToolbarCollapsed(collapsed: boolean): void {
    this.toolbarCollapsed.set(collapsed);
    if (collapsed) this.toolbarMenu.set(null);
  }`
  );
  console.log('signal added');
}

fs.writeFileSync(file, src);
console.log('done');
