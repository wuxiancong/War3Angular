/**
 * 原版昼夜光照（DNC）。数据来自 war3.mpq：
 *   Environment\DNC\DNCFelwood\DNCFelwoodTerrain\DNCFelwoodTerrain.mdx（地形，ambientIntensity 0.25）
 *   Environment\DNC\DNCFelwood\DNCFelwoodUnit\DNCFelwoodUnit.mdx（单位/装饰物，ambientIntensity 0.4）
 * 两者都是一盏方向光（intensity 1.3），动画 Stand[333, 60333] 覆盖一整天：frame = 333 + 小时 × 2500。
 *  - KLAC：方向光颜色；KLBC：环境光颜色。MDX 里颜色按 BGR 存，这里已换成 RGB。
 *  - KGRT 四元数 (0.38, -0.22, -0.44, 0.78) 把 (0,0,-1) 转成光线行进方向 ≈ (0.677, 0.399, -0.614)：
 *    阳光从西南上方照向东北。war3map.shd 的烘焙阴影也正好沿 +x/+y 方向拖出，两者吻合。
 * 固定管线算法：颜色 = 贴图 × clamp(环境色×ambI + 光色×I×max(N·L, 0), 0, 1)。
 */

type Key = [frame: number, r: number, g: number, b: number];

/** KLAC（方向光颜色），已从 BGR 换成 RGB */
const DIFFUSE: Key[] = [
  [333, 0.24, 0.66, 0.59],
  [13667, 0.47, 0.88, 0.77],
  [15333, 1, 1, 1],
  [45367, 1, 1, 1],
  [48567, 0.63, 0.91, 0.87],
  [60333, 0.24, 0.66, 0.59],
];

/** KLBC（环境光颜色），已从 BGR 换成 RGB */
const AMBIENT: Key[] = [
  [333, 0.24, 0.51, 0.51],
  [14200, 0.35, 0.73, 0.9],
  [15133, 0.81, 0.78, 0.94],
  [15533, 0.77, 1.0, 0.94],
  [44200, 0.76, 1.0, 0.94],
  [46633, 0.48, 0.75, 0.84],
  [47933, 0.28, 0.75, 0.84],
  [49533, 0.2, 0.75, 0.9],
  [60333, 0.24, 0.51, 0.51],
];

const INTENSITY = 1.3;
const AMB_TERRAIN = 0.25;
const AMB_UNIT = 0.4;
/** 光线行进方向（指向地面），已归一化 */
export const DNC_LIGHT_DIR: [number, number, number] = (() => {
  const v = [0.677, 0.399, -0.614];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

function sample(keys: Key[], frame: number): [number, number, number] {
  if (frame <= keys[0][0]) return [keys[0][1], keys[0][2], keys[0][3]];
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (frame <= b[0]) {
      const a = keys[i - 1];
      const t = (frame - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
    }
  }
  const z = keys[keys.length - 1];
  return [z[1], z[2], z[3]];
}

export interface DncLight {
  dir: [number, number, number];
  /** 方向光颜色 × 强度 */
  diffuse: [number, number, number];
  ambientTerrain: [number, number, number];
  ambientUnit: [number, number, number];
}

/** hours：游戏内 0–24 时 */
export function dncLight(hours: number): DncLight {
  const h = ((hours % 24) + 24) % 24;
  const frame = 333 + h * 2500;
  const d = sample(DIFFUSE, frame);
  const a = sample(AMBIENT, frame);
  return {
    dir: DNC_LIGHT_DIR,
    diffuse: [d[0] * INTENSITY, d[1] * INTENSITY, d[2] * INTENSITY],
    ambientTerrain: [a[0] * AMB_TERRAIN, a[1] * AMB_TERRAIN, a[2] * AMB_TERRAIN],
    ambientUnit: [a[0] * AMB_UNIT, a[1] * AMB_UNIT, a[2] * AMB_UNIT],
  };
}

/** 模型 SD 着色器的 lambert()：换成原版的「环境 + 方向光」并按通道截断 */
export function patchSdFragment(src: string): string {
  const decl = 'uniform vec3 u_wc3LightDir;\nuniform vec3 u_wc3Diffuse;\nuniform vec3 u_wc3Ambient;\n';
  const lambert = /void lambert\(\) \{[\s\S]*?\n\}\n/;
  if (!lambert.test(src)) return src;
  const body = `void lambert() {
  vec4 color = getDiffuseColor();
  if (!u_unshaded) {
    vec3 n = normalize(v_normal);
    float d = max(dot(n, -u_wc3LightDir), 0.0);
    color.rgb *= clamp(u_wc3Ambient + u_wc3Diffuse * d, 0.0, 1.0);
  }
  gl_FragColor = color;
}
`;
  const out = src.replace(lambert, body);
  const at = out.indexOf('varying vec3 v_normal;');
  return at < 0 ? out : out.slice(0, at) + decl + out.slice(at);
}
