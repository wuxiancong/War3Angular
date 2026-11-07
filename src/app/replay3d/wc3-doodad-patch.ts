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
      if (numVar > 1) leaf += Math.min(variation, numVar - 1);
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
          full = numVar > 1 ? `${full}${Math.min(variation, numVar - 1)}.mdx` : `${full}.mdx`;
        }
        paths.unshift(full);
      }
      paths.push(leaf);
      // --- AI 修改开始 [DOODAD-PATH]：去重候选模型路径，避免重复请求同一路径 ---
      return Array.from(new Set(paths));
      // --- AI 修改结束 [DOODAD-PATH]：去重候选模型路径，避免重复请求同一路径 ---
    };

    for (const doodad of parser.doodads) {
      try {
        const row = this.viewer.doodadsData.getRow(doodad.id);
        if (!row) continue;
        let file = row.string('file');
        if (!file) continue;
        // --- AI 修改开始 [DOODAD-FILTER]：跳过地图编辑器专用隐藏辅助物（视野阻断器、路径阻断器、荒芜地表标记） ---
        if (/LOSBlocker|PathingBlocker|BlightDoodad/i.test(file)) continue;
        // --- AI 修改结束 [DOODAD-FILTER]：跳过地图编辑器专用隐藏辅助物（视野阻断器、路径阻断器、荒芜地表标记） ---
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

  // --- AI 修改开始 [CLIFF-SAFE]：限制悬崖层级差在 0..2（A..C）内并保护悬崖纹理索引，防止 DotA 多层悬崖产生 NaN 路径 ---
  War3MapViewerMap.prototype.cliffFileName = function cliffFileNameSafe(
    bottomLeftLayer: number,
    bottomRightLayer: number,
    topLeftLayer: number,
    topRightLayer: number,
    base: number
  ): string {
    const clampChar = (layer: number) =>
      String.fromCharCode(65 + Math.max(0, Math.min(2, layer - base)));
    return (
      clampChar(bottomLeftLayer) +
      clampChar(topLeftLayer) +
      clampChar(topRightLayer) +
      clampChar(bottomRightLayer)
    );
  };

  const origCliffGroundIndex = War3MapViewerMap.prototype.cliffGroundIndex;
  War3MapViewerMap.prototype.cliffGroundIndex = function cliffGroundIndexSafe(
    this: any,
    whichCliff: number
  ): number {
    if (!this.cliffTilesets?.length) return 0;
    const clamped = Math.max(0, Math.min(this.cliffTilesets.length - 1, whichCliff | 0));
    if (!this.cliffTilesets[clamped]) return 0;
    return origCliffGroundIndex.call(this, clamped);
  };
  // --- AI 修改结束 [CLIFF-SAFE]：限制悬崖层级差在 0..2（A..C）内并保护悬崖纹理索引，防止 DotA 多层悬崖产生 NaN 路径 ---

  /**
   * Cliff MDX loads can hang / reject (missing geoset, path case). Without
   * cliffsReady the 2-step cliff tiles stay empty holes. Wrap the stock loader
   * so terrain still finishes and partial cliff models are kept.
   */
  const origLoadTerrain = War3MapViewerMap.prototype.loadTerrainCliffsAndWater;
  War3MapViewerMap.prototype.loadTerrainCliffsAndWater =
    async function loadTerrainCliffsAndWaterSafe(this: any) {
      try {
        await Promise.race([
          origLoadTerrain.call(this),
          new Promise<void>((resolve) => setTimeout(resolve, 10000)),
        ]);
      } catch (e) {
        console.warn('[wc3] loadTerrainCliffsAndWater failed', e);
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
