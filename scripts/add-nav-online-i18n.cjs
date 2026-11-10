/**
 * 导航调整：把「观看录像」并入父级菜单「在线对战」，新增子项「网页对战」。
 *  1) 给 25 个语言包的 nav 段补 online / play 两个键（幂等）
 *  2) 改写 header.component.ts 桌面端与移动端菜单（幂等）
 * 用法: node scripts/add-nav-online-i18n.cjs
 */
const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../src/app/core/i18n/locales');
const text = {
  zh_CN: ['在线对战', '网页对战'],
  zh_TW: ['線上對戰', '網頁對戰'],
  en: ['PLAY ONLINE', 'WEB MATCH'],
  ja: ['オンライン対戦', 'ブラウザ対戦'],
  ko: ['온라인 대전', '웹 대전'],
  ru: ['ОНЛАЙН-ИГРА', 'ВЕБ-МАТЧ'],
  uk: ['ОНЛАЙН-ГРА', 'ВЕБ-МАТЧ'],
  de: ['ONLINE SPIELEN', 'WEB-MATCH'],
  fr: ['JOUER EN LIGNE', 'MATCH WEB'],
  es: ['JUGAR ONLINE', 'PARTIDA WEB'],
  it: ['GIOCA ONLINE', 'PARTITA WEB'],
  pt: ['JOGAR ONLINE', 'PARTIDA WEB'],
};
for (const file of fs.readdirSync(localesDir)) {
  if (!file.endsWith('.ts')) continue;
  const code = file.replace(/\.ts$/, '');
  const p = path.join(localesDir, file);
  let s = fs.readFileSync(p, 'utf8');
  if (/\bonline:\s*"/.test(s.slice(0, s.indexOf('header:') > 0 ? s.indexOf('header:') : 2000))) continue;
  const [online, play] = text[code] || text.en;
  const next = s.replace(/(nav:\s*\{[\s\S]*?replay:\s*"[^"]*",)/, `$1 online: "${online}", play: "${play}",`);
  if (next === s) {
    console.warn('未找到 nav.replay，跳过', file);
    continue;
  }
  fs.writeFileSync(p, next);
  console.log('i18n +', file);
}

// ---------- header ----------
const headerPath = path.join(__dirname, '../src/app/layout/header.component.ts');
let h = fs.readFileSync(headerPath, 'utf8');
const eol = h.includes('\r\n') ? '\r\n' : '\n';
h = h.replace(/\r\n/g, '\n');
if (!h.includes('isOnlineDropdownOpen')) {
  const desktopOld = `              <a routerLink="/replay-3d" routerLinkActive="text-accent border-b-3 border-accent opacity-100" class="transition-all px-2 opacity-30 hover:opacity-100 hover:text-accent">{{ 'nav.replay' | t }}</a>\n`;
  const desktopNew = `              <!-- 在线对战 下拉菜单（网页对战 / 录像回放） -->
              <div class="relative group h-full flex items-center" (mouseenter)="isOnlineDropdownOpen.set(true)" (mouseleave)="isOnlineDropdownOpen.set(false)">
                  <a routerLink="/play" routerLinkActive="text-accent border-b-3 border-accent opacity-100" class="transition-all px-2 opacity-30 group-hover:opacity-100 group-hover:text-accent flex items-center gap-1 h-full">
                      {{ 'nav.online' | t }}
                      <span class="material-icons text-[14px] transition-transform" [class.rotate-180]="isOnlineDropdownOpen()">expand_more</span>
                  </a>
                  <div class="absolute top-[calc(100%-1px)] left-0 w-48 dropdown-blur border border-[var(--border)] rounded-b-lg shadow-2xl py-2 transition-all duration-200 transform z-[110]"
                       [class.opacity-100]="isOnlineDropdownOpen()"
                       [class.visible]="isOnlineDropdownOpen()"
                       [class.translate-y-0]="isOnlineDropdownOpen()"
                       [class.opacity-0]="!isOnlineDropdownOpen()"
                       [class.invisible]="!isOnlineDropdownOpen()"
                       [class.translate-y-2]="!isOnlineDropdownOpen()">
                      <a routerLink="/play" (click)="isOnlineDropdownOpen.set(false)" class="block px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">{{ 'nav.play' | t }}</a>
                      <a routerLink="/replay-3d" (click)="isOnlineDropdownOpen.set(false)" class="block px-4 py-2 text-sm text-[var(--text-muted)] hover:text-accent hover:bg-[var(--border)] transition-colors">{{ 'nav.replay' | t }}</a>
                  </div>
              </div>
`;
  if (!h.includes(desktopOld)) throw new Error('桌面端 replay 链接未找到');
  h = h.replace(desktopOld, desktopNew);

  const mobileOld = `                  <a routerLink="/replay-3d" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-4 rounded-xl text-lg font-bold text-[var(--text-main)] flex items-center gap-4 group active:bg-accent active:!text-white transition-all border border-white/5">
                      <span class="material-icons text-accent group-active:!text-white">movie</span>
                      <span class="group-active:!text-white">{{ 'nav.replay' | t }}</span>
                  </a>
`;
  const mobileNew = `                  <!-- 移动端 在线对战 -->
                  <div class="pt-4 pb-2">
                      <a routerLink="/play" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-4 rounded-xl text-lg font-bold text-[var(--text-main)] flex items-center gap-4 group active:bg-accent active:!text-white transition-all border border-white/5">
                          <span class="material-icons text-accent group-active:!text-white">sports_esports</span>
                          <span class="group-active:!text-white">{{ 'nav.online' | t }}</span>
                      </a>
                      <div class="space-y-1 pl-4">
                          <a routerLink="/play" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                              <span class="material-icons text-accent text-sm group-active:!text-white">videogame_asset</span>
                              {{ 'nav.play' | t }}
                          </a>
                          <a routerLink="/replay-3d" (click)="closeMenu()" routerLinkActive="!text-white bg-accent" class="px-4 py-3 rounded-xl text-md font-bold text-[var(--text-main)] flex items-center gap-3 active:bg-accent active:!text-white transition-all">
                              <span class="material-icons text-accent text-sm group-active:!text-white">movie</span>
                              {{ 'nav.replay' | t }}
                          </a>
                      </div>
                  </div>
`;
  if (!h.includes(mobileOld)) throw new Error('移动端 replay 链接未找到');
  h = h.replace(mobileOld, mobileNew);

  const sigOld = '  isSquadDropdownOpen = signal(false);\n';
  if (!h.includes(sigOld)) throw new Error('isSquadDropdownOpen 定义未找到');
  h = h.replace(sigOld, sigOld + '  // 「在线对战」父级菜单展开状态（子项：网页对战 / 录像回放）\n  isOnlineDropdownOpen = signal(false);\n');
  fs.writeFileSync(headerPath, h.replace(/\n/g, eol));
  console.log('header 已更新');
} else {
  console.log('header 已是最新，跳过');
}
