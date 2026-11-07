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
      // --- AI 删除开始 [DOODAD-PATH]：避免向本身已带数字后缀的模型名（如 Obelisk2）再次追加变体编号 ---
      // if (numVar > 1) leaf += Math.min(variation, numVar - 1);
      // --- AI 删除结束 [DOODAD-PATH] ---
      // --- AI 修改开始 [DOODAD-PATH]：仅当模型基础名末尾不含数字时才追加变体编号 ---
      const canAppendVar = numVar > 1 && !/\d$/.test(stem);
      if (canAppendVar) leaf += Math.min(variation, numVar - 1);
      // --- AI 修改结束 [DOODAD-PATH]：仅当模型基础名末尾不含数字时才追加变体编号 ---
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
          // --- AI 删除开始 [DOODAD-PATH]：避免向末尾已有数字的完整路径再次追加变体号 ---
          // full = numVar > 1 ? `${full}${Math.min(variation, numVar - 1)}.mdx` : `${full}.mdx`;
          // --- AI 删除结束 [DOODAD-PATH] ---
          // --- AI 修改开始 [DOODAD-PATH]：完整路径仅在末尾无数字时追加变体号 ---
          full = canAppendVar ? `${full}${Math.min(variation, numVar - 1)}.mdx` : `${full}.mdx`;
          // --- AI 修改结束 [DOODAD-PATH]：完整路径仅在末尾无数字时追加变体号 ---
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

  // --- AI 修改开始 [CLIFF-SAFE]：限制悬崖层级差在 0..2（A..C）内、斜坡格按平滑地面渲染，并启用地面与悬崖法线光照 ---
  War3MapViewerMap.prototype.isCliff = function isCliffWithRampSupport(
    this: any,
    column: number,
    row: number
  ): boolean {
    const corners = this.corners;
    if (!corners?.[row]?.[column] || !corners?.[row + 1]?.[column + 1]) return false;
    const c00 = corners[row][column];
    const c10 = corners[row][column + 1];
    const c01 = corners[row + 1][column];
    const c11 = corners[row + 1][column + 1];
    const l00 = c00.layerHeight;
    const l10 = c10.layerHeight;
    const l01 = c01.layerHeight;
    const l11 = c11.layerHeight;
    if (l00 === l10 && l00 === l01 && l00 === l11) return false;
    const rampCount =
      (c00.ramp ? 1 : 0) + (c10.ramp ? 1 : 0) + (c01.ramp ? 1 : 0) + (c11.ramp ? 1 : 0);
    if (rampCount >= 2) return false;
    const minL = Math.min(l00, l10, l01, l11);
    const maxL = Math.max(l00, l10, l01, l11);
    if (maxL - minL > 2) return false;
    return true;
  };

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
  // --- AI 修改结束 [CLIFF-SAFE]：限制悬崖层级差在 0..2（A..C）内、斜坡格按平滑地面渲染，并启用地面与悬崖法线光照 ---

  /**
   * Cliff MDX loads can hang / reject (missing geoset, path case). Without
   * cliffsReady the 2-step cliff tiles stay empty holes. Wrap the stock loader
   * so terrain still finishes and partial cliff models are kept.
   */
  const origLoadTerrain = War3MapViewerMap.prototype.loadTerrainCliffsAndWater;
  War3MapViewerMap.prototype.loadTerrainCliffsAndWater =
    async function loadTerrainCliffsAndWaterSafe(this: any) {
      // --- AI 修改开始 [TERRAIN-LIGHTING]：为地形与悬崖着色器开启魔兽3斜向日照阴影，凸显高低地势与河谷落差 ---
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
            varying vec3 v_normal;
            varying float v_height;
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
                float hL = texture2D(u_heightMap, vec2(base - vec2(1.0, 0.0)) / u_size).a;
                float hR = texture2D(u_heightMap, vec2(base + vec2(1.0, 0.0)) / u_size).a;
                float hD = texture2D(u_heightMap, vec2(base - vec2(0.0, 1.0)) / u_size).a;
                float hU = texture2D(u_heightMap, vec2(base + vec2(0.0, 1.0)) / u_size).a;
                v_normal = normalize(vec3((hL - hR) * 1.8, (hD - hU) * 1.8, 1.35));
                v_height = height;
                gl_Position = u_VP * vec4(base * 128.0 + u_offset, height * 128.0, 1.0);
              } else {
                v_tilesets = vec4(0.0);
                v_uv[0] = vec2(0.0); v_uv[1] = vec2(0.0); v_uv[2] = vec2(0.0); v_uv[3] = vec2(0.0);
                v_normal = vec3(0.0, 0.0, 1.0);
                v_height = 6.0;
                gl_Position = vec4(0.0);
              }
            }
          `;
          const groundFrag = `
            precision mediump float;
            uniform sampler2D u_tilesets[15];
            varying vec4 v_tilesets;
            varying vec2 v_uv[4];
            varying vec3 v_normal;
            varying float v_height;
            const vec3 lightDir = normalize(vec3(-0.45, -0.45, 0.77));
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
              float ndotl = clamp(dot(normalize(v_normal), lightDir), 0.0, 1.0);
              float elevBoost = clamp((v_height - 6.0) * 0.045, -0.08, 0.14);
              float shade = clamp(0.56 + ndotl * 0.46 + elevBoost, 0.48, 1.15);
              gl_FragColor = vec4(color.rgb * shade, 1.0);
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
              float ndotl = clamp(dot(normalize(v_normal), lightDir), 0.0, 1.0);
              float shade = clamp(0.52 + ndotl * 0.52, 0.45, 1.12);
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
      // --- AI 修改结束 [TERRAIN-LIGHTING]：为地形与悬崖着色器开启魔兽3斜向日照阴影，凸显高低地势与河谷落差 ---
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
