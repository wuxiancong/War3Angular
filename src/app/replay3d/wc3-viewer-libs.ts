/**
 * Static imports so Angular/Vite bundles these into this chunk.
 */
import viewerIndex from 'mdx-m3-viewer/dist/cjs/viewer/index.js';
import war3MapMod from 'mdx-m3-viewer/dist/cjs/parsers/w3x/map.js';
import war3MapViewerMapMod from 'mdx-m3-viewer/dist/cjs/viewer/handlers/w3x/map.js';
import * as mappedDataNs from 'mdx-m3-viewer/dist/cjs/utils/mappeddata.js';
import dooFileMod from 'mdx-m3-viewer/dist/cjs/parsers/w3x/doo/file.js';
import doodadMod from 'mdx-m3-viewer/dist/cjs/viewer/handlers/w3x/doodad.js';
import terrainDoodadMod from 'mdx-m3-viewer/dist/cjs/viewer/handlers/w3x/terraindoodad.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(m: any): any {
  return m?.default?.default ?? m?.default ?? m;
}

export function loadWc3ViewerLibs() {
  const viewerNs = unwrap(viewerIndex);
  const War3MapViewer = viewerNs.handlers?.War3MapViewer;
  if (!War3MapViewer) {
    throw new Error('mdx-m3-viewer handlers.War3MapViewer 不可用');
  }
  const mapped: any = mappedDataNs;
  const MappedDataRow =
    mapped.MappedDataRow ||
    mapped.default?.MappedDataRow ||
    mapped.default?.default?.MappedDataRow;
  if (!MappedDataRow) {
    // Fallback: tiny row clone compatible with applyModificationTable
    class FallbackRow {
      map: Record<string, string> = {};
      set(key: string, value: unknown) {
        this.map[String(key).toLowerCase()] = String(value);
      }
      string(key: string) {
        return this.map[String(key).toLowerCase()];
      }
      number(key: string) {
        return parseFloat(this.string(key) || '0') || 0;
      }
    }
    return {
      // --- AI 修改开始 [PORTRAIT-3D]：导出 ModelViewer 与 handlers 以渲染控制台 3D 动态英雄肖像 ---
      ModelViewer: viewerNs.ModelViewer,
      handlers: viewerNs.handlers,
      // --- AI 修改结束 [PORTRAIT-3D]：导出 ModelViewer 与 handlers 以渲染控制台 3D 动态英雄肖像 ---
      War3MapViewer,
      War3Map: unwrap(war3MapMod),
      War3MapViewerMap: unwrap(war3MapViewerMapMod),
      MappedDataRow: FallbackRow,
      DooFile: unwrap(dooFileMod),
      Doodad: unwrap(doodadMod),
      TerrainDoodad: unwrap(terrainDoodadMod),
    };
  }
  return {
    // --- AI 修改开始 [PORTRAIT-3D]：导出 ModelViewer 与 handlers 以渲染控制台 3D 动态英雄肖像 ---
    ModelViewer: viewerNs.ModelViewer,
    handlers: viewerNs.handlers,
    // --- AI 修改结束 [PORTRAIT-3D]：导出 ModelViewer 与 handlers 以渲染控制台 3D 动态英雄肖像 ---
    War3MapViewer,
    War3Map: unwrap(war3MapMod),
    War3MapViewerMap: unwrap(war3MapViewerMapMod),
    MappedDataRow,
    DooFile: unwrap(dooFileMod),
    Doodad: unwrap(doodadMod),
    TerrainDoodad: unwrap(terrainDoodadMod),
  };
}
