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
import sdVertMod from 'mdx-m3-viewer/dist/cjs/viewer/handlers/mdx/shaders/sd.vert.js';
import sdFragMod from 'mdx-m3-viewer/dist/cjs/viewer/handlers/mdx/shaders/sd.frag.js';

/** MDX 标清模型着色器源码（用来换成原版光照） */
export function loadSdShaderSources(): { vert: string; frag: string } {
  return { vert: String(unwrap(sdVertMod)), frag: String(unwrap(sdFragMod)) };
}

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
      ModelViewer: viewerNs.ModelViewer,
      handlers: viewerNs.handlers,
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
    ModelViewer: viewerNs.ModelViewer,
    handlers: viewerNs.handlers,
    War3MapViewer,
    War3Map: unwrap(war3MapMod),
    War3MapViewerMap: unwrap(war3MapViewerMapMod),
    MappedDataRow,
    DooFile: unwrap(dooFileMod),
    Doodad: unwrap(doodadMod),
    TerrainDoodad: unwrap(terrainDoodadMod),
  };
}
