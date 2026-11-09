const fs = require('fs');
const path = 'src/app/pages/replay-3d.component.ts';
let s = fs.readFileSync(path, 'utf8');

const boot = `  private async boot(attempt = 0): Promise<void> {
    // 地形就绪即结束 loading 并开渲，不再等英雄/兵线全部加载完
    const canvas = this.glCanvas()?.nativeElement;
    if (!canvas) {
      if (attempt < 30 && !this.disposed) {
        await new Promise((r) => setTimeout(r, 50));
        return this.boot(attempt + 1);
      }
      this.error.set('视口未就绪');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    await this.waitForViewport(canvas);

    void this.loadMinimapBuildings();
    void this.loadReplayData();

    try {
      const rect = canvas.getBoundingClientRect();
      const parent = canvas.parentElement?.getBoundingClientRect();
      canvas.width = Math.max(640, Math.floor(Math.max(rect.width, parent?.width || 0)) || 1280);
      canvas.height = Math.max(360, Math.floor(Math.max(rect.height, parent?.height || 0)) || 720);

      // 启动即加载先知 MalFurionNoStag，刷新即可验证
      const furion = getHeroByKey('emns');
      const modelUrl =
        furion?.modelUrl || '/assets/wc3/Units/NightElf/MalFurion/MalFurionNoStag.mdxbin';
      const assetBaseUrl =
        furion?.assetBaseUrl || '/assets/wc3/Units/NightElf/MalFurion/';

      const mdx = await Wc3MdxViewer.create({
        canvas,
        viewLayer: this.viewLayer()?.nativeElement,
        modelUrl,
        assetBaseUrl,
        teamColor: 0,
        initialSequence: 'Stand',
        syncOverrides: this.syncOverridesFromQuery() as any,
      });
      this.mdx = mdx;
      this.currentHeroModelUrl = modelUrl;

      const loadPromise = mdx.load();
      // 地形 mesh 一就绪就显示画面（startLoop 已在 load 内启动）
      const terrainWaitStart = performance.now();
      while (!mdx.terrainReady && performance.now() - terrainWaitStart < 60000 && !this.disposed) {
        await new Promise<void>((r) => setTimeout(r, 30));
      }
      mdx.resizeToContainer();
      this.pollSequence();
      this.loading.set(false);

      try {
        await loadPromise;
      } finally {
        if (this.disposed) {
          mdx.dispose();
          return;
        }
        // 启动时 HUD 同步为先知（ZH 序 20）
        if (furion) this.applyHeroRosterEntry(furion, true);
        else {
          this.modelName.set('MalFurionNoStag');
          this.currentHeroKey.set('emns');
          this.heroPresetLocked.set(true);
          this.heroNameCn.set('先知');
          this.heroTitle.set('先知 · 远程智力');
        }
        this.spiritBearSummoned = false;
        this.sequences.set(mdx.sequences || []);
        this.buildingCount.set(mdx.buildings?.length || 0);
        this.cameraMode.set(mdx.cameraMode || 'hero');
        this.ensureSimAlwaysOn();
        this.simUnits.set(mdx.simUnitCount || 0);
        this.applyReplayFrame(this.currentMs());
        this.syncActiveSequence();
        const pCanvas = this.portraitCanvas()?.nativeElement;
        if (pCanvas) {
          void mdx.attachPortraitCanvas(pCanvas);
        }
        mdx.resizeToContainer();
        requestAnimationFrame(() => {
          mdx.resizeToContainer();
          requestAnimationFrame(() => mdx.resizeToContainer());
        });
      }
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error
          ? e.message || e.name || String(e)
          : typeof e === 'string'
            ? e
            : JSON.stringify(e);
      this.error.set(msg || '未知错误');
      this.loading.set(false);
      if (attempt < 1 && !this.disposed) {
        this.mdx?.dispose();
        this.mdx = undefined;
        await new Promise((r) => setTimeout(r, 200));
        return this.boot(attempt + 1);
      }
    }
  }
`;

const re = /private async boot\(attempt = 0\): Promise<void> \{[\s\S]*?\n  private syncActiveSequence/;
if (!re.test(s)) {
  console.error('boot method not found');
  process.exit(1);
}
s = s.replace(re, boot + '\n  private syncActiveSequence');

// Also fix waitForViewport comment if still mojibake
s = s.replace(
  /\/\*\* [^\n]*flex 布局给出真实宽高；已有尺寸则立刻返回 \*\//,
  '/** 等 flex 布局给出真实宽高；已有尺寸则立刻返回 */'
);

fs.writeFileSync(path, s, 'utf8');
const out = fs.readFileSync(path, 'utf8');
console.log({
  fffd: (out.match(/\uFFFD/g) || []).length,
  hasFurion: out.includes("getHeroByKey('emns')"),
  hasMdxCreate: out.includes('Wc3MdxViewer.create'),
  hasSync: out.includes('private syncActiveSequence'),
});
