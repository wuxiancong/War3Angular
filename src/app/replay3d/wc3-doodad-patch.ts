/**
 * Fix War3MapViewerMap doodad loading:
 * - SLK models live at dir\file\fileN.mdx (stock viewer only used bare `file`)
 * - DotA w3b/w3d mods reference missing base IDs → guard applyModificationTable
 */

import { dncLight, type DncLight } from './wc3-lighting';

/** 读 w3i（TFT 版本 25）里的水面染色；未启用（flags & 0x10000 为 0）或格式不认识时返回 null。返回 RGB */
export function readW3iWaterTint(b: Uint8Array): [number, number, number] | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 0;
  const i32 = () => { const v = dv.getInt32(o, true); o += 4; return v; };
  const str = () => { while (o < b.length && b[o] !== 0) o++; o++; };
  const version = i32();
  if (version !== 25) return null;
  i32(); i32(); // saves, editor version
  str(); str(); str(); str(); // name, author, description, recommended players
  o += 8 * 4 + 4 * 4; // camera bounds (8 floats) + complements (4 ints)
  i32(); i32(); // playable width/height
  const flags = i32();
  o += 1; // main tileset
  i32(); str(); str(); str(); str(); // loading screen
  i32(); str(); str(); str(); str(); // game data set + prologue
  o += 4 + 4 * 3 + 4; // terrain fog type, start/end/density, colour
  o += 4; // weather id
  str(); // sound environment
  o += 1; // light environment tileset
  if (o + 4 > b.length || !(flags & 0x10000)) return null;
  return [b[o + 2], b[o + 1], b[o]];
}

export interface DoodadPatchDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  War3MapViewerMap: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MappedDataRow: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DooFile: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Doodad: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TerrainDoodad: any;
}

/**
 * 旧补丁：把高台 / 悬崖边的草地贴图强行换成大理石。WC3 本身不会这样做——地面贴图完全按 w3e 的
 * groundTexture 与 CliffTypes.slk 的 groundTile 取，强改会让近卫基地（Ashenvale 草地高台）大片变色。
 * 实际替换成的是 Clvg（Felwood_Leaves 落叶），原版截图里近卫基地是草地，所以关闭。
 * 以前关掉显得「偏黄」是因为地面没有光照、直接输出贴图；现在地形按 DNC 光照着色。
 */
const MARBLE_PLATFORM_HACK = false;

export function patchWar3MapViewerMap(deps: DoodadPatchDeps): void {
  const { War3MapViewerMap, MappedDataRow, DooFile, Doodad, TerrainDoodad } = deps;

  War3MapViewerMap.prototype.applyModificationTable = function applyModificationTableSafe(
    dataMap: any,
    metadataMap: any,
    modificationTable: any
  ) {
    if (!modificationTable?.objects) return;
    for (const modificationObject of modificationTable.objects) {
      let row: any;
      const newId = modificationObject.newId;
      const oldId = modificationObject.oldId;
      const hasNew = typeof newId === 'string' && newId !== '' && !/^\0+$/.test(newId);
      if (hasNew) {
        row = dataMap.getRow(newId);
        if (!row) {
          const base = dataMap.getRow(oldId);
          if (!base?.map) {
            console.warn('[wc3] skip custom object, missing base', oldId, '->', newId);
            continue;
          }
          row = new MappedDataRow();
          row.map = Object.assign({}, base.map);
          dataMap.setRow(newId, row);
        }
      } else {
        row = dataMap.getRow(oldId);
        if (!row) continue;
      }
      for (const modification of modificationObject.modifications || []) {
        const metadata = metadataMap.getRow(modification.id);
        if (metadata) {
          row.set(metadata.string('field'), modification.value);
        }
      }
    }
  };

  War3MapViewerMap.prototype.loadDoodadsAndDestructibles = function loadDoodadsFixed() {
    const mpqFile = this.map.get('war3map.doo');
    if (!mpqFile) {
      console.warn('Attempted to load war3map.doo but it is not there');
      return;
    }

    const parser = new DooFile();
    try {
      parser.load(mpqFile.bytes(), this.buildVersion);
    } catch (e) {
      console.warn(`Failed to load war3map.doo: ${e}`);
      return;
    }

    const buildCandidates = (
      dir: string | undefined,
      fileField: string,
      variation: number,
      numVar: number
    ): string[] => {
      const normalized = fileField.replace(/\//g, '\\');
      const hasPath = normalized.includes('\\');
      const stem = hasPath ? normalized.split('\\').pop()! : normalized;
      const bareDir = hasPath
        ? normalized.slice(0, normalized.length - stem.length - 1)
        : dir;

      let leaf = stem;
      const canAppendVar = numVar > 1 && !/\d$/.test(stem);
      if (canAppendVar) leaf += Math.min(variation, numVar - 1);
      leaf += '.mdx';

      const paths: string[] = [];
      if (bareDir) {
        paths.push(`${bareDir}\\${stem}\\${leaf}`);
        paths.push(`${bareDir}\\${leaf}`);
      }
      if (hasPath) {
        // full path without variation folder tricks
        let full = normalized;
        if (!full.toLowerCase().endsWith('.mdx')) {
          full = canAppendVar ? `${full}${Math.min(variation, numVar - 1)}.mdx` : `${full}.mdx`;
        }
        paths.unshift(full);
      }
      paths.push(leaf);
      return Array.from(new Set(paths));
    };

    const shouldSkipDoodad = (id: string, row: any, file: string): boolean => {
      const id4 = String(id || '').replace(/\0/g, '').trim();
      const cat = String(row.string?.('category') || row.string?.('doodClass') || '');
      const name = String(row.string?.('Name') || '');
      const fileNorm = String(file || '').replace(/\//g, '\\');
      // 路径/视野辅助（含 TeamColor 色块 LOSBlocker）
      if (cat === 'P') return true;
      if (/^(YTlb|YTpb|YTfc|YTpc)$/i.test(id4)) return true;
      if (/LOSBlocker|PathingBlocker|BlightDoodad|InvisiblePlatform|ClickHelper/i.test(fileNorm)) return true;
      if (/WESTRING_DEST_LOS|WESTRING_DEST_PATH/i.test(name)) return true;
      // DotA 自定义：D009=FaerieFire 技能特效、D000/D001 辅助物
      if (/^(D009|D000|D001)$/i.test(id4)) return true;
      if (/^Abilities\\/i.test(fileNorm) || /FaerieFire/i.test(fileNorm)) return true;
      // 灌木、花、蘑菇、芦苇、骨堆等地面装饰原版都会显示（原版截图里到处都是），不再隐藏
      return false;
    };

    for (const doodad of parser.doodads) {
      try {
        const row = this.viewer.doodadsData.getRow(doodad.id);
        if (!row) continue;
        let file = row.string('file');
        if (!file) continue;
        if (shouldSkipDoodad(String(doodad.id || ''), row, file)) continue;
        if (file.toLowerCase().endsWith('.mdl')) file = file.slice(0, -4);
        const dir = row.string('dir');
        const paths = buildCandidates(dir, file, doodad.variation, row.number('numVar') || 1);

        const local = paths.map((p: string) => this.map.get(p)).find(Boolean);
        const promise = local
          ? this.load(local.name)
          : (async () => {
            for (const p of paths) {
              const model = await this.load(p);
              if (model) return model;
            }
            return undefined;
          })();

        promise.then((model: any) => {
          if (model) this.doodads.push(new Doodad(this, model, row, doodad));
        });
      } catch (e) {
        console.warn(`Failed to load doodad/destructible ID ${doodad.id}: ${e}`);
      }
    }

    for (const doodad of parser.terrainDoodads) {
      try {
        const row = this.viewer.doodadsData.getRow(doodad.id);
        if (!row) continue;
        let file = row.string('file');
        if (!file) continue;
        if (file.toLowerCase().endsWith('.mdl')) file = file.slice(0, -4);
        const dir = row.string('dir');
        const paths = buildCandidates(dir, file, 0, 1);
        (async () => {
          for (const p of paths) {
            const model = await this.load(p);
            if (model) {
              this.terrainDoodads.push(new TerrainDoodad(this, model, row, doodad));
              return;
            }
          }
        })();
      } catch (e) {
        console.warn(`Failed to load cliff/terrain doodad ID ${doodad.id}: ${e}`);
      }
    }

    this.doodadsReady = true;
    this.anyReady = true;
  };

  War3MapViewerMap.prototype.isCliff = function isCliffSafe(
    this: any,
    column: number,
    row: number
  ): boolean {
    if (column < 1 || column > this.columns - 1 || row < 1 || row > this.rows - 1) {
      return false;
    }
    const corners = this.corners;
    if (!corners?.[row]?.[column] || !corners?.[row + 1]?.[column + 1]) return false;
    const c00 = corners[row][column];
    const c10 = corners[row][column + 1];
    const c01 = corners[row + 1][column];
    const c11 = corners[row + 1][column + 1];
    // --- AI 修改开始 [RAMP-AS-SLOPE]：带 ramp 标记的层差格用地面网格三角坡表现，避免当成悬崖 mesh 后看起来「没坡度」 ---
    if (c00.ramp || c10.ramp || c01.ramp || c11.ramp) {
      return false;
    }
    // --- AI 修改结束 [RAMP-AS-SLOPE] ---
    const bottomLeft = c00.layerHeight;
    const bottomRight = c10.layerHeight;
    const topLeft = c01.layerHeight;
    const topRight = c11.layerHeight;
    return (
      bottomLeft !== bottomRight || bottomLeft !== topLeft || bottomLeft !== topRight
    );
  };

  War3MapViewerMap.prototype.cliffFileName = function cliffFileNameSafe(
    bottomLeftLayer: number,
    bottomRightLayer: number,
    topLeftLayer: number,
    topRightLayer: number,
    base: number
  ): string {
    // --- AI 修改开始 [CLIFF-HEIGHT]：层差 0..4（A..E）。原版多为 A..C；过严 clamp=2 会在高台缘生成过矮 mesh 呈“坡鼓包”，过高字母无模型会破洞 ---
    const clampChar = (layer: number) =>
      String.fromCharCode(65 + Math.max(0, Math.min(4, layer - base)));
    return (
      clampChar(bottomLeftLayer) +
      clampChar(topLeftLayer) +
      clampChar(topRightLayer) +
      clampChar(bottomRightLayer)
    );
  };

  const origCliffGroundIndex = War3MapViewerMap.prototype.cliffGroundIndex;

  // 绿方块根因有两层：
  // 1) CCgr.groundTile=Cgrs，悬崖邻格强制刷亮绿草；
  // 2) 高台内部 w3e 仍写着 Cgrs/Zvin，邻居也是草皮，marbleNear 数不到 Clvg（边缘才被悬崖逻辑盖成大理石）。
  // 处理：CCgr→Clvg；并把「近悬崖的高台草皮/暗草绿」烘焙+查询时都换成 Clvg。
  const tileIndexById = function tileIndexById(this: any, tileId: string): number {
    const tilesets = this.tilesets || [];
    for (let i = 0, l = tilesets.length; i < l; i++) {
      if (tilesets[i]?.string?.('tileID') === tileId) return i;
    }
    return -1;
  };

  const marbleTileIndex = function marbleTileIndex(this: any): number {
    const clvg = tileIndexById.call(this, 'Clvg');
    if (clvg >= 0) return clvg;
    return tileIndexById.call(this, 'Zbks');
  };

  /** 角点是否处于悬崖邻接（与 cornerTexture 原版环一致） */
  const isCliffAdjacentCorner = function isCliffAdjacentCorner(
    map: any,
    column: number,
    row: number
  ): boolean {
    const columns = map.columns;
    const rows = map.rows;
    for (let y = -1; y < 1; y++) {
      for (let x = -1; x < 1; x++) {
        const cc = column + x;
        const rr = row + y;
        if (cc > 0 && cc < columns - 1 && rr > 0 && rr < rows - 1 && map.isCliff(cc, rr)) {
          return true;
        }
      }
    }
    return false;
  };

  const nearCliffCell = function nearCliffCell(
    map: any,
    column: number,
    row: number,
    radius: number
  ): boolean {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const cc = column + dx;
        const rr = row + dy;
        if (cc > 0 && cc < map.columns - 1 && rr > 0 && rr < map.rows - 1 && map.isCliff(cc, rr)) {
          return true;
        }
      }
    }
    return false;
  };

  /**
   * 高台大理石语境：自身/邻格已是 Clvg/Zbks，或邻格是悬崖边（渲染时已是大理石）。
   * 用于把岛状 Cgrs/Zvin 绿方块清掉。
   */
  const countMarbleContext = function countMarbleContext(
    map: any,
    column: number,
    row: number,
    radius: number,
    clvg: number,
    zbks: number
  ): number {
    const corners = map.corners;
    let n = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (!dx && !dy) continue;
        const c = corners[row + dy]?.[column + dx];
        if (!c) continue;
        const t = c.groundTexture | 0;
        if ((clvg >= 0 && t === clvg) || (zbks >= 0 && t === zbks)) {
          n++;
          continue;
        }
        if (isCliffAdjacentCorner(map, column + dx, row + dy)) n++;
      }
    }
    return n;
  };

  const shouldForceMarbleTile = function shouldForceMarbleTile(
    map: any,
    column: number,
    row: number,
    tex: number,
    cgrs: number,
    zvin: number,
    clvg: number,
    zbks: number,
    marble: number
  ): boolean {
    if (marble < 0) return false;
    if (tex !== cgrs && (zvin < 0 || tex !== zvin)) return false;
    const corner = map.corners[row][column];
    if (!corner) return false;
    const ctx1 = countMarbleContext(map, column, row, 1, clvg, zbks);
    if (ctx1 >= 2) return true;
    // 高台内部岛：近悬崖且周围有大理石语境（含悬崖边“伪大理石”）
    if (
      (corner.layerHeight | 0) >= 10 &&
      nearCliffCell(map, column, row, 2) &&
      countMarbleContext(map, column, row, 2, clvg, zbks) >= 1
    ) {
      return true;
    }
    return false;
  };

  /** 地面 mesh 采样前：高台 Cgrs/Zvin → Clvg，并洪水填充被大理石围住的草皮岛 */
  const bakeMarblePlatformTextures = function bakeMarblePlatformTextures(map: any, corners: any[][]) {
    if (!corners?.length || !map?.tilesets?.length) return;
    const cgrs = tileIndexById.call(map, 'Cgrs');
    const zvin = tileIndexById.call(map, 'Zvin');
    const clvg = tileIndexById.call(map, 'Clvg');
    const zbks = tileIndexById.call(map, 'Zbks');
    const marble = marbleTileIndex.call(map);
    if (marble < 0 || cgrs < 0) return;
    const rows = corners.length;
    const cols = corners[0]?.length || 0;
    const marks: boolean[][] = new Array(rows);
    for (let row = 0; row < rows; row++) {
      marks[row] = new Array(cols).fill(false);
      for (let col = 0; col < cols; col++) {
        const c = corners[row][col];
        if (!c) continue;
        marks[row][col] = shouldForceMarbleTile(
          map,
          col,
          row,
          c.groundTexture | 0,
          cgrs,
          zvin,
          clvg,
          zbks,
          marble
        );
      }
    }
    // 洪水：仅从种子向外扩最多 3 格，吞掉高台内部绿岛，避免吞掉整片野区森林
    const seedDist: number[][] = new Array(rows);
    for (let row = 0; row < rows; row++) {
      seedDist[row] = new Array(cols);
      for (let col = 0; col < cols; col++) {
        seedDist[row][col] = marks[row][col] ? 0 : 99;
      }
    }
    for (let pass = 0; pass < 3; pass++) {
      let grew = 0;
      for (let row = 1; row < rows - 1; row++) {
        for (let col = 1; col < cols - 1; col++) {
          if (marks[row][col]) continue;
          const c = corners[row][col];
          if (!c) continue;
          const tex = c.groundTexture | 0;
          if (tex !== cgrs && (zvin < 0 || tex !== zvin)) continue;
          if ((c.layerHeight | 0) < 10) continue;
          let near = 0;
          let best = 99;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const n = corners[row + dy]?.[col + dx];
              if (!n) continue;
              const nt = n.groundTexture | 0;
              const marked = !!marks[row + dy]?.[col + dx];
              const naturalMarble =
                nt === marble || nt === clvg || (zbks >= 0 && nt === zbks);
              if (marked || naturalMarble) {
                near++;
                if (marked) best = Math.min(best, seedDist[row + dy][col + dx] + 1);
                else best = Math.min(best, 1); // 紧贴原生 Clvg/Zbks 的草皮岛
              }
            }
          }
          if (near >= 2 && best <= 3) {
            marks[row][col] = true;
            seedDist[row][col] = best;
            grew++;
          }
        }
      }
      if (!grew) break;
    }
    let changed = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!marks[row][col] || !corners[row][col]) continue;
        corners[row][col].groundTexture = marble;
        changed++;
      }
    }
    if (changed) {
      console.info('[wc3] marble bake: replaced grass tiles on platforms', changed);
    }
  };

  if (MARBLE_PLATFORM_HACK) War3MapViewerMap.prototype.cliffGroundIndex = function cliffGroundIndexMarble(
    this: any,
    whichCliff: number
  ): number {
    if (!this.cliffTilesets?.length) return 0;
    const clamped = Math.max(0, Math.min(this.cliffTilesets.length - 1, whichCliff | 0));
    if (!this.cliffTilesets[clamped]) return 0;
    const idx = origCliffGroundIndex.call(this, clamped);
    const cgrs = tileIndexById.call(this, 'Cgrs');
    const marble = marbleTileIndex.call(this);
    if (marble >= 0 && cgrs >= 0 && idx === cgrs) return marble;
    return idx;
  };

  if (MARBLE_PLATFORM_HACK) War3MapViewerMap.prototype.cornerTexture = function cornerTextureMarble(
    this: any,
    column: number,
    row: number
  ): number {
    const corners = this.corners;
    if (!corners?.[row]?.[column]) return 0;
    // columns/tilesets 已就绪时，先整图烘焙高台草皮（仅一次；须早于地面 mesh 采样）
    if (!this.__marblePlatformBaked && this.tilesets?.length && this.columns > 0) {
      this.__marblePlatformBaked = true;
      try {
        bakeMarblePlatformTextures(this, corners);
      } catch (e) {
        console.warn('[wc3] marble platform bake failed', e);
      }
    }
    const columns = this.columns;
    const rows = this.rows;
    const cgrs = tileIndexById.call(this, 'Cgrs');
    const zvin = tileIndexById.call(this, 'Zvin');
    const zbks = tileIndexById.call(this, 'Zbks');
    const clvg = tileIndexById.call(this, 'Clvg');
    const marble = marbleTileIndex.call(this);

    for (let y = -1; y < 1; y++) {
      for (let x = -1; x < 1; x++) {
        if (column + x > 0 && column + x < columns - 1 && row + y > 0 && row + y < rows - 1) {
          if (this.isCliff(column + x, row + y)) {
            let texture = corners[row + y][column + x].cliffTexture;
            if (texture === 15) texture = 1;
            return this.cliffGroundIndex(texture);
          }
        }
      }
    }

    const corner = corners[row][column];
    if (corner.blight) return this.blightTextureIndex;

    let tex = corner.groundTexture | 0;
    if (shouldForceMarbleTile(this, column, row, tex, cgrs, zvin, clvg, zbks, marble)) {
      tex = marble;
    }
    return tex;
  };

  /**
   * Cliff MDX loads can hang / reject (missing geoset, path case). Without
   * cliffsReady the 2-step cliff tiles stay empty holes. Wrap the stock loader
   * so terrain still finishes and partial cliff models are kept.
   */
  /**
   * war3map.w3i 的「水面染色」：flags & 0x10000 时，用地图里的颜色替换 Water.slk 水色的 RGB（透明度仍按水深取 slk）。
   * 颜色按 B,G,R,A 字节存。DotA 6.83 存的是 (255,0,0,255) → 纯蓝，所以河水是蓝色而不是 Felwood 的绿水。
   * 原版查看器读了 w3i 却没用这一项。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyWaterTint = (self: any): void => {
    const bytes: Uint8Array | undefined = self.map?.get?.('war3map.w3i')?.bytes?.();
    const tint = bytes ? readW3iWaterTint(bytes) : null;
    if (!tint) return;
    for (const c of [self.maxDeepColor, self.minDeepColor, self.maxShallowColor, self.minShallowColor]) {
      if (!c) continue;
      c[0] = tint[0];
      c[1] = tint[1];
      c[2] = tint[2];
    }
    self.__wc3WaterTint = tint;
  };

  const origLoadTerrain = War3MapViewerMap.prototype.loadTerrainCliffsAndWater;
  War3MapViewerMap.prototype.loadTerrainCliffsAndWater =
    async function loadTerrainCliffsAndWaterSafe(this: any) {
      // --- AI 修改开始 [RAMP-HEIGHT-SMOOTH]：在 orig 赋值 this.corners 时原地平滑 ramp（须先于 heightMap 烘焙）。DotA 大量 AAAA 同层斜坡仅靠 ramp 标记，不做平滑则永远是平地 ---
      const smoothRampHeights = (corners: any[][]) => {
        if (!corners?.length) return;
        const rows = corners.length;
        const cols = corners[0]?.length || 0;
        const eff: number[][] = new Array(rows);
        for (let y = 0; y < rows; y++) {
          eff[y] = new Array(cols);
          for (let x = 0; x < cols; x++) {
            const c = corners[y][x];
            eff[y][x] = (c?.groundHeight || 0) + (c?.layerHeight || 0);
          }
        }
        for (let iter = 0; iter < 5; iter++) {
          const next = eff.map((r) => r.slice());
          for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
              if (!corners[y][x]?.ramp) continue;
              let s = 0;
              let n = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  s += eff[y + dy][x + dx];
                  n++;
                }
              }
              next[y][x] = s / n;
            }
          }
          for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
              if (corners[y][x]?.ramp) eff[y][x] = next[y][x];
            }
          }
        }
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const c = corners[y][x];
            if (!c?.ramp) continue;
            c.groundHeight = eff[y][x] - c.layerHeight;
          }
        }
      };
      let cornersHooked = false;
      try {
        Object.defineProperty(this, 'corners', {
          configurable: true,
          enumerable: true,
          get() {
            return (this as any).__wc3Corners;
          },
          set(v: any[][]) {
            (this as any).__wc3Corners = v;
            if (!cornersHooked && v?.length) {
              cornersHooked = true;
              try {
                smoothRampHeights(v);
              } catch (e) {
                console.warn('[wc3] ramp height smooth failed', e);
              }
            }
          },
        });
      } catch (e) {
        console.warn('[wc3] ramp corners hook skipped', e);
      }
      // --- AI 修改结束 [RAMP-HEIGHT-SMOOTH] ---

      // --- AI 修改开始 [TERRAIN-LIGHTING]：仅对悬崖垂直岩壁应用法线明暗阴影，保持悬崖水平裙边与相邻地面 1.0 等亮无缝衔接，彻底消除岩石周围方块色差 ---
      try {
        const viewer = this.viewer;
        if (viewer?.webgl && !viewer.__wc3LitShadersApplied) {
          viewer.__wc3LitShadersApplied = true;
          const groundVert = `
            uniform mat4 u_VP;
            uniform sampler2D u_heightMap;
            uniform vec2 u_size;
            uniform vec2 u_offset;
            uniform bool u_extended[14];
            uniform float u_baseTileset;
            attribute vec2 a_position;
            attribute float a_InstanceID;
            attribute vec4 a_textures;
            attribute vec4 a_variations;
            uniform vec2 u_shadowTiles;
            varying vec4 v_tilesets;
            varying vec2 v_uv[4];
            varying vec3 v_normal;
            varying vec2 v_shadowUV;
            vec2 getCell(float variation) {
              if (variation < 16.0) return vec2(mod(variation, 4.0), floor(variation / 4.0));
              variation -= 16.0;
              return vec2(4.0 + mod(variation, 4.0), floor(variation / 4.0));
            }
            vec2 getUV(vec2 position, bool extended, float variation) {
              vec2 cell = getCell(variation);
              vec2 cellSize = vec2(extended ? 0.125 : 0.25, 0.25);
              vec2 uv = vec2(position.x, 1.0 - position.y);
              vec2 pixelSize = vec2(1.0 / 512.0, 1.0 / 256.0);
              return clamp((cell + uv) * cellSize, cell * cellSize + pixelSize, (cell + 1.0) * cellSize - pixelSize);
            }
            void main() {
              vec4 textures = a_textures - u_baseTileset;
              if (textures[0] > 0.0 || textures[1] > 0.0 || textures[2] > 0.0 || textures[3] > 0.0) {
                v_tilesets = textures;
                v_uv[0] = getUV(a_position, u_extended[int(textures[0]) - 1], a_variations[0]);
                v_uv[1] = getUV(a_position, u_extended[int(textures[1]) - 1], a_variations[1]);
                v_uv[2] = getUV(a_position, u_extended[int(textures[2]) - 1], a_variations[2]);
                v_uv[3] = getUV(a_position, u_extended[int(textures[3]) - 1], a_variations[3]);
                vec2 corner = vec2(mod(a_InstanceID, u_size.x), floor(a_InstanceID / u_size.x));
                vec2 base = corner + a_position;
                float height = texture2D(u_heightMap, base / u_size).a;
                // 法线：相邻地形角的高度差（高度以 128 码为单位，左右/上下各隔 1 格）
                float hL = texture2D(u_heightMap, (base - vec2(1.0, 0.0)) / u_size).a;
                float hR = texture2D(u_heightMap, (base + vec2(1.0, 0.0)) / u_size).a;
                float hD = texture2D(u_heightMap, (base - vec2(0.0, 1.0)) / u_size).a;
                float hU = texture2D(u_heightMap, (base + vec2(0.0, 1.0)) / u_size).a;
                v_normal = normalize(vec3(hL - hR, hD - hU, 2.0));
                v_shadowUV = base / u_shadowTiles;
                gl_Position = u_VP * vec4(base * 128.0 + u_offset, height * 128.0, 1.0);
              } else {
                v_normal = vec3(0.0, 0.0, 1.0);
                v_shadowUV = vec2(0.0);
                v_tilesets = vec4(0.0);
                v_uv[0] = vec2(0.0); v_uv[1] = vec2(0.0); v_uv[2] = vec2(0.0); v_uv[3] = vec2(0.0);
                gl_Position = vec4(0.0);
              }
            }
          `;
          const groundFrag = `
            precision mediump float;
            uniform sampler2D u_tilesets[15];
            uniform sampler2D u_shadowMap;
            uniform float u_shadowOn;
            uniform vec3 u_wc3LightDir;
            uniform vec3 u_wc3Diffuse;
            uniform vec3 u_wc3Ambient;
            varying vec4 v_tilesets;
            varying vec2 v_uv[4];
            varying vec3 v_normal;
            varying vec2 v_shadowUV;
            vec4 sampleTile(float tileset, vec2 uv) {
              int i = int(tileset - 0.6);
              if (i == 0) return texture2D(u_tilesets[0], uv);
              else if (i == 1) return texture2D(u_tilesets[1], uv);
              else if (i == 2) return texture2D(u_tilesets[2], uv);
              else if (i == 3) return texture2D(u_tilesets[3], uv);
              else if (i == 4) return texture2D(u_tilesets[4], uv);
              else if (i == 5) return texture2D(u_tilesets[5], uv);
              else if (i == 6) return texture2D(u_tilesets[6], uv);
              else if (i == 7) return texture2D(u_tilesets[7], uv);
              else if (i == 8) return texture2D(u_tilesets[8], uv);
              else if (i == 9) return texture2D(u_tilesets[9], uv);
              else if (i == 10) return texture2D(u_tilesets[10], uv);
              else if (i == 11) return texture2D(u_tilesets[11], uv);
              else if (i == 12) return texture2D(u_tilesets[12], uv);
              else if (i == 13) return texture2D(u_tilesets[13], uv);
              else if (i == 14) return texture2D(u_tilesets[14], uv);
              return vec4(0.0);
            }
            vec4 blend(vec4 color, float tileset, vec2 uv) {
              vec4 texel = sampleTile(tileset, uv);
              return mix(color, texel, texel.a);
            }
            void main() {
              vec4 color = sampleTile(v_tilesets[0], v_uv[0]);
              if (v_tilesets[1] > 0.5) color = blend(color, v_tilesets[1], v_uv[1]);
              if (v_tilesets[2] > 0.5) color = blend(color, v_tilesets[2], v_uv[2]);
              if (v_tilesets[3] > 0.5) color = blend(color, v_tilesets[3], v_uv[3]);
              // 原版：环境光 + 方向光（DNC），war3map.shd 烘焙阴影遮掉部分方向光
              float shadow = u_shadowOn * texture2D(u_shadowMap, v_shadowUV).a;
              float d = max(dot(normalize(v_normal), -u_wc3LightDir), 0.0) * (1.0 - WC3_SHADOW * shadow);
              vec3 light = clamp(u_wc3Ambient + u_wc3Diffuse * d, 0.0, 1.0);
              gl_FragColor = vec4(color.rgb * light, 1.0);
            }
          `;
          const cliffVert = `
            uniform mat4 u_VP;
            uniform sampler2D u_heightMap;
            uniform vec2 u_pixel;
            uniform vec2 u_centerOffset;
            uniform vec2 u_shadowTiles;
            varying vec2 v_shadowUV;
            attribute vec3 a_position;
            attribute vec3 a_normal;
            attribute vec2 a_uv;
            attribute vec3 a_instancePosition;
            attribute float a_instanceTexture;
            varying vec3 v_normal;
            varying vec2 v_uv;
            varying float v_texture;
            varying vec3 v_position;
            void main() {
              vec2 halfPixel = u_pixel * 0.5;
              vec2 corner = floor((a_instancePosition.xy - vec2(1.0, 0.0) - u_centerOffset.xy) / 128.0);
              float bottomLeft = texture2D(u_heightMap, corner * u_pixel + halfPixel).a;
              float bottomRight = texture2D(u_heightMap, (corner + vec2(1.0, 0.0)) * u_pixel + halfPixel).a;
              float topLeft = texture2D(u_heightMap, (corner + vec2(0.0, 1.0)) * u_pixel + halfPixel).a;
              float topRight = texture2D(u_heightMap, (corner + vec2(1.0, 1.0)) * u_pixel + halfPixel).a;
              float bottom = mix(bottomRight, bottomLeft, -a_position.x / 128.0);
              float top = mix(topRight, topLeft, -a_position.x / 128.0);
              float height = mix(bottom, top, a_position.y / 128.0);
              v_normal = a_normal;
              v_uv = a_uv;
              v_texture = a_instanceTexture;
              v_position = a_position + vec3(a_instancePosition.xy, a_instancePosition.z + height * 128.0);
              v_shadowUV = (v_position.xy - u_centerOffset) / 128.0 / u_shadowTiles;
              gl_Position = u_VP * vec4(v_position, 1.0);
            }
          `;
          const cliffFrag = `
            precision mediump float;
            uniform sampler2D u_texture1;
            uniform sampler2D u_texture2;
            varying vec3 v_normal;
            varying vec2 v_uv;
            varying float v_texture;
            varying vec3 v_position;
            varying vec2 v_shadowUV;
            uniform sampler2D u_shadowMap;
            uniform float u_shadowOn;
            uniform vec3 u_wc3LightDir;
            uniform vec3 u_wc3Diffuse;
            uniform vec3 u_wc3Ambient;
            vec4 sampleCliff(float texture, vec2 uv) {
              int i = int(texture + 0.1);
              if (i == 0) return texture2D(u_texture1, uv);
              return texture2D(u_texture2, uv);
            }
            void main() {
              vec4 color = sampleCliff(v_texture, v_uv);
              vec3 n = normalize(v_normal);
              float shadow = u_shadowOn * texture2D(u_shadowMap, v_shadowUV).a;
              float d = max(dot(n, -u_wc3LightDir), 0.0) * (1.0 - WC3_SHADOW * shadow);
              vec3 light = clamp(u_wc3Ambient + u_wc3Diffuse * d, 0.0, 1.0);
              gl_FragColor = vec4(color.rgb * light, color.a);
            }
          `;
          // 烘焙阴影遮掉的方向光比例
          const shadowDefine = '#define WC3_SHADOW 0.6\n';
          const newGround = viewer.webgl.createShader(groundVert, shadowDefine + groundFrag);
          if (newGround) viewer.groundShader = newGround;
          const newCliff = viewer.webgl.createShader(cliffVert, shadowDefine + cliffFrag);
          if (newCliff) viewer.cliffShader = newCliff;
        }
      } catch (e) {
        console.warn('[wc3] lit terrain shader init skipped', e);
      }
      try {
        await Promise.race([
          origLoadTerrain.call(this),
          new Promise<void>((resolve) => setTimeout(resolve, 10000)),
        ]);
      } catch (e) {
        console.warn('[wc3] loadTerrainCliffsAndWater failed', e);
      }
      try {
        applyWaterTint(this);
      } catch (e) {
        console.warn('[wc3] water tint skipped', e);
      }
      // 还原 corners 为普通可写属性，避免后续逻辑踩到 hook getter
      try {
        const baked = (this as any).__wc3Corners ?? this.corners;
        Object.defineProperty(this, 'corners', {
          value: baked,
          writable: true,
          configurable: true,
          enumerable: true,
        });
        delete (this as any).__wc3Corners;
      } catch {
        /* ignore */
      }
      if (!this.terrainReady) {
        // Should already be set before cliff awaits; keep safe.
        this.terrainReady = true;
        this.anyReady = true;
      }
      if (!Array.isArray(this.cliffModels)) this.cliffModels = [];
      this.cliffModels = this.cliffModels.filter(Boolean);
      this.cliffsReady = true;
    };

  // --- 原版光照：DNC 环境光 + 方向光，war3map.shd 烘焙阴影（每 128 码地块 4×4 个阴影格，第 0 行在南） ---
  /** 阴影图纹理（ALPHA，线性过滤），没有阴影数据时为 1×1 的 0 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shadowTexture = (self: any): { tex: WebGLTexture; tiles: [number, number] } | null => {
    if (self.__wc3Shadow !== undefined) return self.__wc3Shadow;
    const gl: WebGLRenderingContext = self.viewer.gl;
    let bytes: Uint8Array | null = null;
    try {
      bytes = self.map?.get?.('war3map.shd')?.bytes?.() ?? null;
    } catch {
      bytes = null;
    }
    const w = (self.columns || 0) * 4;
    const h = (self.rows || 0) * 4;
    const tex = gl.createTexture();
    if (!tex) return (self.__wc3Shadow = null);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    let ok = false;
    if (bytes && w > 0 && h > 0 && bytes.length >= w * h) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, w, h, 0, gl.ALPHA, gl.UNSIGNED_BYTE, bytes.subarray(0, w * h));
      ok = true;
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, 1, 1, 0, gl.ALPHA, gl.UNSIGNED_BYTE, new Uint8Array([0]));
      if (bytes) console.warn('[wc3] war3map.shd size mismatch', bytes.length, w, h);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    self.__wc3Shadow = ok ? { tex, tiles: [self.columns, self.rows] } : { tex, tiles: [1, 1] };
    self.__wc3ShadowOk = ok;
    return self.__wc3Shadow;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyLight = (self: any, shader: any, unit: number): void => {
    if (!shader?.uniforms) return;
    const gl: WebGLRenderingContext = self.viewer.gl;
    const light: DncLight = self.viewer.__wc3Light || dncLight(12);
    const sh = shadowTexture(self);
    const u = shader.uniforms;
    shader.use();
    gl.uniform3fv(u['u_wc3LightDir'], light.dir);
    gl.uniform3fv(u['u_wc3Diffuse'], light.diffuse);
    gl.uniform3fv(u['u_wc3Ambient'], light.ambientTerrain);
    const on = !!sh && !!self.__wc3ShadowOk && self.viewer.__wc3ShadowsOff !== true;
    gl.uniform1f(u['u_shadowOn'], on ? 1 : 0);
    if (sh) {
      gl.uniform2f(u['u_shadowTiles'], sh.tiles[0], sh.tiles[1]);
      gl.uniform1i(u['u_shadowMap'], unit);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, sh.tex);
    }
  };

  const origRenderGround = War3MapViewerMap.prototype.renderGround;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  War3MapViewerMap.prototype.renderGround = function renderGroundLit(this: any) {
    // 地面贴图占 0..N-1 号纹理单元、高度图 15 号；阴影图放 14 号（DotA 只有 10 张地面贴图）
    if (this.terrainReady && (this.tilesetTextures?.length || 0) < 15) {
      try {
        applyLight(this, this.viewer.groundShader, 14);
      } catch (e) {
        console.warn('[wc3] ground light uniforms failed', e);
      }
    }
    return origRenderGround.call(this);
  };

  const origRenderCliffs = War3MapViewerMap.prototype.renderCliffs;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  War3MapViewerMap.prototype.renderCliffs = function renderCliffsLit(this: any) {
    // 悬崖：高度图 0 号、两张岩石贴图 1/2 号；阴影图放 3 号
    if (this.cliffsReady) {
      try {
        applyLight(this, this.viewer.cliffShader, 3);
      } catch (e) {
        console.warn('[wc3] cliff light uniforms failed', e);
      }
    }
    return origRenderCliffs.call(this);
  };
}
