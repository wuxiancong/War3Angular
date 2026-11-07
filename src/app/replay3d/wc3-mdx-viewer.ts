import { installMemoryMapLoader, loadDotaNamedMapFiles } from './wc3-memory-map';
import { patchWar3MapViewerMap } from './wc3-doodad-patch';
import {
  RADIANT_SPAWN,
  DOTA_MAP_BOUNDS,
  loadDotaMapConfig,
  DEFAULT_DOTA_MAP_URL,
  type DotaBuildingKind,
  type DotaMapBounds,
} from './dota-map';
import {
  DotaSceneSim,
  applySyncOverrides,
  loadSceneSyncConfig,
  type SceneSyncConfig,
} from './scene-sim';

export interface Wc3SequenceInfo {
  index: number;
  name: string;
}

export interface Wc3MdxViewerOptions {
  canvas: HTMLCanvasElement;
  /** Visible CSS layer; WebGL frames are copied here (Electron compositing workaround). */
  viewLayer?: HTMLElement;
  modelUrl: string;
  assetBaseUrl: string;
  teamColor?: number;
  initialSequence?: number | string;
  /** WC3 game data root (TerrainArt, Doodads, Units, …) */
  wc3BaseUrl?: string;
  heroSpawn?: { x: number; y: number };
  /** Optional overrides for scene-sync.json (live / query). */
  syncOverrides?: Partial<SceneSyncConfig> | null;
}

type DragMode = 'pan' | null;

/**
 * Browser wrapper: War3MapViewer (real 3D terrain) + Blademaster MDX + DotA sim.
 */
export class Wc3MdxViewer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly viewer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance?: any;
  sequences: Wc3SequenceInfo[] = [];
  buildings: unknown[] = [];
  cameraMode: 'hero' | 'map' | 'free' = 'hero';
  mapPreviewUrl = '';
  terrainReady = false;
  simEnabled = true;
  simUnitCount = 0;
  syncConfig?: SceneSyncConfig;

  private raf = 0;
  private disposed = false;
  /** WC3-like: ~60° elevation from horizontal. */
  /** Classic WC3: look from SW, steep pitch (~60° down). */
  private yaw = -Math.PI * 0.75;
  private pitch = 1.05;
  private distance = 1650;
  private target: [number, number, number] = [0, 0, 0];
  private dragMode: DragMode = null;
  private lastX = 0;
  private lastY = 0;
  private pointerX = 0.5;
  private pointerY = 0.5;
  private pointerInside = false;
  private keys = new Set<string>();
  private lastFrame = 0;
  private sim?: DotaSceneSim;
  private readonly modelCache = new Map<string, any>();
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onPointerLeave: () => void;
  private readonly onWheel: (e: WheelEvent) => void;
  private readonly onResize: () => void;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly wc3Base: string;
  private readonly inputEl: HTMLElement;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(
    private readonly options: Wc3MdxViewerOptions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly War3MapViewer: any
  ) {
    const { canvas } = options;
    this.wc3Base = (options.wc3BaseUrl || '/assets/wc3/').replace(/\/?$/, '/');
    // Pointer events go to the visible layer (WebGL canvas is not interactive).
    this.inputEl = options.viewLayer || canvas;

    const pathSolver = (src: unknown) => this.resolveWc3Path(src);
    this.viewer = new War3MapViewer(canvas, pathSolver, false);
    this.scene = this.viewer.worldScene || this.viewer.scenes?.[0];

    this.onPointerDown = (e) => {
      // Spectator/replay: never issue hero orders. Left/middle drag pans camera.
      if (e.button === 0 || e.button === 1) {
        this.dragMode = 'pan';
        this.cameraMode = 'free';
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.inputEl.setPointerCapture(e.pointerId);
      }
    };
    this.onPointerMove = (e) => {
      const rect = this.inputEl.getBoundingClientRect();
      this.pointerInside = true;
      this.pointerX = (e.clientX - rect.left) / Math.max(1, rect.width);
      this.pointerY = (e.clientY - rect.top) / Math.max(1, rect.height);

      if (!this.dragMode) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      const panScale = this.distance * 0.0018;
      // Screen-right / screen-down → world, matching camera yaw (not inverted).
      const [rx, ry, dxw, dyw] = this.screenPanAxes();
      this.target[0] += (dx * rx + dy * dxw) * panScale;
      this.target[1] += (dx * ry + dy * dyw) * panScale;
      this.clampTargetToMap();
      this.updateCamera();
    };
    this.onPointerUp = (e) => {
      this.dragMode = null;
      try {
        this.inputEl.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    this.onPointerLeave = () => {
      this.pointerInside = false;
    };
    this.onWheel = (e) => {
      e.preventDefault();
      this.distance *= e.deltaY > 0 ? 1.12 : 0.89;
      const minD = this.cameraMode === 'map' ? 4000 : 900;
      const maxD = this.cameraMode === 'map' ? 48000 : 4500;
      this.distance = Math.max(minD, Math.min(maxD, this.distance));
      this.updateCamera();
    };
    this.onResize = () => {
      const rect = this.inputEl.getBoundingClientRect();
      const w = Math.max(640, Math.floor(rect.width) || canvas.width);
      const h = Math.max(360, Math.floor(rect.height) || canvas.height);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      this.updateCamera();
    };
    this.onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(k)) {
        this.keys.add(k);
        this.cameraMode = 'free';
        e.preventDefault();
      }
    };
    this.onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());

    this.inputEl.addEventListener('pointerdown', this.onPointerDown);
    this.inputEl.addEventListener('pointermove', this.onPointerMove);
    this.inputEl.addEventListener('pointerup', this.onPointerUp);
    this.inputEl.addEventListener('pointercancel', this.onPointerUp);
    this.inputEl.addEventListener('pointerleave', this.onPointerLeave);
    this.inputEl.addEventListener('wheel', this.onWheel, { passive: false });
    this.inputEl.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  static async create(options: Wc3MdxViewerOptions): Promise<Wc3MdxViewer> {
    const g = globalThis as any;
    if (!g.process) {
      g.process = { env: { NODE_ENV: 'development' }, browser: true };
    }
    const { loadWc3ViewerLibs } = await import('./wc3-viewer-libs');
    const libs = loadWc3ViewerLibs();
    patchWar3MapViewerMap(libs);
    (Wc3MdxViewer as any)._War3Map = libs.War3Map;

    // Cursor/Electron WebGL often clears the drawing buffer before compositing;
    // force preserveDrawingBuffer so the canvas is actually visible on screen.
    const canvasProto = HTMLCanvasElement.prototype as any;
    const origGetContext = canvasProto.getContext;
    canvasProto.getContext = function getContextPreserved(
      this: HTMLCanvasElement,
      type: string,
      attrs?: WebGLContextAttributes
    ) {
      if (type === 'webgl' || type === 'experimental-webgl') {
        attrs = { ...(attrs || {}), alpha: false, preserveDrawingBuffer: true };
      }
      return origGetContext.call(this, type, attrs);
    };
    try {
      return new Wc3MdxViewer(options, libs.War3MapViewer);
    } finally {
      canvasProto.getContext = origGetContext;
    }
  }

  async load(): Promise<void> {
    await this.waitBaseFiles();
    this.patchMissingTilesets();

    const named = await loadDotaNamedMapFiles();
    const War3Map = (Wc3MdxViewer as any)._War3Map;
    installMemoryMapLoader(War3Map, named);

    this.viewer.loadMap(new Uint8Array(32));
    const map = this.viewer.map;
    if (!map) {
      throw new Error('War3MapViewer.loadMap 失败');
    }

    // Terrain first — start rendering as soon as the heightmap exists.
    await this.waitUntil(() => !!map.terrainReady, 60000, '地形网格');
    if (!map.cliffsReady) {
      map.cliffModels = (map.cliffModels || []).filter(Boolean);
      map.cliffsReady = true;
    }
    this.terrainReady = true;
    this.scene = map.worldScene;
    if (this.scene?.color) {
      this.scene.color[0] = 0.05;
      this.scene.color[1] = 0.1;
      this.scene.color[2] = 0.06;
    }
    this.onResize();

    // Aim camera at radiant fountain — classic WC3 high angle.
    const spawn = this.options.heroSpawn || RADIANT_SPAWN;
    const z0 = this.sampleHeight(spawn.x, spawn.y);
    this.target = [spawn.x, spawn.y, z0 + 90];
    this.applyWc3GameplayCamera();
    this.updateCamera();
    this.startLoop();

    // Brief wait for trees; never block on whenAllLoaded (missing doodads hang forever).
    await Promise.race([
      this.waitUntil(() => (map.doodads?.length || 0) > 50, 4000, '树木装饰'),
      new Promise((r) => setTimeout(r, 2500)),
    ]).catch(() => undefined);

    await Promise.race([
      this.placeDotaBuildings(),
      new Promise((r) => setTimeout(r, 6000)),
    ]);
    this.buildings = [...(map.doodads || []), ...(this.buildings || [])];

    const z = this.sampleHeight(spawn.x, spawn.y);
    const heroSolver = (src: unknown) => this.resolveHeroPath(src);
    const model = await Promise.race([
      this.viewer.load(this.options.modelUrl, heroSolver),
      new Promise<null>((r) => setTimeout(() => r(null), 20000)),
    ]);
    if (!model) {
      // Terrain is already on screen — do not black-out the whole page.
      console.warn('[wc3] hero MDX load failed/timeout; keeping terrain view');
      this.setCameraMode('free');
      return;
    }

    this.model = model;
    this.sequences = (model.sequences || []).map(
      (s: { name?: string }, index: number): Wc3SequenceInfo => ({
        index,
        name: String(s.name || `Sequence ${index}`).replace(/\0/g, '').trim(),
      })
    );

    const instance = model.addInstance();
    instance.setScene(this.scene);
    instance.setTeamColor(this.options.teamColor ?? 0);
    instance.setSequenceLoopMode(2);
    instance.setLocation([spawn.x, spawn.y, z]);
    instance.setUniformScale(1);

    const initial = this.resolveSequenceId(this.options.initialSequence ?? 'Stand');
    instance.setSequence(initial >= 0 ? initial : 7);
    this.instance = instance;

    await this.initSceneSim();
    this.setCameraMode('hero');
  }

  private buildingModelSpec(
    kind: DotaBuildingKind
  ): { radiant: string; dire: string; scale?: number } | null {
    const table: Record<string, { radiant: string; dire: string; scale?: number }> = {
      fountain: {
        radiant: 'Buildings\\Other\\FountainOfLife\\FountainOfHealth.mdx',
        dire: 'Buildings\\Other\\FountainOfMana\\FountainOfMana.mdx',
        scale: 1.1,
      },
      ancient: {
        radiant: 'Buildings\\NightElf\\TreeofLife\\TreeofLife.mdx',
        dire: 'Buildings\\Undead\\Necropolis\\Necropolis.mdx',
        scale: 1.35,
      },
      rax: {
        radiant: 'Buildings\\Orc\\GreatHall\\GreatHall.mdx',
        dire: 'Buildings\\Undead\\Ziggurat\\Ziggurat.mdx',
        scale: 0.85,
      },
      rax_melee: {
        radiant: 'Buildings\\Human\\TownHall\\TownHall.mdx',
        dire: 'Buildings\\Undead\\TempleOfTheDamned\\TempleOfTheDamned.mdx',
        scale: 0.8,
      },
      rax_range: {
        radiant: 'Buildings\\NightElf\\ChimaeraRoost\\ChimaeraRoost.mdx',
        dire: 'Buildings\\Undead\\Ziggurat\\Ziggurat.mdx',
        scale: 0.85,
      },
      tower: {
        radiant: 'Buildings\\NightElf\\AncientProtector\\AncientProtector.mdx',
        dire: 'Buildings\\Orc\\WatchTower\\WatchTower.mdx',
        scale: 1.0,
      },
      shop: {
        radiant: 'Buildings\\Other\\MagicVault\\MagicVault.mdx',
        dire: 'Buildings\\Other\\MagicVault\\MagicVault.mdx',
        scale: 1.05,
      },
      side_shop: {
        radiant: 'Buildings\\Other\\BookOfSummoning\\BookOfSummoning.mdx',
        dire: 'Buildings\\Other\\BookOfSummoning\\BookOfSummoning.mdx',
        scale: 0.95,
      },
      secret_shop: {
        radiant: 'Buildings\\Other\\BookOfSummoning\\BookOfSummoning.mdx',
        dire: 'Buildings\\Other\\BookOfSummoning\\BookOfSummoning.mdx',
        scale: 1.1,
      },
      altar: {
        radiant: 'Buildings\\NightElf\\ChimaeraRoost\\ChimaeraRoost.mdx',
        dire: 'Buildings\\Undead\\TempleOfTheDamned\\TempleOfTheDamned.mdx',
        scale: 0.75,
      },
    };
    return table[kind] || null;
  }

  /** Place towers / rax / shops / ancient / fountain from buildings.json. */
  private async placeDotaBuildings(): Promise<void> {
    const cfg = await loadDotaMapConfig(DEFAULT_DOTA_MAP_URL);
    const placed: unknown[] = [];
    const failed = new Set<string>();
    const inflight = new Map<string, Promise<any | null>>();

    const loadModel = (path: string): Promise<any | null> => {
      if (this.modelCache.has(path)) return Promise.resolve(this.modelCache.get(path));
      if (failed.has(path)) return Promise.resolve(null);
      const existing = inflight.get(path);
      if (existing) return existing;
      const p = Promise.race([
        this.viewer.load(path, (src: unknown) => this.resolveWc3Path(src)),
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
      ]).then((model) => {
        inflight.delete(path);
        if (!model) {
          failed.add(path);
          console.warn('[wc3] building model missing/timeout', path);
          return null;
        }
        this.modelCache.set(path, model);
        return model;
      });
      inflight.set(path, p);
      return p;
    };

    // Prefetch unique paths in parallel so one slow shop MDX doesn't serialize the base.
    const uniquePaths = new Set<string>();
    for (const b of cfg.buildings || []) {
      const spec = this.buildingModelSpec(b.kind);
      if (!spec) continue;
      uniquePaths.add(b.team === 1 ? spec.dire : spec.radiant);
    }
    await Promise.all([...uniquePaths].map((p) => loadModel(p)));

    for (const b of cfg.buildings || []) {
      const spec = this.buildingModelSpec(b.kind);
      if (!spec) continue;
      const path = b.team === 1 ? spec.dire : spec.radiant;
      const model = await loadModel(path);
      if (!model) continue;
      const inst = model.addInstance();
      inst.setScene(this.scene);
      inst.setTeamColor(b.team === 1 ? 1 : 0);
      inst.setSequenceLoopMode(2);
      const z = this.sampleHeight(b.x, b.y);
      inst.setLocation([b.x, b.y, z]);
      inst.setUniformScale(spec.scale ?? 1);
      if (model.sequences?.length) inst.setSequence(0);
      placed.push({ id: b.id, kind: b.kind, instance: inst });
    }
    this.buildings = placed;
  }

  private async initSceneSim(): Promise<void> {
    const base = await loadSceneSyncConfig();
    this.syncConfig = applySyncOverrides(base, this.options.syncOverrides);
    this.simEnabled = !!this.syncConfig.enabled;
    if (!this.simEnabled) return;

    this.sim = new DotaSceneSim(
      this.syncConfig,
      (x, y) => this.sampleHeight(x, y),
      (opts) => this.spawnUnitInstance(opts),
      this.instance,
      (name) => this.resolveSequenceId(name)
    );
    await this.sim.bootstrap();
    this.simUnitCount = this.sim.units.length;
  }

  private async spawnUnitInstance(opts: {
    path: string;
    x: number;
    y: number;
    z: number;
    teamColor: number;
    scale: number;
    sequenceHint?: string;
  }): Promise<any | null> {
    let model = this.modelCache.get(opts.path);
    if (!model) {
      model = await this.viewer.load(opts.path, (src: unknown) => this.resolveWc3Path(src));
      if (!model) {
        // Fallback: tiny hero clone if Wisp missing.
        model = this.model;
      }
      if (!model) return null;
      this.modelCache.set(opts.path, model);
    }
    const inst = model.addInstance();
    inst.setScene(this.scene);
    inst.setTeamColor(opts.teamColor);
    inst.setSequenceLoopMode(2);
    inst.setLocation([opts.x, opts.y, opts.z]);
    inst.setUniformScale(opts.scale);
    if (model.sequences?.length) {
      const hint = (opts.sequenceHint || 'Stand').toLowerCase();
      let idx = (model.sequences as { name?: string }[]).findIndex((s) =>
        String(s.name || '')
          .toLowerCase()
          .includes(hint)
      );
      if (idx < 0) idx = 0;
      inst.setSequence(idx);
    }
    return inst;
  }

  playSequence(idOrName: number | string): void {
    if (!this.instance) return;
    const id = this.resolveSequenceId(idOrName);
    if (id < 0) return;
    this.instance.setSequence(id);
  }

  currentSequence(): number {
    return this.instance?.sequence ?? -1;
  }

  setHeroWorldPosition(x: number, y: number, z?: number): void {
    const h = z ?? this.sampleHeight(x, y);
    this.instance?.setLocation([x, y, h]);
    if (this.cameraMode === 'hero') {
      this.target = [x, y, h + 80];
      this.updateCamera();
    }
  }

  /** Replay only: apply action-pack / sync driven hero pose (not player input). */
  applyHeroAction(action: {
    x?: number;
    y?: number;
    sequence?: number | string;
  }): void {
    if (action.x != null && action.y != null) {
      this.setHeroWorldPosition(action.x, action.y);
    }
    if (action.sequence != null) {
      this.playSequence(action.sequence);
    }
  }

  moveHeroTo(_x: number, _y: number): void {
    // Disabled in spectator/replay mode.
  }

  setSimEnabled(on: boolean): void {
    this.simEnabled = on;
    if (this.syncConfig) this.syncConfig.enabled = on;
    if (this.sim) this.sim.cfg.enabled = on;
  }

  applySyncOverrides(overrides: Partial<SceneSyncConfig>): void {
    if (!this.syncConfig) return;
    this.syncConfig = applySyncOverrides(this.syncConfig, overrides);
    this.sim?.setConfig(this.syncConfig);
    this.simEnabled = !!this.syncConfig.enabled;
  }

  /** Fixed WC3 spectator angle (no free-orbit tilt). */
  private applyWc3GameplayCamera(): void {
    this.distance = 1650;
    this.pitch = 1.05; // ~60° from horizontal — matches Frozen Throne console view
    this.yaw = -Math.PI * 0.75; // from southwest
  }

  setCameraMode(mode: 'hero' | 'map' | 'free'): void {
    this.cameraMode = mode;
    const map = this.viewer.map;
    if (mode === 'map' && map?.centerOffset && map?.mapSize) {
      const cx = map.centerOffset[0] + ((map.mapSize[0] - 1) * 128) / 2;
      const cy = map.centerOffset[1] + ((map.mapSize[1] - 1) * 128) / 2;
      const cz = this.sampleHeight(cx, cy);
      this.target = [cx, cy, cz + 80];
      this.distance = 14000;
      this.pitch = 1.15;
      this.yaw = -Math.PI * 0.75;
    } else if ((mode === 'hero' || mode === 'free') && this.instance) {
      const loc = this.instance.localLocation || this.instance.location || [0, 0, 0];
      this.target = [loc[0] || 0, loc[1] || 0, (loc[2] || 0) + 90];
      this.applyWc3GameplayCamera();
    } else {
      this.applyWc3GameplayCamera();
    }
    this.clampTargetToMap();
    this.updateCamera();
  }

  /** Playable world AABB (from w3e or DotA defaults). */
  getMapBounds(): DotaMapBounds {
    const map = this.viewer.map;
    if (map?.centerOffset && map?.mapSize) {
      const x0 = map.centerOffset[0];
      const y0 = map.centerOffset[1];
      const x1 = x0 + (map.mapSize[0] - 1) * 128;
      const y1 = y0 + (map.mapSize[1] - 1) * 128;
      return { x0, x1, y0, y1 };
    }
    return { ...DOTA_MAP_BOUNDS };
  }

  getCameraFocus(): { x: number; y: number; z: number } {
    return { x: this.target[0], y: this.target[1], z: this.target[2] };
  }

  /** Spectator: jump camera focus to world XY (minimap click). */
  panCameraTo(x: number, y: number): void {
    this.cameraMode = 'free';
    this.target[0] = x;
    this.target[1] = y;
    this.clampTargetToMap();
    this.updateCamera();
  }

  private clampTargetToMap(): void {
    const b = this.getMapBounds();
    const m = 384; // keep focus inside playable cells
    this.target[0] = Math.max(b.x0 + m, Math.min(b.x1 - m, this.target[0]));
    this.target[1] = Math.max(b.y0 + m, Math.min(b.y1 - m, this.target[1]));
    this.target[2] = this.sampleHeight(this.target[0], this.target[1]) + 80;
  }

  resetCamera(): void {
    this.setCameraMode(this.cameraMode === 'free' ? 'hero' : this.cameraMode);
  }

  dispose(): void {
    this.disposed = true;
    this.sim?.dispose();
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.raf);
    }
    this.inputEl.removeEventListener('pointerdown', this.onPointerDown);
    this.inputEl.removeEventListener('pointermove', this.onPointerMove);
    this.inputEl.removeEventListener('pointerup', this.onPointerUp);
    this.inputEl.removeEventListener('pointercancel', this.onPointerUp);
    this.inputEl.removeEventListener('pointerleave', this.onPointerLeave);
    this.inputEl.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    try {
      this.viewer.map?.die?.();
    } catch {
      /* ignore */
    }
  }

  sampleHeight(x: number, y: number): number {
    const map = this.viewer.map;
    if (!map?.corners?.length || !map.centerOffset) return 0;
    const col = Math.floor((x - map.centerOffset[0]) / 128);
    const row = Math.floor((y - map.centerOffset[1]) / 128);
    const corner = map.corners[row]?.[col];
    if (!corner) return 0;
    return (corner.groundHeight + corner.layerHeight - 2) * 128;
  }

  /** Approximate ground pick: ray vs z = sampleHeight plane near target. */
  private pickGround(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = this.options.canvas;
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    // Camera position
    const [tx, ty, tz] = this.target;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cx = tx + this.distance * cp * cy;
    const camY = ty + this.distance * cp * sy;
    const camZ = tz + this.distance * sp;
    // Build rough look basis
    const fx = tx - cx;
    const fy = ty - camY;
    const fz = tz - camZ;
    const fl = Math.hypot(fx, fy, fz) || 1;
    const f0 = fx / fl;
    const f1 = fy / fl;
    const f2 = fz / fl;
    // right = forward × up
    let rx = f1 * 0 - f2 * 1;
    let ry = f2 * 0 - f0 * 0;
    let rz = f0 * 1 - f1 * 0;
    // Actually up is (0,0,1): right = forward × up
    rx = f1 * 1 - f2 * 0;
    ry = f2 * 0 - f0 * 1;
    rz = f0 * 0 - f1 * 0;
    let rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl;
    ry /= rl;
    rz /= rl;
    // up' = right × forward
    let ux = ry * f2 - rz * f1;
    let uy = rz * f0 - rx * f2;
    let uz = rx * f1 - ry * f0;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const fov = Math.PI / 4.5;
    const aspect = canvas.width / Math.max(1, canvas.height);
    const tan = Math.tan(fov / 2);
    const dx = (rx * nx * tan * aspect + ux * ny * tan + f0) ;
    const dy = (ry * nx * tan * aspect + uy * ny * tan + f1);
    const dz = (rz * nx * tan * aspect + uz * ny * tan + f2);
    // Intersect with plane z = tz (approx); refine with height sample
    if (Math.abs(dz) < 1e-5) return null;
    let t = (tz - camZ) / dz;
    if (t < 0) t = (0 - camZ) / dz;
    let gx = cx + dx * t;
    let gy = camY + dy * t;
    const gz = this.sampleHeight(gx, gy);
    // Second pass against actual height plane
    if (Math.abs(dz) > 1e-5) {
      t = (gz - camZ) / dz;
      gx = cx + dx * t;
      gy = camY + dy * t;
    }
    return { x: gx, y: gy };
  }

  private patchMissingTilesets(): void {
    const td = this.viewer.terrainData;
    if (!td || typeof td.getRow !== 'function' || !td.map) return;
    if (!td.getRow('Zvin') && td.getRow('Cvin')) {
      td.map['Zvin'] = td.getRow('Cvin');
    }
    if (!td.getRow('Zbks') && td.getRow('Ybtl')) {
      td.map['Zbks'] = td.getRow('Ybtl');
    } else if (!td.getRow('Zbks') && td.getRow('Cdrt')) {
      td.map['Zbks'] = td.getRow('Cdrt');
    }
  }

  private waitBaseFiles(): Promise<void> {
    if (this.viewer.loadedBaseFiles) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WC3 基础 SLK/贴图表加载超时')), 60000);
      this.viewer.once('loadedbasefiles', () => {
        clearTimeout(t);
        resolve();
      });
      this.viewer.on('error', (e: unknown) => console.warn('[War3MapViewer]', e));
    });
  }

  private waitUntil(pred: () => boolean, ms: number, label: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const tick = () => {
        if (this.disposed) return reject(new Error('disposed'));
        if (pred()) return resolve();
        if (performance.now() - start > ms) {
          return reject(new Error(`${label} 加载超时`));
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  /** Resolve WC3 archive-relative paths (models, BLP, TeamColor) under /assets/wc3/. */
  resolveWc3Path(src: unknown): unknown {
    if (typeof src !== 'string') return src;
    let p = src.replace(/\\/g, '/').replace(/\.mdl$/i, '.mdx').replace(/\.mdx$/i, '.mdxbin');
    if (/^https?:\/\//i.test(p) || p.startsWith('/')) return p;
    if (/^buildings\//i.test(p)) {
      p = 'Buildings/' + p.slice('buildings/'.length);
    }
    if (/^units\//i.test(p)) {
      p = 'Units/' + p.slice('units/'.length);
    }
    // Case-sensitive static server vs WC3 mixed case.
    p = p.replace(/\/TreeOfLife\//gi, '/TreeofLife/');
    // Flatten accidental nested `Foo.mdx/Foo.mdxbin` extract layout.
    p = p.replace(/\/([^/]+)\.mdxbin\/\1\.mdxbin$/i, '/$1.mdxbin');
    p = p.replace(
      /Buildings\/Other\/FountainOfLife\/FountainOfLife\.mdxbin$/i,
      'Buildings/Other/FountainOfLife/FountainOfHealth.mdxbin'
    );
    const teamMatch = p.match(
      /ReplaceableTextures\/(TeamColor|TeamGlow)\/(Team(?:Color|Glow)(\d+))\.blp$/i
    );
    if (teamMatch) {
      const idx = Number(teamMatch[3]);
      if (idx <= 1) {
        return `${this.wc3Base}ReplaceableTextures/${teamMatch[1]}/${teamMatch[2]}.blp`;
      }
      return `${this.wc3Base}ReplaceableTextures/${teamMatch[1]}/${teamMatch[2]}.png`;
    }
    return `${this.wc3Base}${p}`;
  }

  private resolveSequenceId(idOrName: number | string): number {
    if (typeof idOrName === 'number') return idOrName;
    const want = idOrName.toLowerCase();
    const exact = this.sequences.findIndex((s) => s.name.toLowerCase() === want);
    if (exact >= 0) return exact;
    const stand = this.sequences.findIndex((s) => s.name.toLowerCase() === 'stand');
    if (want === 'stand' && stand >= 0) return stand;
    return this.sequences.findIndex((s) => s.name.toLowerCase().includes(want));
  }

  private resolveHeroPath(src: unknown): unknown {
    if (typeof src !== 'string') return src;
    const base = this.options.assetBaseUrl.replace(/\/?$/, '/');
    const p = src.replace(/\\/g, '/');

    const teamMatch = p.match(
      /ReplaceableTextures\/(TeamColor|TeamGlow)\/(Team(?:Color|Glow)\d+)\.blp$/i
    );
    if (teamMatch) {
      return `${base}ReplaceableTextures/${teamMatch[1]}/${teamMatch[2]}.png`;
    }
    if (
      p.toLowerCase().endsWith('.mdx') ||
      p.toLowerCase().endsWith('.mdl') ||
      p.toLowerCase().endsWith('.mdxbin')
    ) {
      return this.options.modelUrl;
    }
    if (/^https?:\/\//i.test(p) || p.startsWith('/assets/')) return p;
    if (/^Textures\//i.test(p)) return `${base}${p}`;
    if (/^ReplaceableTextures\//i.test(p)) {
      return `${base}${p.replace(/\.blp$/i, '.png')}`;
    }
    if (/^(TerrainArt|Doodads|Units|Buildings|UI)\//i.test(p)) {
      return `${this.wc3Base}${p}`;
    }
    return `${base}${p.split('/').pop()}`;
  }

  private updateCamera(): void {
    const scene = this.scene || this.viewer.map?.worldScene;
    if (!scene) return;
    const [tx, ty, tz] = this.target;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const x = tx + this.distance * cp * cy;
    const y = ty + this.distance * cp * sy;
    const z = tz + this.distance * sp;
    const canvas = this.options.canvas;
    scene.viewport[0] = 0;
    scene.viewport[1] = 0;
    scene.viewport[2] = canvas.width;
    scene.viewport[3] = canvas.height;
    // WC3 gameplay FOV is relatively narrow.
    scene.camera.perspective(
      Math.PI / 4.5,
      canvas.width / Math.max(1, canvas.height),
      16,
      100000
    );
    scene.camera.moveToAndFace([x, y, z], [tx, ty, tz], [0, 0, 1]);
  }

  /**
   * Camera-relative pan axes in world XY.
   * right = screen-right, down = screen-down (toward camera / near side).
   */
  private screenPanAxes(): [number, number, number, number] {
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    // right ⊥ look; down = toward camera offset (cy, sy)
    const rx = -sy;
    const ry = cy;
    const dxw = cy;
    const dyw = sy;
    return [rx, ry, dxw, dyw];
  }

  /** WC3-style edge scroll: mouse near viewport edge pans camera. */
  private applyEdgeScroll(dt: number): void {
    if (!this.pointerInside || this.dragMode) return;
    const margin = 0.045;
    let sx = 0;
    let sy = 0;
    if (this.pointerX <= margin) sx -= 1;
    if (this.pointerX >= 1 - margin) sx += 1;
    if (this.pointerY <= margin) sy -= 1; // top → screen-up
    if (this.pointerY >= 1 - margin) sy += 1; // bottom → screen-down
    if (!sx && !sy) return;
    this.cameraMode = 'free';
    const speed = Math.min(2200, 900 + this.distance * 0.35) * dt;
    const [rx, ry, dxw, dyw] = this.screenPanAxes();
    this.target[0] += (sx * rx + sy * dxw) * speed;
    this.target[1] += (sx * ry + sy * dyw) * speed;
    this.clampTargetToMap();
  }

  private applyKeyboardPan(dt: number): void {
    if (!this.keys.size) return;
    const speed = Math.min(2200, 900 + this.distance * 0.35) * dt;
    const [rx, ry, dxw, dyw] = this.screenPanAxes();
    let sx = 0;
    let sy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) sy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) sy += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) sx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) sx += 1;
    if (!sx && !sy) return;
    const len = Math.hypot(sx, sy) || 1;
    sx /= len;
    sy /= len;
    this.target[0] += (sx * rx + sy * dxw) * speed;
    this.target[1] += (sx * ry + sy * dyw) * speed;
    this.clampTargetToMap();
  }

  private startLoop(): void {
    this.lastFrame = performance.now();
    const step = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(step);
      try {
        const now = performance.now();
        const dt = Math.min(100, now - this.lastFrame);
        this.lastFrame = now;

        this.applyEdgeScroll(dt / 1000);
        this.applyKeyboardPan(dt / 1000);

        if (this.sim && this.simEnabled) {
          this.sim.tick(dt);
          this.simUnitCount = this.sim.units.length;
        }

        // Hero camera follows replay-driven unit position (no player orders).
        if (this.cameraMode === 'hero' && this.instance) {
          const loc = this.instance.localLocation || this.instance.location || [0, 0, 0];
          this.target = [loc[0] || 0, loc[1] || 0, (loc[2] || 0) + 90];
          this.clampTargetToMap();
        }

        if (this.instance?.sequenceEnded) {
          this.instance.setSequence(this.instance.sequence);
        }
        this.updateCamera();
        this.viewer.updateAndRender();
        this.mirrorToViewImage();
      } catch (e) {
        console.warn('[wc3] frame error', e);
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  private mirrorFrame = 0;
  private mirror2d?: HTMLCanvasElement;
  private mirror2dCtx?: CanvasRenderingContext2D;
  private mirrorPixels?: Uint8Array;

  private mirrorToViewImage(): void {
    // Every 2nd frame: canvas.toDataURL(WebGL) is near-black here;
    // readPixels + Y-flip → JPEG → CSS background on the template layer.
    this.mirrorFrame = (this.mirrorFrame + 1) % 2;
    if (this.mirrorFrame !== 0) return;
    const layer = this.options.viewLayer;
    const gl = this.viewer?.gl as WebGLRenderingContext | undefined;
    const src = this.options.canvas;
    if (!layer || !gl) return;
    const w = src.width;
    const h = src.height;
    if (w < 2 || h < 2) return;
    try {
      if (!this.mirror2d) {
        this.mirror2d = document.createElement('canvas');
        this.mirror2dCtx = this.mirror2d.getContext('2d', { alpha: false }) || undefined;
      }
      if (!this.mirror2dCtx) return;
      if (this.mirror2d.width !== w || this.mirror2d.height !== h) {
        this.mirror2d.width = w;
        this.mirror2d.height = h;
        this.mirrorPixels = new Uint8Array(w * h * 4);
      }
      const pixels = this.mirrorPixels!;
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const img = this.mirror2dCtx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        img.data.set(
          pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4),
          y * w * 4
        );
      }
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
      this.mirror2dCtx.putImageData(img, 0, 0);
      const url = this.mirror2d.toDataURL('image/jpeg', 0.7);
      if (url.length < 2000) return;
      layer.style.backgroundImage = `url(${url})`;
    } catch (e) {
      console.warn('[wc3] mirrorToViewImage failed', e);
    }
  }
}
