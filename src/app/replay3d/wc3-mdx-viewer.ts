import { installMemoryMapLoader, loadDotaNamedMapFiles } from './wc3-memory-map';
import { patchWar3MapViewerMap } from './wc3-doodad-patch';
import { dncLight, patchSdFragment, type DncLight } from './wc3-lighting';
import { loadPathingData } from '../game/game-data';
import { PathGrid } from '../game/path-grid';
import {
  RADIANT_SPAWN,
  DOTA_MAP_BOUNDS,
  DOTA_CAMERA_BOUNDS,
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
  type SimRune,
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
  /**
   * 网页对战模式：不加载录像英雄与 DotaSceneSim，单位全部由外部 GameEngine 通过 spawnUnit 驱动；
   * 左/右键交给页面处理（选中/下达指令），仅中键拖动、方向键与边缘滚屏移动镜头。
   */
  gameplay?: boolean;
  /** 每帧渲染前回调（对战模式用于推进逻辑帧与同步模型位置） */
  onFrame?: (dtMs: number) => void;
}

type DragMode = 'pan' | 'orbit' | null;

/**
 * Browser wrapper: War3MapViewer (real 3D terrain) + Blademaster MDX + DotA sim.
 */
/** Adts（魔法岗哨）的施法者特效：防御塔头顶的真视之眼 */
const TRUE_SIGHT_EYE_MODEL = 'Abilities\\Spells\\Human\\MagicSentry\\MagicSentryCaster.mdx';

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
  // --- AI 修改开始 [SCENE-SIM]：默认 0，避免录像未就绪时墙钟空转刷兵；有 timeline 时由 syncSimGameTime 驱动 ---
  simSpeed = 0;
  // --- AI 修改结束 [SCENE-SIM] ---
  syncConfig?: SceneSyncConfig;

  private raf = 0;
  private disposed = false;
  private yaw = -Math.PI / 2;
  private pitch = 0.98;
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
  private placedTowers: { id: string; name: string; team: 0 | 1; x: number; y: number; instance: any }[] = [];
  private portraitViewer?: any;
  private portraitScene?: any;
  private portraitInstance?: any;
  private portraitSeqs: number[] = [];
  private portraitCursor = 0;
  private previewCompanion: any = null;
  private previewCompanionOffset = { x: 140, y: 90 };
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onPointerLeave: () => void;
  private readonly onWheel: (e: WheelEvent) => void;
  private readonly onResize: () => void;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private resizeObserver?: ResizeObserver;
  private readonly wc3Base: string;
  private inputEl: HTMLElement;
  private readonly onContextMenu = (e: Event) => e.preventDefault();
  private constructor(
    private readonly options: Wc3MdxViewerOptions,
    private readonly War3MapViewer: any
  ) {
    const { canvas } = options;
    this.wc3Base = (options.wc3BaseUrl || '/assets/wc3/').replace(/\/?$/, '/');
    // Pointer events go to the visible layer (WebGL canvas is not interactive).
    this.inputEl = options.viewLayer || canvas;

    const pathSolver = (src: unknown) => this.resolveWc3Path(src);
    this.viewer = new War3MapViewer(canvas, pathSolver, false);
    this.scene = this.viewer.worldScene || this.viewer.scenes?.[0];
    Wc3MdxViewer.clearEmptyTexture(this.viewer);
    this.installModelLighting();

    this.onPointerDown = (e) => {
      if (this.options.gameplay) {
        // 对战模式：左键选中、右键指令由页面处理，这里只保留中键拖动镜头
        if (e.button === 1) {
          this.dragMode = 'pan';
          this.cameraMode = 'free';
          this.lastX = e.clientX;
          this.lastY = e.clientY;
          this.inputEl.setPointerCapture(e.pointerId);
        }
        return;
      }
      // Spectator/replay: never issue hero orders. Left/middle drag pans camera.
      if (e.button === 0 || e.button === 1) {
        this.dragMode = 'pan';
        this.cameraMode = 'free';
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.inputEl.setPointerCapture(e.pointerId);
      } else if (e.button === 2) {
        this.dragMode = 'orbit';
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.inputEl.setPointerCapture(e.pointerId);
      }
    };
    this.onPointerMove = (e) => {
      const rect = this.inputEl.getBoundingClientRect();
      this.pointerX = (e.clientX - rect.left) / Math.max(1, rect.width);
      this.pointerY = (e.clientY - rect.top) / Math.max(1, rect.height);
      // 监听整个窗口：指针在 HUD（顶栏/控制台）上时也能边缘滚屏。
      // 视口上方是网站页头，把鼠标甩到窗口最上沿时指针落在页头里——这也算「上边缘」，
      // 否则上下滚屏永远触发不了（左右两侧视口贴着窗口边，所以一直正常）。
      // 指针停在页头的按钮/链接/输入框上时不滚，免得操作菜单时镜头乱跑。
      const target = e.target as Element | null;
      const overControl = !!target?.closest?.('a,button,input,select,textarea,[role="button"]');
      // 小地图贴着视口下沿：在小地图上点/拖时不能顺带触发下边缘滚屏（否则镜头先跳过去又往下滑）
      const noEdge = !!target?.closest?.('.w3-minimap,[data-no-edge-scroll]');
      const inX = this.pointerX >= 0 && this.pointerX <= 1;
      this.pointerInside = !noEdge && inX && this.pointerY <= 1 && (this.pointerY >= 0 || !overControl);
      if (this.pointerY < 0) this.pointerY = 0;

      if (!this.dragMode) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (this.dragMode === 'orbit') {
        this.yaw -= dx * 0.0055;
        this.pitch = Math.max(0.45, Math.min(1.42, this.pitch + dy * 0.0045));
        this.updateCamera();
        return;
      }
      const panScale = this.distance * 0.0018;
      // Screen-right / screen-down → world, matching camera yaw (not inverted).
      const [rx, ry, dxw, dyw] = this.screenPanAxes();
      this.target[0] -= (dx * rx + dy * dxw) * panScale;
      this.target[1] -= (dx * ry + dy * dyw) * panScale;
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
      const parent = canvas.parentElement?.getBoundingClientRect();
      const rw = Math.max(rect.width, parent?.width || 0);
      const rh = Math.max(rect.height, parent?.height || 0);
      const w = Math.max(640, Math.floor(rw) || canvas.width || 1280);
      const h = Math.max(360, Math.floor(rh) || canvas.height || 720);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      this.updateCamera();
    };
    try {
      const roTarget = canvas.parentElement || this.inputEl;
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.disposed) this.onResize();
      });
      this.resizeObserver.observe(roTarget);
    } catch {
      /* older env */
    }
    this.onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (this.options.gameplay) {
        // 对战模式字母键全部留给技能/指令热键，镜头只响应方向键
        if (k.startsWith('arrow')) {
          this.keys.add(k);
          this.cameraMode = 'free';
          e.preventDefault();
        }
        return;
      }
      // 录像页：WASD 与方向键都能平移镜头
      if (['w', 'a', 's', 'd'].includes(k) || k.startsWith('arrow')) {
        this.keys.add(k);
        this.cameraMode = 'free';
        e.preventDefault();
      }
    };
    this.onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());

    this.inputEl.addEventListener('pointerdown', this.onPointerDown);
    // HUD 盖在视口上方，指针移到控制台/顶栏时 viewLayer 收不到事件；原版里屏幕四边都能滚屏。
    // 对战页与录像页一样监听整个窗口（拖动时 pointer capture 的事件也会冒泡到 window）
    window.addEventListener('pointermove', this.onPointerMove);
    document.documentElement.addEventListener('pointerleave', this.onPointerLeave);
    this.inputEl.addEventListener('pointerup', this.onPointerUp);
    this.inputEl.addEventListener('pointercancel', this.onPointerUp);
    this.inputEl.addEventListener('wheel', this.onWheel, { passive: false });
    this.inputEl.addEventListener('contextmenu', this.onContextMenu);
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
    Wc3MdxViewer.sdSources = (await import('./wc3-viewer-libs')).loadSdShaderSources();
    patchWar3MapViewerMap(libs);
    (Wc3MdxViewer as any)._War3Map = libs.War3Map;
    (Wc3MdxViewer as any)._ModelViewer = libs.ModelViewer;
    (Wc3MdxViewer as any)._handlers = libs.handlers;

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
    // --- AI 修改开始 [BOOT-FAST-TERRAIN]：基础 SLK 与 named w3e 并行拉取；地图对象一出就清屏开环，地形 mesh 就绪立即真正开渲 ---
    const namedPromise = loadDotaNamedMapFiles();
    await this.waitBaseFiles();
    this.patchMissingTilesets();

    const named = await namedPromise;
    const War3Map = (Wc3MdxViewer as any)._War3Map;
    installMemoryMapLoader(War3Map, named);

    this.viewer.loadMap(new Uint8Array(32));
    const map = this.viewer.map;
    if (!map) {
      throw new Error('War3MapViewer.loadMap 失败');
    }

    this.scene = map.worldScene;
    if (this.scene?.color) {
      this.scene.color[0] = 0.05;
      this.scene.color[1] = 0.1;
      this.scene.color[2] = 0.06;
    }
    this.onResize();
    // 先开渲染环（清色/空景），避免等地形时一直黑屏
    const spawn = this.options.heroSpawn || RADIANT_SPAWN;
    this.target = [spawn.x, spawn.y, 900];
    this.applyWc3GameplayCamera();
    this.updateCamera();
    this.startLoop();

    // Terrain first — flag ready as soon as the heightmap exists.
    await this.waitUntil(() => !!map.terrainReady, 60000, '地形网格');
    if (!map.cliffsReady) {
      map.cliffModels = (map.cliffModels || []).filter(Boolean);
      map.cliffsReady = true;
    }
    this.terrainReady = true;
    const z0 = this.sampleHeight(spawn.x, spawn.y);
    this.target = [spawn.x, spawn.y, z0 + 90];
    this.updateCamera();
    // --- AI 修改结束 [BOOT-FAST-TERRAIN] ---

    if (this.options.gameplay) {
      // 对战模式：只铺建筑，英雄/小兵/野怪由 GameEngine 渲染层按需 spawnUnit
      await Promise.race([
        this.placeDotaBuildings(),
        new Promise((r) => setTimeout(r, 8000)),
      ]);
      this.cameraMode = 'free';
      return;
    }

    // 英雄优先：避免装饰物/建筑队列占满加载槽导致英雄 MDX 迟迟不请求
    const z = this.sampleHeight(spawn.x, spawn.y);
    const heroSolver = this.options.modelUrl.includes('/assets/wc3/')
      ? (src: unknown) => this.resolveWc3Path(src)
      : (src: unknown) => this.resolveHeroPath(src);
    const model = await Promise.race([
      this.viewer.load(this.options.modelUrl, heroSolver),
      new Promise<null>((r) => setTimeout(() => r(null), 20000)),
    ]);
    if (!model) {
      // Terrain is already on screen — do not black-out the whole page.
      console.warn('[wc3] hero MDX load failed/timeout; keeping terrain view');
      this.setCameraMode('free');
    } else {
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
      this.setCameraMode('hero');
    }

    // 树木/建筑后置，避免占满加载队列拖死英雄模型；勿阻塞 whenAllLoaded（缺 doodad 会永远挂起）
    await Promise.race([
      this.waitUntil(() => (map.doodads?.length || 0) > 50, 4000, '树木装饰'),
      new Promise((r) => setTimeout(r, 2500)),
    ]).catch(() => undefined);

    await Promise.race([
      this.placeDotaBuildings(),
      new Promise((r) => setTimeout(r, 6000)),
    ]);
    this.buildings = [...(map.doodads || []), ...(this.buildings || [])];

    if (this.instance) {
      await this.initSceneSim();
      this.setCameraMode('hero');
    }
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
        // DotA 6.83d UnitUI: etol → war3mapImported\final_export（世界树），非原版 TreeofLife
        radiant: 'war3mapImported\\final_export.mdx',
        dire: 'Doodads\\Cinematic\\LichKing\\LichKing.mdx',
        scale: 1.35, // 场景 fallback；各建筑以 buildings.json scale 为准（如天灾 unpl）
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

  /** 防御塔头顶的真视之眼（塔 id → 模型实例），塔被摧毁后隐藏 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private towerEyes = new Map<string, any>();

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
        // 开发服务器刚启动时单个模型可能要十几秒；超时会让整类建筑（含全部防御塔）不出现
        new Promise<null>((r) => setTimeout(() => r(null), 30000)),
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
      const path = b.model || (spec ? (b.team === 1 ? spec.dire : spec.radiant) : '');
      if (!path) continue;
      uniquePaths.add(path);
    }
    await Promise.all([...uniquePaths].map((p) => loadModel(p)));

    for (const b of cfg.buildings || []) {
      const spec = this.buildingModelSpec(b.kind);
      const path = b.model || (spec ? (b.team === 1 ? spec.dire : spec.radiant) : '');
      if (!path) continue;
      const model = await loadModel(path);
      if (!model) continue;
      const inst = model.addInstance();
      inst.setScene(this.scene);
      // DotA 6.83：近卫建筑归 Player 1（红），天灾建筑归 Player 7（绿）；
      // 英雄出生光环按玩家槽位上色（近卫 2~6 号：蓝青紫黄橙，天灾 8~12 号：粉灰浅蓝深绿棕）
      const cop = /_cop_(\d)$/.exec(b.id || '');
      // 酒馆等由脚本 SetUnitColor 指定颜色的单位在 buildings.json 里带 color
      const fixedColor = (b as { color?: number }).color;
      inst.setTeamColor(
        typeof fixedColor === 'number' ? fixedColor : cop ? (b.team === 1 ? 6 : 0) + Number(cop[1]) : b.team === 1 ? 6 : 0
      );
      inst.setSequenceLoopMode(2);
      const z = this.sampleHeight(b.x, b.y);
      inst.setLocation([b.x, b.y, z]);
      inst.setUniformScale(b.scale ?? spec?.scale ?? 1);
      if (b.facing != null && Number.isFinite(b.facing)) {
        const rad = (b.facing * Math.PI) / 180;
        inst.setRotation?.([0, 0, Math.sin(rad / 2), Math.cos(rad / 2)]);
      }
      if (model.sequences?.length) {
        const standIdx = (model.sequences as { name?: string }[]).findIndex((s) =>
          String(s.name || '').toLowerCase().trim().startsWith('stand')
        );
        inst.setSequence(standIdx >= 0 ? standIdx : 0);
      }
      placed.push({ id: b.id, name: b.name, kind: b.kind, x: b.x, y: b.y, instance: inst });
      if (b.kind === 'tower') {
        // 22 座防御塔都带 Adts（魔法岗哨 = 真视），原版在塔的 overhead 挂点上显示一只眼睛
        try {
          const eyeModel = await loadModel(TRUE_SIGHT_EYE_MODEL);
          if (eyeModel) {
            const scale = b.scale ?? spec?.scale ?? 1;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const att = ((model.attachments || []) as any[]).find((x) => /^overhead/i.test(String(x?.name || '')));
            const oz = att?.pivot ? Number(att.pivot[2]) * scale : 300;
            const eye = eyeModel.addInstance();
            eye.setScene(this.scene);
            eye.setSequenceLoopMode(2);
            eye.setLocation([b.x, b.y, z + (Number.isFinite(oz) && oz > 0 ? oz : 300)]);
            const eyeStand = (eyeModel.sequences as { name?: string }[]).findIndex((q) =>
              String(q.name || '').toLowerCase().trim().startsWith('stand')
            );
            eye.setSequence(eyeStand >= 0 ? eyeStand : 0);
            this.towerEyes.set(b.id, eye);
          }
        } catch (e) {
          console.warn('[wc3] tower true-sight eye skipped', b.id, e);
        }
        this.placedTowers.push({
          id: b.id,
          name: b.name,
          team: b.team === 1 ? 1 : 0,
          x: b.x,
          y: b.y,
          instance: inst,
        });
      }
    }
    this.buildings = placed;
  }

  /** 寻路栅格（war3map.wpm + 树木）；加载完之前为 null */
  private pathGrid: PathGrid | null = null;

  get pathReady(): boolean {
    return !!this.pathGrid;
  }

  /** A* 寻路（不含起点的路点列表）；栅格没加载完时直接返回终点 */
  findPath(ax: number, ay: number, bx: number, by: number): [number, number][] {
    return this.pathGrid ? this.pathGrid.findPath(ax, ay, bx, by) : [[bx, by]];
  }

  /** 该点在寻路栅格上是否不可走（调试：检查英雄有没有走进树林/悬崖） */
  isBlocked(x: number, y: number): boolean {
    return !!this.pathGrid && this.pathGrid.blocked(x, y);
  }

  private async initSceneSim(): Promise<void> {
    const base = await loadSceneSyncConfig();
    this.syncConfig = applySyncOverrides(base, this.options.syncOverrides);
    this.simEnabled = !!this.syncConfig.enabled;
    if (!this.simEnabled) return;

    // 与对战页同一张寻路栅格（war3map.wpm + 树木），小兵按 A* 绕开树林与悬崖
    let grid: PathGrid | null = null;
    try {
      grid = new PathGrid(await loadPathingData());
      this.pathGrid = grid;
    } catch (e) {
      console.warn('[wc3] 寻路栅格加载失败，小兵将直线行走', e);
    }
    this.sim = new DotaSceneSim(
      this.syncConfig,
      (x, y) => this.sampleHeight(x, y),
      (opts) => this.spawnUnitInstance(opts),
      this.instance,
      (name) => this.resolveSequenceId(name),
      grid ? (ax, ay, bx, by) => grid.findPath(ax, ay, bx, by) : undefined
    );
    this.sim.registerTowers(this.placedTowers);
    await this.sim.bootstrap();
    // 等录像号角时钟来再推进；禁止初始化后墙钟空转。
    // 先标成「未开局」：出兵时间是号角后 0 秒，不标的话模拟时钟停在 0 也会立刻刷出第一波
    this.sim.syncGameClock(-1);
    this.simSpeed = 0;
    this.simUnitCount = this.sim.units.length;
  }

  async setPreviewCompanion(
    modelPath: string | null,
    opts?: { offsetX?: number; offsetY?: number; scale?: number; teamColor?: number }
  ): Promise<void> {
    this.clearPreviewCompanion();
    if (!modelPath || !this.scene) return;
    this.previewCompanionOffset = {
      x: opts?.offsetX ?? 140,
      y: opts?.offsetY ?? 90,
    };
    const loc = (this.instance?.localLocation || this.instance?.location || [0, 0, 0]) as number[];
    const hx = Number(loc[0]) || 0;
    const hy = Number(loc[1]) || 0;
    const x = hx + this.previewCompanionOffset.x;
    const y = hy + this.previewCompanionOffset.y;
    const z = this.sampleHeight(x, y);
    this.previewCompanion = await this.spawnUnitInstance({
      path: modelPath,
      x,
      y,
      z,
      teamColor: opts?.teamColor ?? this.options.teamColor ?? 0,
      scale: opts?.scale ?? 1.05,
      sequenceHint: 'Stand',
    });
  }

  clearPreviewCompanion(): void {
    if (!this.previewCompanion) return;
    try {
      this.previewCompanion.detach?.();
      this.previewCompanion.setScene?.(null);
    } catch {
      /* ignore */
    }
    this.previewCompanion = null;
  }

  private syncPreviewCompanionToHero(): void {
    if (!this.previewCompanion || !this.instance) return;
    const loc = (this.instance.localLocation || this.instance.location || [0, 0, 0]) as number[];
    const x = (Number(loc[0]) || 0) + this.previewCompanionOffset.x;
    const y = (Number(loc[1]) || 0) + this.previewCompanionOffset.y;
    const z = this.sampleHeight(x, y);
    this.previewCompanion.setLocation?.([x, y, z]);
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

  // ---------------- 网页对战模式公开接口 ----------------
  private readonly failedModels = new Set<string>();
  private readonly inflightModels = new Map<string, Promise<any | null>>();

  /** 英雄专用资源目录（非 /assets/wc3/ 下）贴图路径求解 */
  private makeAssetSolver(modelUrl: string, assetBaseUrl: string): (src: unknown) => unknown {
    const base = assetBaseUrl.endsWith('/') ? assetBaseUrl : assetBaseUrl + '/';
    return (src: unknown) => {
      if (typeof src !== 'string') return src;
      const p = src.split('\\').join('/');
      const team = p.match(/ReplaceableTextures\/(TeamColor|TeamGlow)\/(Team(?:Color|Glow)\d+)\.blp$/i);
      if (team) return `${this.wc3Base}ReplaceableTextures/${team[1]}/${team[2]}.blp`;
      if (/\.(mdx|mdl|mdxbin)$/i.test(p)) return modelUrl;
      if (/^https?:\/\//i.test(p) || p.startsWith('/assets/')) return p;
      if (/^(units|buildings|textures|doodads|replaceabletextures|abilities|war3mapimported)\//i.test(p)) {
        return this.resolveWc3Path(p);
      }
      return `${base}${p.split('/').pop()}`;
    };
  }

  /** 加载并缓存模型；失败/超时记入黑名单，避免每波兵重复请求 404 */
  loadUnitModel(path: string, assetBaseUrl?: string): Promise<any | null> {
    const key = path;
    if (this.modelCache.has(key)) return Promise.resolve(this.modelCache.get(key));
    if (this.failedModels.has(key)) return Promise.resolve(null);
    const pending = this.inflightModels.get(key);
    if (pending) return pending;
    let loadPath = path;
    if (!loadPath.startsWith('/') && !/\.(mdx|mdl|mdxbin)$/i.test(loadPath)) loadPath += '.mdx';
    const solver =
      loadPath.startsWith('/') && !loadPath.includes('/assets/wc3/') && assetBaseUrl
        ? this.makeAssetSolver(loadPath, assetBaseUrl)
        : (src: unknown) => this.resolveWc3Path(src);
    const p = Promise.race([
      Promise.resolve(this.viewer.load(loadPath, solver)).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 12000)),
    ]).then((model) => {
      this.inflightModels.delete(key);
      if (!model) {
        this.failedModels.add(key);
        return null;
      }
      this.modelCache.set(key, model);
      return model;
    });
    this.inflightModels.set(key, p);
    return p;
  }

  /** 生成一个单位模型实例；模型缺失时依次尝试 fallbacks */
  async spawnUnit(opts: {
    path: string;
    assetBaseUrl?: string;
    fallbacks?: string[];
    x: number;
    y: number;
    teamColor: number;
    scale: number;
  }): Promise<any | null> {
    let model = await this.loadUnitModel(opts.path, opts.assetBaseUrl);
    for (const fb of opts.fallbacks || []) {
      if (model) break;
      model = await this.loadUnitModel(fb);
    }
    if (!model || this.disposed) return null;
    const inst = model.addInstance();
    inst.setScene(this.scene);
    inst.setTeamColor(opts.teamColor);
    inst.setSequenceLoopMode(0);
    inst.setLocation([opts.x, opts.y, this.sampleHeight(opts.x, opts.y)]);
    inst.setUniformScale(opts.scale);
    return inst;
  }

  /** 屏幕坐标 → 地面世界坐标（右键移动/施法落点） */
  pickGroundAt(clientX: number, clientY: number): { x: number; y: number } | null {
    return this.pickGround(clientX, clientY);
  }

  /** 镜头对准某点但不改变镜头模式（空格回英雄/小地图点击） */
  focusOn(x: number, y: number): void {
    this.target[0] = x;
    this.target[1] = y;
    this.clampTargetToMap();
    this.updateCamera();
  }

  /** buildings.json 中已铺设的建筑实例（id → instance），供引擎做受击/死亡表现 */
  getPlacedBuildings(): { id: string; kind: string; x: number; y: number; instance: any }[] {
    return (this.buildings as any[]).filter((b) => b && b.id && b.instance);
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
    facingRad?: number;
    sequence?: number | string;
  }): void {
    if (action.x != null && action.y != null) {
      this.setHeroWorldPosition(action.x, action.y);
      this.syncPreviewCompanionToHero();
    }
    if (action.facingRad != null && Number.isFinite(action.facingRad)) {
      const half = action.facingRad / 2;
      this.instance?.setRotation?.([0, 0, Math.sin(half), Math.cos(half)]);
    }
    if (action.sequence != null && this.instance) {
      const targetSeq = this.resolveSequenceId(action.sequence);
      if (targetSeq >= 0 && (this.instance.sequence !== targetSeq || this.instance.sequenceEnded)) {
        this.instance.setSequence(targetSeq);
      }
    }
  }

  async switchHeroModel(modelUrl: string, assetBaseUrl?: string): Promise<boolean> {
    if (!this.scene) return false;
    this.options.modelUrl = modelUrl;
    if (assetBaseUrl) {
      this.options.assetBaseUrl = assetBaseUrl;
    }
    const useWc3Solver = modelUrl.includes('/assets/wc3/');
    const solver = useWc3Solver
      ? (src: unknown) => this.resolveWc3Path(src)
      : (src: unknown) => this.resolveHeroPath(src);
    const model = await Promise.race([
      this.viewer.load(modelUrl, solver),
      new Promise<null>((r) => setTimeout(() => r(null), 30000)),
    ]);
    if (!model) {
      console.warn('[wc3] switchHeroModel failed/timeout', modelUrl);
      return false;
    }

    const prevLoc = this.instance?.localLocation || this.instance?.location || [
      RADIANT_SPAWN.x,
      RADIANT_SPAWN.y,
      this.sampleHeight(RADIANT_SPAWN.x, RADIANT_SPAWN.y),
    ];
    const prevRot = this.instance?.localRotation
      ? [...this.instance.localRotation]
      : [0, 0, 0, 1];
    try {
      this.instance?.detach?.();
      this.instance?.setScene?.(null);
    } catch {
      /* ignore */
    }

    this.model = model;
    this.sequences = (model.sequences || []).map(
      (s: { name?: string }, index: number): Wc3SequenceInfo => ({
        index,
        name: String(s.name || `Sequence ${index}`).replace(/\0/g, '').trim(),
      })
    );
    const inst = model.addInstance();
    inst.setScene(this.scene);
    inst.setTeamColor(this.options.teamColor ?? 0);
    inst.setSequenceLoopMode(2);
    inst.setLocation([prevLoc[0] || 0, prevLoc[1] || 0, prevLoc[2] || 0]);
    inst.setRotation?.(prevRot);
    inst.setUniformScale(1);
    const standIdx = this.resolveSequenceId('Stand');
    inst.setSequence(standIdx >= 0 ? standIdx : 0);
    this.instance = inst;
    void this.loadPortraitModelForHero(modelUrl);
    return true;
  }

  private derivePortraitModelUrl(heroModelUrl: string): string {
    if (heroModelUrl.includes('HeroBladeMaster')) {
      return '/assets/models/blademaster/HeroBladeMaster_Portrait.mdxbin';
    }
    if (heroModelUrl.endsWith('.mdxbin')) {
      const candidate = heroModelUrl.replace(/\.mdxbin$/i, '_Portrait.mdxbin');
      const supported = [
        'HeroArchMage',
        'HeroMountainKing',
        'HeroPaladin',
        'HeroBloodElfPrince',
        'HeroFarSeer',
        'HeroTaurenChieftain',
        'HeroShadowHunter',
        'HeroDemonHunter',
        'HeroKeeperoftheGrove',
        'HeroMoonPriestess',
        'HeroWarden',
        'HeroDeathKnight',
        'HeroDreadLord',
        'HeroLich',
        'HeroCryptLord',
        'SeaElemental',
        'Dryad',
        'Jaina',
        'FelgaurdBlue',
        'NagaSiren',
        'Tauren',
        'SatyrTrickster',
        'SatyrTrickster',
        'DruidoftheClaw',
        'GrizzlyBear',
        'Sorceress',
        'BloodElfSpellThief',
        'AncientProtector',
        'OgreMagi',
        'FurbolgTracker',
        'HeroTinker',
        'MalFurionNoStag',
        'MalFurion',
        'Vengeance',
      ];
      if (supported.some((name) => candidate.includes(name))) {
        return candidate;
      }
    }
    return '/assets/models/blademaster/HeroBladeMaster_Portrait.mdxbin';
  }

  async attachPortraitCanvas(canvas: HTMLCanvasElement): Promise<void> {
    const ModelViewer = (Wc3MdxViewer as any)._ModelViewer;
    const handlers = (Wc3MdxViewer as any)._handlers;
    if (!ModelViewer || !handlers || !canvas) return;
    try {
      const canvasProto = HTMLCanvasElement.prototype as any;
      const origGetContext = canvasProto.getContext;
      canvasProto.getContext = function getContextPortrait(
        this: HTMLCanvasElement,
        type: string,
        attrs?: WebGLContextAttributes
      ) {
        if (type === 'webgl' || type === 'experimental-webgl') {
          attrs = { ...(attrs || {}), alpha: false, preserveDrawingBuffer: true };
        }
        return origGetContext.call(this, type, attrs);
      };
      // 肖像在离屏画布上渲染，每帧拷到页面上的 2D 画布。
      // 页面上直接放第二个 WebGL 画布时，切换录像/英雄后浏览器会把它的合成层多画一份到视口顶部（一块黑色遮挡）。
      const off = document.createElement('canvas');
      off.width = Math.max(96, canvas.clientWidth || canvas.width || 128);
      off.height = Math.max(96, canvas.clientHeight || canvas.height || 128);
      this.portraitTarget = canvas;
      let pv: any;
      try {
        pv = new ModelViewer(off);
      } finally {
        canvasProto.getContext = origGetContext;
      }
      const solver = (src: unknown) => this.resolvePortraitPath(src);
      pv.addHandler(handlers.mdx, solver, false);
      pv.addHandler(handlers.blp);
      pv.addHandler(handlers.tga);
      pv.addHandler(handlers.dds);
      const scene = pv.addScene();
      if (scene?.color) {
        scene.color[0] = 0.04;
        scene.color[1] = 0.05;
        scene.color[2] = 0.08;
      }
      this.portraitViewer = pv;
      this.portraitScene = scene;
      // 对战模式由页面按所选单位调用 setPortraitModel，不自动加载录像默认肖像
      if (!this.options.gameplay) await this.loadPortraitModelForHero(this.options.modelUrl);
    } catch (e) {
      console.warn('[wc3] attachPortraitCanvas error', e);
    }
  }

  /** 页面上显示肖像的 2D 画布（肖像本身在离屏 WebGL 画布上渲染） */
  private portraitTarget: HTMLCanvasElement | null = null;

  private blitPortrait(): void {
    const src = this.portraitViewer?.canvas as HTMLCanvasElement | undefined;
    const dst = this.portraitTarget;
    if (!src || !dst || !dst.isConnected) return;
    if (dst.width !== src.width) dst.width = src.width;
    if (dst.height !== src.height) dst.height = src.height;
    const ctx = dst.getContext('2d');
    ctx?.drawImage(src, 0, 0);
  }

  private resolvePortraitPath(src: unknown): unknown {
    if (typeof src !== 'string') return src;
    const p = src.replace(/\\/g, '/');
    if (p.startsWith('/assets/')) return p;
    if (/^Textures\/HeroBladeMaster\.blp$/i.test(p)) {
      return '/assets/models/blademaster/Textures/HeroBladeMaster.blp';
    }
    return this.resolveWc3Path(src);
  }

  /**
   * 对战模式：把控制台肖像切换为指定单位。
   * 先找同目录的 *_Portrait 模型（原版肖像模型，带 Portrait / Portrait Talk 序列），没有则返回 false 由页面退回静态头像。
   */
  async setPortraitModel(unitModelUrl: string, teamColor: number): Promise<boolean> {
    if (!this.portraitViewer || !this.portraitScene || !unitModelUrl) return false;
    this.options.teamColor = teamColor;
    let url = unitModelUrl.split('\\').join('/');
    if (!url.startsWith('/')) url = String(this.resolveWc3Path(/\.(mdx|mdl|mdxbin)$/i.test(url) ? url : url + '.mdx'));
    const portraitUrl = url.replace(/\.mdxbin$/i, '_Portrait.mdxbin');
    try {
      // 先探测文件是否存在，避免 mdx-m3-viewer 对 404 长时间挂起
      const head = await fetch(portraitUrl, { method: 'HEAD' });
      const type = head.headers.get('content-type') || '';
      if (!head.ok || type.includes('text/html')) return false;
    } catch {
      return false;
    }
    await this.loadPortraitModelForHero(portraitUrl, true);
    return !!this.portraitInstance;
  }

  /** 肖像说话动作（选中/下达指令时原版会播放 Portrait Talk） */
  playPortraitTalk(): void {
    const inst = this.portraitInstance;
    const seqs = (inst?.model?.sequences || []) as { name?: string }[];
    const idx = seqs.findIndex((s) => String(s.name || '').toLowerCase().includes('talk'));
    if (inst && idx >= 0) inst.setSequence(idx);
  }

  private async loadPortraitModelForHero(heroModelUrl: string, exact = false): Promise<void> {
    if (!this.portraitViewer || !this.portraitScene) return;
    const portraitUrl = exact ? heroModelUrl : this.derivePortraitModelUrl(heroModelUrl);
    let model: any = null;
    try {
      model = await Promise.race([
        this.portraitViewer.load(portraitUrl, (src: unknown) => this.resolvePortraitPath(src)),
        new Promise<null>((r) => setTimeout(() => r(null), 8000)),
      ]);
    } catch (e) {
      console.warn('[wc3] portrait load error', portraitUrl, e);
      return;
    }
    if (!model) return;
    try {
      this.portraitInstance?.detach?.();
      this.portraitInstance?.setScene?.(null);
    } catch {
      /* ignore */
    }
    const inst = model.addInstance();
    inst.setScene(this.portraitScene);
    inst.setTeamColor(this.options.teamColor ?? 0);
    inst.setSequenceLoopMode(0);

    const seqs = (model.sequences || []) as { name?: string }[];
    const portraitIndices: number[] = [];
    seqs.forEach((s, idx) => {
      const n = String(s.name || '').toLowerCase();
      if (n.includes('portrait') || n.includes('stand')) {
        portraitIndices.push(idx);
      }
    });
    this.portraitSeqs = portraitIndices.length ? portraitIndices : [0];
    this.portraitCursor = 0;
    inst.setSequence(this.portraitSeqs[0] ?? 0);
    this.portraitInstance = inst;

    const canvas = this.portraitViewer.canvas as HTMLCanvasElement;
    const target = this.portraitTarget;
    const w = Math.max(96, target?.clientWidth || canvas.width || 128);
    const h = Math.max(96, target?.clientHeight || canvas.height || 128);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    this.portraitScene.viewport[0] = 0;
    this.portraitScene.viewport[1] = 0;
    this.portraitScene.viewport[2] = w;
    this.portraitScene.viewport[3] = h;

    const cam = model.cameras?.[0];
    if (cam?.position && cam?.targetPosition) {
      this.portraitScene.camera.perspective(
        (cam.fieldOfView || 0.95) * 0.82,
        w / Math.max(1, h),
        Math.max(2, cam.nearClippingPlane || 8),
        Math.max(500, cam.farClippingPlane || 1000)
      );
      this.portraitScene.camera.moveToAndFace(
        [cam.position[0], cam.position[1], cam.position[2]],
        [cam.targetPosition[0], cam.targetPosition[1], cam.targetPosition[2]],
        [0, 0, 1]
      );
    } else {
      this.portraitScene.camera.perspective(0.75, w / Math.max(1, h), 4, 1000);
      this.portraitScene.camera.moveToAndFace([70, -180, 115], [0, -180, 112], [0, 0, 1]);
    }
  }

  getSimUnits(): { x: number; y: number; team: 0 | 1 | -1; kind: 'creep' | 'neutral' }[] {
    if (!this.sim || !this.simEnabled) return [];
    return this.sim.units
      .filter((u) => u.alive)
      .map((u) => ({ x: u.x, y: u.y, team: u.team, kind: u.kind }));
  }

  private visionOccluders: { level: Uint8Array; tree: Uint8Array } | null = null;
  /**
   * 战争迷雾的视线遮挡数据（128 码一格，原点 (-8192,-8192)，128×128）：
   *  - level：每格的悬崖层（取 4 个地形角 layerHeight 的最小值，悬崖边那一格算低处）
   *  - tree：格内有树（AshenTree 等，DestructableData occH > 0）
   * 地形与树木加载完之前返回 null。
   */
  getVisionOccluders(): { level: Uint8Array; tree: Uint8Array } | null {
    if (this.visionOccluders) return this.visionOccluders;
    const map = this.viewer?.map;
    const corners = map?.corners as { layerHeight: number }[][] | undefined;
    if (!this.terrainReady || !corners?.length || !(map.doodads?.length > 0)) return null;
    const size = 128;
    const x0 = -8192;
    const y0 = -8192;
    const cox = map.centerOffset?.[0] ?? x0;
    const coy = map.centerOffset?.[1] ?? y0;
    const level = new Uint8Array(size * size);
    const tree = new Uint8Array(size * size);
    const at = (col: number, row: number) => corners[Math.max(0, Math.min(corners.length - 1, row))]?.[Math.max(0, Math.min(corners[0].length - 1, col))]?.layerHeight ?? 0;
    for (let cy = 0; cy < size; cy++) {
      for (let cx = 0; cx < size; cx++) {
        const col = Math.round((x0 + cx * 128 - cox) / 128);
        const row = Math.round((y0 + cy * 128 - coy) / 128);
        level[cy * size + cx] = Math.max(0, Math.min(255, Math.min(at(col, row), at(col + 1, row), at(col, row + 1), at(col + 1, row + 1))));
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const d of map.doodads as any[]) {
      const url: string = d?.instance?.model?.fetchUrl || '';
      if (!/Tree/i.test(url)) continue;
      const loc = d.instance.localLocation || d.instance.location;
      if (!loc) continue;
      const cx = Math.floor((loc[0] - x0) / 128);
      const cy = Math.floor((loc[1] - y0) / 128);
      if (cx >= 0 && cy >= 0 && cx < size && cy < size) tree[cy * size + cx] = 1;
    }
    this.visionOccluders = { level, tree };
    return this.visionOccluders;
  }

  /**
   * 开发时组件热替换（HMR）会重建模板 DOM：页面上换成了新的空白 canvas / 输入层，
   * 而渲染器仍在旧元素上画 → 3D 视口一片漆黑、鼠标拖动/滚轮失效。
   * 页面每帧调用一次：把仍在工作的 WebGL 画布与肖像画布放回 DOM，输入监听挪到新的输入层。
   */
  adoptDom(els: { canvas?: HTMLCanvasElement | null; viewLayer?: HTMLElement | null; portrait?: HTMLCanvasElement | null }): void {
    const live = this.options.canvas;
    if (els.canvas && els.canvas !== live && els.canvas.isConnected) {
      live.className = els.canvas.className;
      els.canvas.replaceWith(live);
      this.onResize();
    }
    // 肖像是离屏渲染后拷过来的，换了画布只要改拷贝目标
    if (els.portrait && els.portrait !== this.portraitTarget && els.portrait.isConnected) {
      this.portraitTarget = els.portrait;
    }
    const vl = els.viewLayer;
    if (vl && vl !== this.inputEl && vl.isConnected) {
      const old = this.inputEl;
      old.removeEventListener('pointerdown', this.onPointerDown);
      old.removeEventListener('pointerup', this.onPointerUp);
      old.removeEventListener('pointercancel', this.onPointerUp);
      old.removeEventListener('wheel', this.onWheel);
      old.removeEventListener('contextmenu', this.onContextMenu);
      this.inputEl = vl;
      vl.addEventListener('pointerdown', this.onPointerDown);
      vl.addEventListener('pointerup', this.onPointerUp);
      vl.addEventListener('pointercancel', this.onPointerUp);
      vl.addEventListener('wheel', this.onWheel, { passive: false });
      vl.addEventListener('contextmenu', this.onContextMenu);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private litShaders: any[] = [];
  private light: DncLight = dncLight(12);
  private static sdSources: { vert: string; frag: string } | null = null;

  /**
   * 查看器给「还没加载完的贴图」绑的占位贴图是 2×2 不透明白色（源码注释写的是黑色）。
   * 加载期间英雄脚下的队伍光晕（叠加混合）就画成一块白方块，树和建筑也会先白一下。
   * 改成全透明黑：没加载完的东西先不显示。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static clearEmptyTexture(viewer: any): void {
    const gl: WebGLRenderingContext | undefined = viewer?.gl;
    const tex = viewer?.webgl?.emptyTexture;
    if (!gl || !tex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(16));
  }

  /** 模型（单位/建筑/装饰物）改用原版 DNC 光照：替换 MDX 标清着色器的 lambert() */
  private installModelLighting(): void {
    try {
      const src = Wc3MdxViewer.sdSources;
      const cache = this.viewer.sharedCache?.get?.('mdx');
      if (!src || !cache) return;
      const frag = patchSdFragment(src.frag);
      if (frag === src.frag) return;
      const webgl = this.viewer.webgl;
      const sd = webgl.createShader(src.vert, frag);
      const sdExt = webgl.createShader('#define EXTENDED_BONES\n' + src.vert, frag);
      if (sd) cache.sdShader = sd;
      if (sdExt) cache.sdExtendedShader = sdExt;
      this.litShaders = [sd, sdExt].filter(Boolean);
    } catch (e) {
      console.warn('[wc3] model lighting skipped', e);
    }
    this.setTimeOfDay(12);
  }

  /** 游戏内时间（0–24 时）：地形、悬崖、模型都按 DNC 关键帧取光照 */
  setTimeOfDay(hours: number): void {
    if (this.forcedHours !== null) hours = this.forcedHours;
    this.light = dncLight(hours);
    this.viewer.__wc3Light = this.light;
    const gl: WebGLRenderingContext | undefined = this.viewer.gl;
    if (!gl) return;
    for (const s of this.litShaders) {
      s.use();
      gl.uniform3fv(s.uniforms['u_wc3LightDir'], this.light.dir);
      gl.uniform3fv(s.uniforms['u_wc3Diffuse'], this.light.diffuse);
      gl.uniform3fv(s.uniforms['u_wc3Ambient'], this.light.ambientUnit);
    }
  }

  private forcedHours: number | null = null;
  /** 调试对比：锁定光照时刻（null 恢复跟随游戏时间） */
  forceTimeOfDay(hours: number | null): void {
    this.forcedHours = hours;
    this.setTimeOfDay(hours ?? 12);
  }

  /** 关掉/打开 war3map.shd 烘焙阴影（对比用） */
  setBakedShadows(on: boolean): void {
    this.viewer.__wc3ShadowsOff = !on;
  }

  /** 战争迷雾：按回调隐藏/显示场景模拟单位的模型（hidden 返回 true 即隐藏） */
  setSimUnitsHidden(hidden: (x: number, y: number, team: 0 | 1 | -1) => boolean): void {
    if (!this.sim) return;
    for (const u of this.sim.units) {
      if (!u.alive) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inst = u.instance as any;
      if (hidden(u.x, u.y, u.team)) inst?.hide?.();
      else inst?.show?.();
    }
    // 神符（中立物品）：没有视野的河道里看不到
    for (const r of this.sim.runes) {
      if (!r.alive) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inst = r.instance as any;
      if (hidden(r.x, r.y, -1)) inst?.hide?.();
      else inst?.show?.();
    }
  }

  // --- 战争迷雾：场景画完后在 WebGL 里再画一遍「乘法压暗」网格 ---
  // 网格顶点在迷雾格中心（128 码一格，与 game/fog.ts 的 VisionGrid 对齐），浓度逐顶点插值，
  // 所以边缘是平滑渐变（原版也是），并且整张图都覆盖，不受镜头距离影响。
  private fogDensity: Float32Array | null = null;
  private fogDarkness = 0.6;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private fogGl: { shader: any; pos: WebGLBuffer; den: WebGLBuffer; idx: WebGLBuffer; count: number; bytes: Uint8Array } | null = null;

  /**
   * 设置战争迷雾浓度（128×128，行 0 在南，0 = 清晰，1 = 迷雾）；传 null 关闭。
   * darkness：迷雾最浓处压掉的亮度比例。数组按引用保存，调用方每帧原地更新即可。
   */
  setFogDensity(density: Float32Array | null, darkness = 0.6): void {
    this.fogDensity = density && density.length === 128 * 128 ? density : null;
    this.fogDarkness = darkness;
  }

  private buildFogGl(): void {
    const gl: WebGLRenderingContext = this.viewer.gl;
    const shader = this.viewer.webgl.createShader(
      `uniform mat4 u_VP;
       attribute vec3 a_position;
       attribute float a_density;
       varying float v_density;
       void main() {
         v_density = a_density;
         gl_Position = u_VP * vec4(a_position, 1.0);
       }`,
      `precision mediump float;
       uniform float u_darkness;
       varying float v_density;
       void main() {
         gl_FragColor = vec4(vec3(1.0 - u_darkness * clamp(v_density, 0.0, 1.0)), 1.0);
       }`
    );
    const pos = gl.createBuffer();
    const den = gl.createBuffer();
    const idx = gl.createBuffer();
    if (!shader || !pos || !den || !idx) return;
    const N = 128;
    const x0 = -8192;
    const span = 16384;
    const verts = new Float32Array(N * N * 3);
    for (let cy = 0; cy < N; cy++) {
      for (let cx = 0; cx < N; cx++) {
        // 最外一圈顶点拉到地图边，免得边上留半格没盖住
        const x = cx === 0 ? x0 : cx === N - 1 ? x0 + span : x0 + (cx + 0.5) * 128;
        const y = cy === 0 ? x0 : cy === N - 1 ? x0 + span : x0 + (cy + 0.5) * 128;
        const o = (cy * N + cx) * 3;
        verts[o] = x;
        verts[o + 1] = y;
        verts[o + 2] = this.sampleHeight(x, y) + 8;
      }
    }
    const indices = new Uint16Array((N - 1) * (N - 1) * 6);
    let k = 0;
    for (let cy = 0; cy < N - 1; cy++) {
      for (let cx = 0; cx < N - 1; cx++) {
        const a = cy * N + cx;
        indices[k++] = a;
        indices[k++] = a + 1;
        indices[k++] = a + N + 1;
        indices[k++] = a;
        indices[k++] = a + N + 1;
        indices[k++] = a + N;
      }
    }
    const bytes = new Uint8Array(N * N);
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, den);
    gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this.fogGl = { shader, pos, den, idx, count: indices.length, bytes };
  }

  private renderFog(): void {
    const density = this.fogDensity;
    if (!density || !this.terrainReady) return;
    const scene = this.scene || this.viewer?.map?.worldScene;
    const vp = scene?.camera?.viewProjectionMatrix;
    const gl: WebGLRenderingContext | undefined = this.viewer?.gl;
    if (!vp || !gl) return;
    if (!this.fogGl) this.buildFogGl();
    const f = this.fogGl;
    if (!f) return;
    for (let i = 0; i < f.bytes.length; i++) f.bytes[i] = Math.max(0, Math.min(255, Math.round(density[i] * 255)));
    const hadBlend = gl.isEnabled(gl.BLEND);
    f.shader.use();
    gl.uniformMatrix4fv(f.shader.uniforms['u_VP'], false, vp);
    gl.uniform1f(f.shader.uniforms['u_darkness'], this.fogDarkness);
    gl.bindBuffer(gl.ARRAY_BUFFER, f.pos);
    gl.vertexAttribPointer(f.shader.attribs['a_position'], 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, f.den);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.bytes);
    gl.vertexAttribPointer(f.shader.attribs['a_density'], 1, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, f.idx);
    // 不做深度测试：和原版一样，迷雾里的树、建筑也一起压暗
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    gl.drawElements(gl.TRIANGLES, f.count, gl.UNSIGNED_SHORT, 0);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (!hadBlend) gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  getSimRunes(): SimRune[] {
    if (!this.sim || !this.simEnabled) return [];
    return this.sim.runes.filter((r) => r.alive);
  }

  projectWorldToScreen(x: number, y: number, z: number): { sx: number; sy: number } | null {
    const scene = this.scene || this.viewer?.map?.worldScene;
    const vp = scene?.camera?.viewProjectionMatrix;
    if (!vp) return null;
    const clipW = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (clipW <= 10) return null;
    const clipX = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const clipY = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    const ndcX = clipX / clipW;
    const ndcY = clipY / clipW;
    if (ndcX < -1.15 || ndcX > 1.15 || ndcY < -1.15 || ndcY > 1.15) return null;
    return {
      sx: (ndcX * 0.5 + 0.5) * 100,
      sy: (1.0 - (ndcY * 0.5 + 0.5)) * 100,
    };
  }

  getSimHealthEntities() {
    return this.sim?.getHealthEntities() || [];
  }

  getSimFloatingTexts() {
    return this.sim?.getFloatingTexts() || [];
  }

  getSimGoldTotal() {
    return this.sim?.getGoldTotal() ?? 603;
  }

  setSimSpeed(speed: number): void {
    this.simSpeed = Math.max(0, speed);
  }

  /** 对齐 DotA 场景模拟到录像「号角后」对局时钟；暂停时勿用墙钟空转刷兵 */
  syncSimGameTime(gameTimeMs: number): void {
    this.sim?.syncGameClock(gameTimeMs);
  }
  moveHeroTo(_x: number, _y: number): void {
    // Disabled in spectator/replay mode.
  }

  setSimEnabled(on: boolean): void {
    this.simEnabled = on;
    if (this.syncConfig) this.syncConfig.enabled = on;
    this.sim?.setEnabled(on);
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
    this.pitch = 0.98;
    this.yaw = -Math.PI / 2;
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
      this.yaw = -Math.PI / 2;
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
    // 原版镜头边界（可玩区域减镜头边距），再与地图实际范围取交集
    const b = this.getMapBounds();
    const c = DOTA_CAMERA_BOUNDS;
    const x0 = Math.max(b.x0, c.x0), x1 = Math.min(b.x1, c.x1);
    const y0 = Math.max(b.y0, c.y0), y1 = Math.min(b.y1, c.y1);
    this.target[0] = Math.max(x0, Math.min(x1, this.target[0]));
    this.target[1] = Math.max(y0, Math.min(y1, this.target[1]));
    this.target[2] = this.sampleHeight(this.target[0], this.target[1]) + 80;
  }

  resetCamera(): void {
    this.setCameraMode(this.cameraMode === 'free' ? 'hero' : this.cameraMode);
  }

  /** 强制按当前容器尺寸重配 WebGL 视口（初次布局晚到时调用） */
  resizeToContainer(): void {
    this.onResize();
  }

  dispose(): void {
    this.disposed = true;
    this.sim?.dispose();
    try {
      this.resizeObserver?.disconnect();
    } catch {
      /* ignore */
    }
    this.resizeObserver = undefined;
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.raf);
    }
    this.inputEl.removeEventListener('pointerdown', this.onPointerDown);
    this.inputEl.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointermove', this.onPointerMove);
    document.documentElement.removeEventListener('pointerleave', this.onPointerLeave);
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

  // --- AI 修改开始 [TERRAIN-TRI-HEIGHT]：与 mdx-m3-viewer 地面四边形剖分一致的三角插值贴地（斜坡/高台不再用简单双线性错位） ---
  sampleHeight(x: number, y: number): number {
    const map = this.viewer.map;
    if (!map?.corners?.length || !map.centerOffset) return 0;
    const columns = map.mapSize?.[0] || map.corners[0]?.length || 0;
    const rows = map.mapSize?.[1] || map.corners.length || 0;
    if (columns < 2 || rows < 2) return 0;

    // 与 map.js groundNormal / 注释 heightAt 同一套格子坐标
    let fx = (x - map.centerOffset[0]) / 128;
    let fy = (y - map.centerOffset[1]) / 128;
    fx = Math.max(0, Math.min(columns - 1.0001, fx));
    fy = Math.max(0, Math.min(rows - 1.0001, fy));
    const col = fx | 0;
    const row = fy | 0;
    const sqX = fx - col;
    const sqY = fy - row;

    const h00 = this.cornerHeightUnits(map, row, col);
    const h10 = this.cornerHeightUnits(map, row, col + 1);
    const h01 = this.cornerHeightUnits(map, row + 1, col);
    const h11 = this.cornerHeightUnits(map, row + 1, col + 1);

    // face: (0,0)-(1,0)-(0,1) 与 (1,0)-(1,1)-(0,1)，与地面 index buffer 一致
    let heightUnits: number;
    if (sqX + sqY < 1) {
      heightUnits = h00 + (h10 - h00) * sqX + (h01 - h00) * sqY;
    } else {
      heightUnits = h11 + (h10 - h11) * (1 - sqY) + (h01 - h11) * (1 - sqX);
    }
    return heightUnits * 128;
  }

  /** cornerHeights 编码：groundHeight + layerHeight - 2（与 heightMap 纹理一致） */
  private cornerHeightUnits(map: any, row: number, col: number): number {
    const maxR = (map.corners?.length || 1) - 1;
    const maxC = (map.corners?.[0]?.length || 1) - 1;
    const r = Math.max(0, Math.min(maxR, row));
    const c = Math.max(0, Math.min(maxC, col));
    const corner = map.corners?.[r]?.[c];
    if (!corner) return 0;
    return corner.groundHeight + corner.layerHeight - 2;
  }
  // --- AI 修改结束 [TERRAIN-TRI-HEIGHT] ---

  /** Approximate ground pick: ray vs z = sampleHeight plane near target. */
  /**
   * 屏幕坐标 → 地面世界坐标。
   * 直接对渲染用的 viewProjection 矩阵求逆得到视线，再与地形求交，
   * 与 projectWorldToScreen 严格互逆（手写相机基的旧实现会因 hudShift / FOV 约定不一致而偏移）。
   */
  private pickGround(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = this.options.canvas;
    const rect = canvas.getBoundingClientRect();
    const scene = this.scene || this.viewer?.map?.worldScene;
    const vp = scene?.camera?.viewProjectionMatrix as ArrayLike<number> | undefined;
    if (!vp) return null;
    const inv = invertMat4(vp);
    if (!inv) return null;
    const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    const unproject = (z: number): [number, number, number] | null => {
      const w = inv[3] * nx + inv[7] * ny + inv[11] * z + inv[15];
      if (Math.abs(w) < 1e-9) return null;
      return [
        (inv[0] * nx + inv[4] * ny + inv[8] * z + inv[12]) / w,
        (inv[1] * nx + inv[5] * ny + inv[9] * z + inv[13]) / w,
        (inv[2] * nx + inv[6] * ny + inv[10] * z + inv[14]) / w,
      ];
    };
    const near = unproject(-1);
    const far = unproject(1);
    if (!near || !far) return null;
    const dx = far[0] - near[0];
    const dy = far[1] - near[1];
    const dz = far[2] - near[2];
    // 视线必须朝下才可能落到地面
    if (dz > -1e-6) return null;
    let gz = this.target[2];
    let gx = 0;
    let gy = 0;
    // 逐步逼近真实地形高度（坡地/高台上一次修正不够）
    for (let i = 0; i < 5; i++) {
      const t = (gz - near[2]) / dz;
      gx = near[0] + dx * t;
      gy = near[1] + dy * t;
      gz = this.sampleHeight(gx, gy);
    }
    return { x: gx, y: gy };
  }

  private patchMissingTilesets(): void {
    const td = this.viewer.terrainData;
    if (!td || typeof td.getRow !== 'function' || !td.map) return;
    if (!td.getRow('Zvin') && td.getRow('Cvin')) {
      td.setRow('Zvin', td.getRow('Cvin'));
    }
    if (!td.getRow('Zbks') && td.getRow('Ybtl')) {
      td.setRow('Zbks', td.getRow('Ybtl'));
    } else if (!td.getRow('Zbks') && td.getRow('Cdrt')) {
      td.setRow('Zbks', td.getRow('Cdrt'));
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
    // --- AI 修改开始 [WC3-ASSETS-CASE]：规范化魔兽3模型与贴图路径大小写，修复小兵/商人/雕像/岩石因路径大小写不匹配变成白模的问题 ---
    if (/^war3mapimported\//i.test(p)) {
      p = 'war3mapImported/' + p.slice('war3mapImported/'.length);
    }
    if (/^doodads\//i.test(p)) {
      p = 'Doodads/' + p.slice('doodads/'.length);
      p = p.replace(/\/cinematic\//i, '/Cinematic/');
      p = p.replace(/\/lichking\//gi, '/LichKing/');
      p = p.replace(/\/LichKing\/lichking\.mdxbin$/i, '/LichKing/LichKing.mdxbin');
    }
    if (/^textures\//i.test(p)) {
      p = 'Textures/' + p.slice('textures/'.length);
    }
    if (/^replaceabletextures\//i.test(p)) {
      p = 'ReplaceableTextures/' + p.slice('replaceabletextures/'.length);
    }
    p = p.replace(/\/DruidOfTheTalon\//gi, '/DruidoftheTalon/');
    p = p.replace(/\/DruidOfTheClaw\//gi, '/DruidoftheClaw/');
    p = p.replace(/\/HeroFarseer\//gi, '/HeroFarSeer/');
    p = p.replace(/\/Wheat\.mdxbin$/i, '/wheat.mdxbin');
    p = p.replace(/\/NorthrendTombstone(\d)\.mdxbin$/i, '/NorthrendTombStone$1.mdxbin');
    p = p.replace(/\/brazieromni\.mdxbin$/i, '/brazierOmni.mdxbin');
    p = p.replace(/^SharedModels\/TeamGlow00\.tga$/i, 'ReplaceableTextures/TeamGlow/TeamGlow00.blp');
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
      // 全部用原版 BLP（scripts/extract-team-textures.cjs 导出）。以前 02 以后是 8×8 纯色 PNG 占位，
      // TeamGlow 变成实心方块，能量圈等带队伍光晕的模型显示成一整块亮色
      return `${this.wc3Base}ReplaceableTextures/${teamMatch[1]}/${teamMatch[2]}.blp`;
    }
    // Mal'Furion.blp 等含撇号路径需逐段 encode，否则浏览器/静态服拉失败
    const encoded = p
      .split('/')
      .map((seg) => (seg.includes("'") || /[^\x20-\x7E]/.test(seg) ? encodeURIComponent(seg) : seg))
      .join('/');
    return `${this.wc3Base}${encoded}`;
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
    let p = src.replace(/\\/g, '/');

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
    if (/^(units|buildings|textures|doodads|replaceabletextures)\//i.test(p)) {
      return this.resolveWc3Path(p);
    }
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
    const hudShift = this.cameraMode === 'map' ? 0 : this.distance * 0.09;

    const lookX = tx + cy * hudShift;
    const lookY = ty + sy * hudShift;
    const x = lookX + this.distance * cp * cy;
    const y = lookY + this.distance * cp * sy;
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
    scene.camera.moveToAndFace([x, y, z], [lookX, lookY, tz], [0, 0, 1]);
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

        this.options.onFrame?.(dt);

        if (this.sim && this.simEnabled) {
          this.sim.tick(dt * this.simSpeed);
          for (const t of this.sim.towers) {
            const eye = this.towerEyes.get(t.id);
            if (!eye) continue;
            if (t.alive) eye.show?.();
            else eye.hide?.();
          }
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
        this.viewer.updateAndRender(dt);
        try {
          this.renderFog();
        } catch (e) {
          console.warn('[wc3] fog pass failed', e);
          this.fogDensity = null;
        }
        if (this.portraitViewer && this.portraitInstance) {
          if (this.portraitInstance.sequenceEnded && this.portraitSeqs.length) {
            this.portraitCursor = (this.portraitCursor + 1) % this.portraitSeqs.length;
            this.portraitInstance.setSequence(this.portraitSeqs[this.portraitCursor]);
          }
          this.portraitViewer.updateAndRender(dt);
          this.blitPortrait();
        }
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

/** 4×4 列主序矩阵求逆（gl-matrix 同款展开式）；不可逆时返回 null */
function invertMat4(m: ArrayLike<number>): number[] | null {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * det,
    (a02 * b10 - a01 * b11 - a03 * b09) * det,
    (a31 * b05 - a32 * b04 + a33 * b03) * det,
    (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det,
    (a00 * b11 - a02 * b08 + a03 * b07) * det,
    (a32 * b02 - a30 * b05 - a33 * b01) * det,
    (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det,
    (a01 * b08 - a00 * b10 - a03 * b06) * det,
    (a30 * b04 - a31 * b02 + a33 * b00) * det,
    (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det,
    (a00 * b09 - a01 * b07 + a02 * b06) * det,
    (a31 * b01 - a30 * b03 - a32 * b00) * det,
    (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ];
}
