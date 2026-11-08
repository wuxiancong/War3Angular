/**
 * Rebuild radiant (and dire ancient) building model/scale/facing from DotA 6.83d
 * UnitUI.slk + war3map.j CreateUnit placeholders.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const buildingsPath = path.join(root, 'public/assets/maps/dota683/buildings.json');
const uiPath = path.join(__dirname, 'dota683_extract/units_unitui.slk');
const jassPath = 'D:/Qt/workspace/War3Bot/war3files/war3map.j';

function parseUnitUi(slkText) {
  let x = 1;
  let y = 1;
  const rows = new Map();
  for (const line of slkText.split(/\r?\n/)) {
    if (!line.startsWith('C;')) continue;
    let k = null;
    for (const part of line.split(';')) {
      if (part.startsWith('X')) x = +part.slice(1);
      else if (part.startsWith('Y')) y = +part.slice(1);
      else if (part.startsWith('K')) k = part.slice(1);
    }
    if (k == null) continue;
    if (k.startsWith('"') && k.endsWith('"')) k = k.slice(1, -1);
    if (!rows.has(y)) rows.set(y, {});
    rows.get(y)[x] = k;
  }
  const byId = new Map();
  for (const [, r] of rows) {
    if (r[1] && r[1].length === 4) {
      byId.set(r[1], {
        file: (r[3] || '').replace(/\//g, '\\'),
        modelScale: parseFloat(r[22] || '1') || 1,
      });
    }
  }
  return byId;
}

function fourCC(n) {
  n = n >>> 0;
  return String.fromCharCode((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
}

function toMdxPath(file) {
  if (!file || file === '_') return '';
  let p = file.replace(/\//g, '\\');
  if (!/\.mdx$/i.test(p)) p += '.mdx';
  // normalize common casing for our static asset tree
  p = p.replace(/^buildings\\/i, 'Buildings\\');
  p = p.replace(/^units\\/i, 'Units\\');
  p = p.replace(/^doodads\\/i, 'Doodads\\');
  p = p.replace(/^war3mapimported\\/i, 'war3mapImported\\');
  p = p.replace(/\\nightelf\\/gi, '\\NightElf\\');
  p = p.replace(/\\human\\/gi, '\\Human\\');
  p = p.replace(/\\undead\\/gi, '\\Undead\\');
  p = p.replace(/\\orc\\/gi, '\\Orc\\');
  p = p.replace(/\\other\\/gi, '\\Other\\');
  p = p.replace(/\\critters\\/gi, '\\Critters\\');
  p = p.replace(/\\creeps\\/gi, '\\Creeps\\');
  p = p.replace(/\\watcher\\watcher/gi, '\\Watcher\\Watcher');
  return p;
}

const byId = parseUnitUi(fs.readFileSync(uiPath, 'utf8'));
const jass = fs.readFileSync(jassPath, 'utf8');

// Placeholder CreateUnit(p, type, x, y, face) → authoritative coords
const byPos = new Map();
const re = /CreateUnit\(p,(\d+),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)\)/g;
let m;
while ((m = re.exec(jass))) {
  const id = fourCC(+m[1]);
  const x = +m[2];
  const y = +m[3];
  const face = +m[4];
  byPos.set(`${x},${y}`, { id, x, y, face });
}

// Sent_Buildings recreation facings (override placeholder face when matched by type+approx pos)
const hbStart = jass.indexOf('function HB1');
const hb = jass.slice(hbStart, jass.indexOf('endfunction', hbStart));
// Build var→placeholder from GetUnitX
const varToPh = new Map();
const getRe = /set (\w+)=GetUnitX\((\w+)\)[\r\n]+set (\w+)=GetUnitY\((\w+)\)/g;
while ((m = getRe.exec(hb))) {
  const [, , xu, , yu] = m;
  if (xu !== yu) continue;
  const phMatch = jass.match(new RegExp(`set ${xu}=CreateUnit\\(p,(\\d+),(-?\\d+\\.?\\d*),(-?\\d+\\.?\\d*),(-?\\d+\\.?\\d*)\\)`));
  if (!phMatch) continue;
  const ph = {
    id: fourCC(+phMatch[1]),
    x: +phMatch[2],
    y: +phMatch[3],
    face: +phMatch[4],
  };
  varToPh.set(m[1], ph);
  varToPh.set(m[3], ph);
}
const faceByPos = new Map();
const creRe = /CreateUnit\([^,]+,(\d+),(\w+),(\w+),(-?\d+)\)/g;
while ((m = creRe.exec(hb))) {
  const ph = varToPh.get(m[2]);
  if (!ph) continue;
  faceByPos.set(`${ph.x},${ph.y}`, +m[4]);
}

const cfg = JSON.parse(fs.readFileSync(buildingsPath, 'utf8'));
const unitIdByBuildingId = {
  r_fountain: 'nfoh',
  r_cop_1: 'n01F',
  r_cop_2: 'n01F',
  r_cop_3: 'n01F',
  r_cop_4: 'n01F',
  r_cop_5: 'n01F',
  'r_shop_ arcane': 'hC95',
  r_shop_wonder: 'e025',
  r_shop_sena: 'nC38',
  r_shop_weapon: 'n01K',
  r_shop_anc_weap: 'n00W',
  r_shop_ench: 'n00X',
  r_shop_prot: 'n0HE',
  r_shop_sanctum: 'n00V',
  r_shop_vest: 'n002',
  r_shop_gateway: 'n009',
  r_ancient: 'etol',
  r_t4_a: 'e019',
  r_t4_b: 'e019',
  r_t3_top: 'e00S',
  r_t2_top: 'e00R',
  r_t1_top: 'e00R',
  r_t3_mid: 'e00S',
  r_t2_mid: 'e011',
  r_t1_mid: 'e011',
  r_t3_bot: 'e00S',
  r_t2_bot: 'e00R',
  r_t1_bot: 'e011',
  r_rax_melee_top: 'eaom',
  r_rax_range_top: 'eaoe',
  r_rax_melee_mid: 'eaom',
  r_rax_range_mid: 'eaoe',
  r_rax_melee_bot: 'eaom',
  r_rax_range_bot: 'eaoe',
  r_mw_1: 'emow',
  r_mw_2: 'emow',
  r_mw_3: 'emow',
  r_mw_4: 'emow',
  r_mw_5: 'emow',
  r_mw_6: 'emow',
  r_mw_7: 'emow',
  r_mw_8: 'emow',
  r_mw_9: 'emow',
  r_mw_10: 'emow',
  r_mw_11: 'emow',
  r_aow_1: 'eaow',
  r_aow_2: 'eaow',
  r_hh_1: 'edob',
  r_hh_2: 'edob',
  d_ancient: 'unpl',
};

let patched = 0;
for (const b of cfg.buildings) {
  const uid = unitIdByBuildingId[b.id];
  if (!uid) continue;
  const ui = byId.get(uid);
  if (!ui) {
    console.warn('no ui', b.id, uid);
    continue;
  }
  const model = toMdxPath(ui.file);
  const key = `${b.x},${b.y}`;
  const face = faceByPos.has(key) ? faceByPos.get(key) : byPos.get(key)?.face ?? b.facing;
  const before = { model: b.model, scale: b.scale, facing: b.facing };
  b.model = model;
  b.scale = ui.modelScale;
  b.facing = face;
  b.unitId = uid;
  patched++;
  if (before.model !== b.model || before.scale !== b.scale || before.facing !== b.facing) {
    console.log(
      b.id,
      uid,
      `\n  model ${before.model} -> ${b.model}`,
      `\n  scale ${before.scale} -> ${b.scale}`,
      `\n  face  ${before.facing} -> ${b.facing}`
    );
  }
}

cfg.note =
  '源自 DotA v6.83d war3map.j CreateAllUnits/Sent_Buildings + Units\\UnitUI.slk：坐标/朝向以 CreateUnit 为准，模型与 modelScale 以 UnitUI 为准（近卫主基地 etol=war3mapImported\\final_export）。';

fs.writeFileSync(buildingsPath, JSON.stringify(cfg, null, 2) + '\n');
console.log('patched', patched, 'buildings ->', buildingsPath);
