const fs = require('fs');
const path = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(path, 'utf8');

const resolutions = [
  // 1 CSS nudge — keep transform, drop AI wrappers
  {
    re: /<<<<<<< HEAD\r?\n([\s\S]*?)=======\r?\n([\s\S]*?)>>>>>>> [^\r\n]+\r?\n/,
    pick: () => `        transform: translate(2px, 2px);\n`,
  },
];

// Generic: resolve known conflict bodies by index with explicit replacements
const conflictRe =
  /<<<<<<< HEAD\r?\n([\s\S]*?)=======\r?\n([\s\S]*?)>>>>>>> [^\r\n]+\r?\n/g;

const picks = [
  // 0: CSS — transform only
  () => `        transform: translate(2px, 2px);\n`,
  // 1: comment basicCommand — clean Chinese
  () =>
    `    // basicCommand 已在 timeline.sampleAt 与 isMoving 收敛（到达后不再锁死「移动」）\n`,
  // 2: boot signature — keep method + clean comment
  () =>
    `  private async boot(attempt = 0): Promise<void> {\n    // 地形就绪即结束 loading 并开渲，不再等英雄/兵线全部加载完\n`,
  // 3: currentHeroModelUrl — KEEP HEAD
  () => `      this.currentHeroModelUrl = modelUrl;\n`,
  // 4: furion HUD sync — KEEP HEAD with clean Chinese
  () => `        // 启动时 HUD 同步为先知（ZH 序 20）
        if (furion) this.applyHeroRosterEntry(furion, true);
        else {
          this.modelName.set('MalFurionNoStag');
          this.currentHeroKey.set('emns');
          this.heroPresetLocked.set(true);
          this.heroNameCn.set('先知');
          this.heroTitle.set('先知 · 远程智力');
        }
        this.spiritBearSummoned = false;
`,
  // 5: end boot comment — drop AI wrapper (empty HEAD)
  () => ``,
  // 6: horn comment
  () =>
    `      // 仅号角后时钟驱动；无 GameStart 时 gameT=0 绝不刷兵；有录像时墙钟恒为 0\n`,
  // 7: end horn comment — empty
  () => ``,
];

let i = 0;
s = s.replace(conflictRe, () => {
  if (i >= picks.length) {
    throw new Error('Unexpected extra conflict at index ' + i);
  }
  const out = picks[i]();
  i++;
  return out;
});

if (i !== picks.length) {
  console.error('Expected', picks.length, 'conflicts, resolved', i);
  process.exit(1);
}

if (/<<<<<<<|>>>>>>>/.test(s)) {
  console.error('markers remain');
  process.exit(1);
}

// Fix a few known mojibake UI strings near conflicts if still latin1-looking
const labelFixes = [
  [/move: '[^']*',/, "move: '移动',"],
  [/stop: '[^']*',/, "stop: '停止',"],
  [/hold: '[^']*',/, "hold: '保持原位',"],
  [/attack: '[^']*',/, "attack: '攻击',"],
  [/patrol: '[^']*',/, "patrol: '巡逻',"],
];
// Only apply in cmdLabels block carefully via one shot for cmdLabels
s = s.replace(
  /const cmdLabels: Record<string, string> = \{[\s\S]*?\};/,
  `const cmdLabels: Record<string, string> = {
      move: '移动',
      stop: '停止',
      hold: '保持原位',
      attack: '攻击',
      patrol: '巡逻',
    };`
);

s = s.replace(
  /this\.basicCommandLabel\.set\(cmdLabels\[cmd\] \|\| '[^']*'\);/,
  "this.basicCommandLabel.set(cmdLabels[cmd] || '无');"
);

s = s.replace(
  /\? `[^`]*\$\{state\.unspentSkillPoints\}[^`]*`\s*:\s*'[^']*'/,
  "? `学习技能（剩余 ${state.unspentSkillPoints} 点）`\n          : '学习技能'"
);

s = s.replace(
  /\{ id: 'move', hotkey: 'M', name: '[^']*',/,
  "{ id: 'move', hotkey: 'M', name: '移动',"
);
s = s.replace(
  /\{ id: 'stop', hotkey: 'S', name: '[^']*',/,
  "{ id: 'stop', hotkey: 'S', name: '停止',"
);
s = s.replace(
  /\{ id: 'hold', hotkey: 'H', name: '[^']*',/,
  "{ id: 'hold', hotkey: 'H', name: '保持原位',"
);
s = s.replace(
  /\{ id: 'attack', hotkey: 'A', name: '[^']*',/,
  "{ id: 'attack', hotkey: 'A', name: '攻击',"
);
s = s.replace(
  /\{ id: 'patrol', hotkey: 'P', name: '[^']*',/,
  "{ id: 'patrol', hotkey: 'P', name: '巡逻',"
);

s = s.replace(/this\.error\.set\('[^']*'\);\s*\n\s*this\.loading\.set\(false\);\s*\n\s*return;\s*\n\s*\}/, (m) => {
  if (m.includes('视口') || /error\.set/.test(m)) {
    return m.replace(/this\.error\.set\('[^']*'\)/, "this.error.set('视口未就绪')");
  }
  return m;
});
s = s.replace(/this\.error\.set\(msg \|\| '[^']*'\)/, "this.error.set(msg || '未知错误')");

fs.writeFileSync(path, s, 'utf8');
console.log('resolved', i, 'conflicts');
console.log('markers left', (s.match(/<<<<<<</g) || []).length);
console.log('has furion boot', s.includes("getHeroByKey('emns')"));
console.log('has currentHeroModelUrl', s.includes('this.currentHeroModelUrl = modelUrl'));
