export type DotaBuildingKind =
  | 'fountain'
  | 'ancient'
  | 'tower'
  | 'rax'
  | 'rax_melee'
  | 'rax_range'
  | 'shop'
  | 'side_shop'
  | 'secret_shop'
  | 'altar';

export interface DotaMapBounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface DotaBuilding {
  id: string;
  name: string;
  team: 0 | 1;
  kind: DotaBuildingKind;
  x: number;
  y: number;
  // 支持从 war3map.j 提取的独立模型路径、朝向与缩放
  facing?: number;
  scale?: number;
  model?: string;
}

export interface DotaMapConfig {
  mapId: string;
  bounds: DotaMapBounds;
  minimap: string;
  note?: string;
  buildings: DotaBuilding[];
}

export const DEFAULT_DOTA_MAP_URL = '/assets/maps/dota683/buildings.json';
export const DEFAULT_SCENE_SYNC_URL = '/assets/maps/dota683/scene-sync.json';

/** Radiant fountain-adjacent spawn (spectator default look-at). */
export const RADIANT_SPAWN = { x: -6950, y: -6750 };

export function mapCenter(bounds: DotaMapBounds): { x: number; y: number } {
  return {
    x: (bounds.x0 + bounds.x1) / 2,
    y: (bounds.y0 + bounds.y1) / 2,
  };
}

export function mapHalfExtents(bounds: DotaMapBounds): { hx: number; hy: number } {
  return {
    hx: (bounds.x1 - bounds.x0) / 2,
    hy: (bounds.y1 - bounds.y0) / 2,
  };
}

export function buildingMarkerRadiusPx(kind: DotaBuildingKind, mapSize: number): number {
  const base = mapSize / 1024;
  switch (kind) {
    case 'ancient':
      return 10 * base;
    case 'fountain':
      return 12 * base;
    case 'shop':
    case 'side_shop':
    case 'secret_shop':
    case 'altar':
      return 6 * base;
    case 'rax':
    case 'rax_melee':
    case 'rax_range':
      return 7 * base;
    case 'tower':
    default:
      return 5 * base;
  }
}

export function teamColorCss(team: 0 | 1): string {
  return team === 0 ? '#34d399' : '#f472b6';
}

export async function loadDotaMapConfig(url = DEFAULT_DOTA_MAP_URL): Promise<DotaMapConfig> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load DotA map config: ${url}`);
  }
  return (await res.json()) as DotaMapConfig;
}

export function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`地图贴图加载失败: ${url}`));
    img.src = url;
  });
}

/** World XY → canvas pixel (image top = +Y / north). */
export function worldToMapPixel(
  x: number,
  y: number,
  bounds: DotaMapBounds,
  width: number,
  height: number
): { px: number; py: number } {
  const px = ((x - bounds.x0) / (bounds.x1 - bounds.x0)) * width;
  const py = (1 - (y - bounds.y0) / (bounds.y1 - bounds.y0)) * height;
  return { px, py };
}

/** Minimap pixel → world XY. */
export function mapPixelToWorld(
  px: number,
  py: number,
  bounds: DotaMapBounds,
  width: number,
  height: number
): { x: number; y: number } {
  const x = bounds.x0 + (px / Math.max(1, width)) * (bounds.x1 - bounds.x0);
  const y = bounds.y0 + (1 - py / Math.max(1, height)) * (bounds.y1 - bounds.y0);
  return { x, y };
}

export const DOTA_MAP_BOUNDS: DotaMapBounds = {
  x0: -8192,
  x1: 8192,
  y0: -8192,
  y1: 8192,
};

/**
 * Bake DotA minimap + building pins + optional hero spawn into one canvas
 * used as the ground plane texture (no 3D cylinders/boxes).
 */
export async function bakeDotaMapTexture(
  cfg: DotaMapConfig,
  heroSpawn?: { x: number; y: number }
): Promise<HTMLCanvasElement> {
  const img = await loadHtmlImage(cfg.minimap);
  const size = Math.max(img.naturalWidth || img.width, 1024);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建地图 Canvas');
  }

  ctx.fillStyle = '#0a1210';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, size, size);

  const vig = ctx.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, size, size);

  for (const b of cfg.buildings || []) {
    const { px, py } = worldToMapPixel(b.x, b.y, cfg.bounds, size, size);
    const r = buildingMarkerRadiusPx(b.kind, size);
    const fill = teamColorCss(b.team);

    ctx.beginPath();
    ctx.arc(px, py, r + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();

    if (b.kind === 'ancient' || b.kind === 'fountain') {
      ctx.beginPath();
      ctx.arc(px, py, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }

  if (heroSpawn) {
    const { px, py } = worldToMapPixel(heroSpawn.x, heroSpawn.y, cfg.bounds, size, size);
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111';
    ctx.stroke();
  }

  return canvas;
}
