/** 原生控制台 HUD 的共用部分：在线对战页（play-3d）与录像页（replay-3d）用同一套坐标与样式。 */
export const NUI = '/assets/wc3/native-ui';
/** UI 单位(0.8×0.6，原点左上) → 百分比样式 */
export function U(x: number, y: number, w: number, h: number): string {
  return `left:${(x / 0.8) * 100}%;top:${(y / 0.6) * 100}%;width:${(w / 0.8) * 100}%;height:${(h / 0.6) * 100}%`;
}
/** 底部控制台贴图像素(1600×352，1 单位=2000px) → 百分比样式 */
export function B(x: number, y: number, w: number, h: number): string {
  return U(x / 2000, 0.424 + y / 2000, w / 2000, h / 2000);
}

/** 各帧矩形。顶栏数值来自 ResourceBar.fdf / Multiboard.fdf；底部来自控制台贴图镂空（见 native-ui/manifest.json） */
export const W3_LAYOUT = {
  time: U(0.336, 0, 0.128, 0.064),
  resGoldIcon: U(0.46172, 0.003125, 0.01640625, 0.01640625),
  resGold: U(0.47516, 0.003125, 0.06, 0.01640625),
  resLumberIcon: U(0.46172 + 0.0859375, 0.003125, 0.01640625, 0.01640625),
  resLumber: U(0.561875, 0.003125, 0.06, 0.01640625),
  resSupply: U(0.64859, 0.003125, 0.06, 0.01640625),
  resUpkeep: U(0.72109, 0.003125, 0.07578125, 0.01640625),
  mbBtn: U(0.778, 0.0262, 0.018, 0.0175),
  mbTitle: `right:${((0.8 - 0.778 - 0.0057) / 0.8) * 100}%;top:${(0.0262 / 0.6) * 100}%;height:${(0.0175 / 0.6) * 100}%`,
  mbBoard: `right:${((0.8 - 0.796) / 0.8) * 100}%;top:${((0.0262 + 0.0175 - 0.004) / 0.6) * 100}%`,
  minimap: B(20, 58, 276, 279),
  portrait: B(435, 122, 144, 168),
  hpText: B(437, 298, 140, 22),
  mpText: B(437, 325, 141, 20),
  // SimpleInfoPanelUnitDetail：取自 game.dll(1.26) 的硬编码——BOTTOMLEFT 锚在屏幕 (0.309375, 0)，宽 0.188125，高 0.1140625。
  // 换算成控制台贴图像素（1 单位 = 2000px，贴图高 352）：left 618.75，top 352−228.125=123.875。
  // 面板内部：图标行宽 0.0940625（半个面板），首行 TOPLEFT 偏移 (0, −0.03125)，行高 0.03125（见 SimpleInfoPanel.fdf）。
  info: B(618.75, 123.875, 376.25, 228.125),
  invCover: B(992, 0, 256, 352),
  inv: [0, 1, 2, 3, 4, 5].map((i) => B(1032 + (i % 2) * 78, 126 + Math.floor(i / 2) * 78, 66, 66)),
  cmd: Array.from({ length: 12 }, (_, i) => B([1233, 1321, 1408, 1495][i % 4], [86, 173, 260][Math.floor(i / 4)], 79, 79)),
};

/** 样式在同目录的 w3-hud.css，两个页面用 styleUrl 引用（组件热更新会追踪 .css 文件，追踪不到 TS 里导入的样式字符串） */
