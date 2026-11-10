/**
 * 引擎无头冒烟测试：10 个电脑英雄跑 N 分钟，校验确定性（同种子两次校验和一致）并打印战况。
 * 运行: node scripts/run-game-sim.cjs [分钟数]
 */
import * as fs from 'node:fs';
import { GameEngine, type GameSetup, type TurnCommand } from '../src/app/game/game-engine';
import type { GameplayData, PathingData } from '../src/app/game/game-data';

const root = process.cwd();
const data = JSON.parse(fs.readFileSync(`${root}/public/assets/dota/gameplay-data.json`, 'utf8')) as GameplayData;
const pathing = JSON.parse(fs.readFileSync(`${root}/public/assets/maps/dota683/pathing.json`, 'utf8')) as PathingData;
const sync = JSON.parse(fs.readFileSync(`${root}/public/assets/maps/dota683/scene-sync.json`, 'utf8'));
const bld = JSON.parse(fs.readFileSync(`${root}/public/assets/maps/dota683/buildings.json`, 'utf8'));

const minutes = Number(process.argv[2] || 12);
const heroCodes = ['Hvwd', 'Nbbc', 'Hmbr', 'Usyl', 'Hjai', 'Ulic', 'Udre', 'U00A', 'EC57', 'Uktl'];

function makeSetup(seed: number): GameSetup {
  return {
    seed,
    prepSec: 10,
    players: heroCodes.map((c, i) => ({ slot: i, name: `电脑${i + 1}`, heroCode: data.heroes[c] ? c : Object.keys(data.heroes)[i], isBot: true })),
    lanes: sync.lanes,
    camps: sync.neutralCamps,
    runeSpots: sync.runeSpots,
    buildings: bld.buildings,
    pathing,
  };
}

function run(seed: number, scripted: boolean): { sum: number; engine: GameEngine; ms: number } {
  const e = new GameEngine(data, makeSetup(seed));
  const total = Math.round((minutes * 60) / 0.05);
  const t0 = Date.now();
  for (let i = 0; i < total && e.winner < 0; i++) {
    const cmds: TurnCommand[] = [];
    // 脚本指令：验证玩家指令通道（slot 0 每 20 秒向中路 A 过去）
    if (scripted && i % 400 === 100) cmds.push({ slot: 0, c: { t: 'amove', x: -200, y: -700 } });
    e.step(cmds);
    e.events.length = 0;
  }
  return { sum: e.checksum(), engine: e, ms: Date.now() - t0 };
}

const a = run(12345, true);
const b = run(12345, true);
const c = run(999, true);
console.log(`模拟 ${minutes} 分钟：耗时 ${a.ms}ms（${((minutes * 60 * 1000) / a.ms).toFixed(0)}x 实时）`);
console.log(`确定性：seed=12345 两次校验和 ${a.sum} / ${b.sum} → ${a.sum === b.sum ? '一致 ✓' : '不一致 ✗'}；seed=999 → ${c.sum}`);
const e = a.engine;
let creeps = 0;
let neutrals = 0;
for (const u of e.units.values()) {
  if (!u.alive) continue;
  if (u.kind === 'creep') creeps++;
  if (u.kind === 'neutral') neutrals++;
}
console.log(`时钟 ${Math.floor(e.clockSec / 60)}:${String(Math.floor(e.clockSec % 60)).padStart(2, '0')}  存活小兵 ${creeps}  野怪 ${neutrals}  胜方 ${e.winner}`);
for (const h of e.heroes) {
  if (!h?.hero) continue;
  const s = h.hero;
  console.log(
    `  [${s.slot}] ${h.name.padEnd(8)} Lv${String(s.level).padStart(2)} ${s.kills}/${s.deaths}/${s.assists} 补刀${String(s.lastHits).padStart(3)} 金${String(s.gold).padStart(5)} ` +
      `HP ${Math.round(h.hp)}/${h.maxHp} 攻击 ${s.dmgMin}-${s.dmgMax} 护甲 ${h.armor.toFixed(1)} 物品 ${s.items.filter(Boolean).map((it) => data.items[it!.code]?.name).join(',')}`
  );
}
const towers = [...e.units.values()].filter((u) => u.kind === 'tower' || u.kind === 'rax' || u.kind === 'ancient');
console.log('建筑：' + towers.map((t) => `${t.key}:${t.alive ? Math.round(t.hp) : '×'}`).join(' '));
if (a.sum !== b.sum) process.exit(1);
