/**
 * Fix War3MapViewerMap doodad loading:
 * - SLK models live at dir\file\fileN.mdx (stock viewer only used bare `file`)
 * - DotA w3b/w3d mods reference missing base IDs → guard applyModificationTable
 */

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
      // DotA 自定义：D00B=Ruins_Shrub 变体、D009=FaerieFire、D000/D001 辅助
      if (/^(D00B|D009|D000|D001)$/i.test(id4)) return true;
      if (/^Abilities\\/i.test(fileNorm) || /FaerieFire/i.test(fileNorm)) return true;
      // 灌木/花/蘑菇/芦苇/冠盖矮树 ID（截图里的「小树木」）
      if (
        /^(ZPsh|ZPfw|APbs|CPbs|YPbs|APms|CPms|CPct|APct|NTtc|ATtc|ZPru|CPlp|LPwh)$/i.test(id4)
      ) {
        return true;
      }
      if (
        /Ruins_Shrub|Ruins_Flower|Ruins_Rush|AshenBush|AshenShrooms|AshenCanopyTree|FelwoodBush|FelwoodCatTail|AshenCatTail|Cityscape\\?Plant|Wheat|CornField|Lilypad|GlowRunes/i.test(
          fileNorm
        )
      ) {
        return true;
      }
      // AshenBush0 等：Bush 后紧跟数字，不能用 \b
      if (/SkullPile|Bones|Bush|Shrub|Flower|Shroom|CatTail|CanopyTree/i.test(fileNorm)) return true;
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
<<<<<<< HEAD
    if (c00.ramp || c10.ramp || c01.ramp || c11.ramp) {
      return false;
    }
=======
    // --- AI 修改开始 [RAMP-AS-SLOPE]：带 ramp 标记的层差格用地面网格三角坡表现，避免当成悬崖 mesh 后看起来「没坡度」 ---
    if (c00.ramp || c10.ramp || c01.ramp || c11.ramp) {
      return false;
    }
    // --- AI 修改结束 [RAMP-AS-SLOPE] ---
>>>>>>> 952f8d2564fdeef192a7ab847a3fd571379ad7b5
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
<<<<<<< HEAD
=======
    // --- AI 修改开始 [CLIFF-HEIGHT]：层差 0..4（A..E）。原版多为 A..C；过严 clamp=2 会在高台缘生成过矮 mesh 呈“坡鼓包”，过高字母无模型会破洞 ---
>>>>>>> 952f8d2564fdeef192a7ab847a3fd571379ad7b5
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

  War3MapViewerMap.prototype.cliffGroundIndex = function cliffGroundIndexMarble(
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

  War3MapViewerMap.prototype.cornerTexture = function cornerTextureMarble(
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
  const origLoadTerrain = War3MapViewerMap.prototype.loadTerrainCliffsAndWater;
  War3MapViewerMap.prototype.loadTerrainCliffsAndWater =
    async function loadTerrainCliffsAndWaterSafe(this: any) {
<<<<<<< HEAD
=======
      // --- AI 修改开始 [RAMP-HEIGHT-SMOOTH]：在 orig 赋值 this.corners 时原地平滑 ramp（须先于 heightMap 烘焙）。DotA 大量 AAAA 同层斜坡仅靠 ramp 标记，不做平滑则永远是平地 ---
>>>>>>> 952f8d2564fdeef192a7ab847a3fd571379ad7b5
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
<<<<<<< HEAD

=======
      // --- AI 修改结束 [RAMP-HEIGHT-SMOOTH] ---

      // --- AI 修改开始 [TERRAIN-LIGHTING]：仅对悬崖垂直岩壁应用法线明暗阴影，保持悬崖水平裙边与相邻地面 1.0 等亮无缝衔接，彻底消除岩石周围方块色差 ---
>>>>>>> 952f8d2564fdeef192a7ab847a3fd571379ad7b5
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
            varying vec4 v_tilesets;
            varying vec2 v_uv[4];
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
                gl_Position = u_VP * vec4(base * 128.0 + u_offset, height * 128.0, 1.0);
              } else {
                v_tilesets = vec4(0.0);
                v_uv[0] = vec2(0.0); v_uv[1] = vec2(0.0); v_uv[2] = vec2(0.0); v_uv[3] = vec2(0.0);
                gl_Position = vec4(0.0);
              }
            }
          `;
          const groundFrag = `
            precision mediump float;
            uniform sampler2D u_tilesets[15];
            varying vec4 v_tilesets;
            varying vec2 v_uv[4];
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
              gl_FragColor = vec4(color.rgb, 1.0);
            }
          `;
          const cliffVert = `
            uniform mat4 u_VP;
            uniform sampler2D u_heightMap;
            uniform vec2 u_pixel;
            uniform vec2 u_centerOffset;
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
            const vec3 lightDir = normalize(vec3(-0.45, -0.45, 0.72));
            vec4 sampleCliff(float texture, vec2 uv) {
              int i = int(texture + 0.1);
              if (i == 0) return texture2D(u_texture1, uv);
              return texture2D(u_texture2, uv);
            }
            void main() {
              vec4 color = sampleCliff(v_texture, v_uv);
              vec3 n = normalize(v_normal);
              float ndotl = clamp(dot(n, lightDir), 0.0, 1.0);
              float rockShade = clamp(0.68 + ndotl * 0.38, 0.62, 1.06);
              float skirtWeight = smoothstep(0.72, 0.94, abs(n.z));
              float shade = mix(rockShade, 1.0, skirtWeight);
              gl_FragColor = vec4(color.rgb * shade, color.a);
            }
          `;
          const newGround = viewer.webgl.createShader(groundVert, groundFrag);
          if (newGround) viewer.groundShader = newGround;
          const newCliff = viewer.webgl.createShader(cliffVert, cliffFrag);
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
}
