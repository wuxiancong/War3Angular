import * as THREE from 'three';
import type { MdxGeoset, MdxJsonModel } from './mdx-json.types';

const textureCache = new Map<string, THREE.Texture>();
const failedTextures = new Set<string>();

/** WC3 is Z-up; Three.js is Y-up. */
function wc3ToThree(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y];
}

function resolveTextureCandidates(texturePath: string, baseUrl: string): string[] {
  if (!texturePath) {
    return [];
  }
  const normalized = texturePath.replace(/\\/g, '/');
  const fileName = normalized.split('/').pop() || normalized;
  const stem = fileName.replace(/\.(png|blp|jpg|jpeg)$/i, '');
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return [
    `${base}${normalized}`,
    `${base}Textures/${fileName}`,
    `${base}${fileName}`,
    `${base}Textures/${stem}.png`,
    `${base}Textures/${stem}.jpg`,
    `${base}${stem}.png`,
    `${base}${stem}.jpg`,
  ];
}

async function loadTexture(texturePath: string, baseUrl: string): Promise<THREE.Texture | null> {
  if (!texturePath) {
    return null;
  }
  const cacheKey = `${baseUrl}|${texturePath}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }
  if (failedTextures.has(cacheKey)) {
    return null;
  }

  const loader = new THREE.TextureLoader();
  const candidates = resolveTextureCandidates(texturePath, baseUrl);

  for (const url of candidates) {
    try {
      const tex = await new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = true;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      textureCache.set(cacheKey, tex);
      return tex;
    } catch {
      // try next candidate
    }
  }

  failedTextures.add(cacheKey);
  return null;
}

function isEffectTexture(texturePath: string): boolean {
  const n = texturePath.toLowerCase();
  return /glow|flame|tornado|ribbon|blur|genericglow/.test(n);
}

function buildMaterial(texture: THREE.Texture | null, texturePath: string): THREE.Material {
  if (texture && isEffectTexture(texturePath)) {
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
    });
  }

  if (texture) {
    return new THREE.MeshStandardMaterial({
      map: texture,
      metalness: 0.05,
      roughness: 0.72,
      side: THREE.DoubleSide,
    });
  }

  // Team-color / missing texture geosets: muted placeholder
  return new THREE.MeshStandardMaterial({
    color: 0x6b4f2a,
    metalness: 0.1,
    roughness: 0.8,
    side: THREE.DoubleSide,
    transparent: !texturePath,
    opacity: texturePath ? 1 : 0.35,
  });
}

export function createMdxMesh(geoset: MdxGeoset, texture: THREE.Texture | null): THREE.Mesh {
  const vertCount = geoset.vertices.length / 3;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);

  for (let i = 0; i < vertCount; i++) {
    const [x, y, z] = wc3ToThree(
      geoset.vertices[i * 3],
      geoset.vertices[i * 3 + 1],
      geoset.vertices[i * 3 + 2]
    );
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    if (geoset.normals.length >= (i + 1) * 3) {
      const [nx, ny, nz] = wc3ToThree(
        geoset.normals[i * 3],
        geoset.normals[i * 3 + 1],
        geoset.normals[i * 3 + 2]
      );
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[i * 3] = nx / len;
      normals[i * 3 + 1] = ny / len;
      normals[i * 3 + 2] = nz / len;
    } else {
      normals[i * 3 + 1] = 1;
    }

    if (geoset.uvs.length >= (i + 1) * 2) {
      uvs[i * 2] = geoset.uvs[i * 2];
      uvs[i * 2 + 1] = 1 - geoset.uvs[i * 2 + 1];
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(Array.from(geoset.faces));
  geometry.computeBoundingSphere();

  const material = buildMaterial(texture, geoset.texture || '');
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `geoset_${geoset.index}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface LoadedMdxModel {
  group: THREE.Group;
  model: MdxJsonModel;
  bodyMeshes: THREE.Mesh[];
  effectMeshes: THREE.Mesh[];
}

export async function loadMdxJsonModel(
  jsonUrl: string,
  options?: { includeEffects?: boolean }
): Promise<LoadedMdxModel> {
  const includeEffects = options?.includeEffects !== false;
  const response = await fetch(jsonUrl);
  if (!response.ok) {
    throw new Error(`Failed to load model JSON: ${jsonUrl} (${response.status})`);
  }
  const model = (await response.json()) as MdxJsonModel;
  const baseUrl = jsonUrl.replace(/\/[^/]*$/, '/');

  const group = new THREE.Group();
  group.name = model.name || 'mdx';
  const bodyMeshes: THREE.Mesh[] = [];
  const effectMeshes: THREE.Mesh[] = [];

  for (const geoset of model.geosets) {
    const isEffect = isEffectTexture(geoset.texture || '');
    if (isEffect && !includeEffects) {
      continue;
    }
    // Skip empty-texture geosets that are likely team-color ribbons until we wire replaceable IDs
    if (!geoset.texture && geoset.vertices.length < 200) {
      continue;
    }

    const texture = await loadTexture(geoset.texture, baseUrl);
    const mesh = createMdxMesh(geoset, texture);
    group.add(mesh);
    if (isEffect) {
      effectMeshes.push(mesh);
    } else {
      bodyMeshes.push(mesh);
    }
  }

  // Fit using body meshes only — effect ribbons/tornados inflate the AABB and shrink the hero to a speck
  const box = new THREE.Box3();
  if (bodyMeshes.length) {
    for (const m of bodyMeshes) {
      box.expandByObject(m);
    }
  } else {
    box.setFromObject(group);
  }

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // Pivot: offset then scale so feet land on y=0 (scale must be on parent of the offset)
  const pivot = new THREE.Group();
  pivot.name = `${group.name}_pivot`;
  group.position.set(-center.x, -box.min.y, -center.z);
  pivot.add(group);

  const targetHeight = 2.2;
  if (size.y > 0.001) {
    pivot.scale.setScalar(targetHeight / size.y);
  }

  return { group: pivot, model, bodyMeshes, effectMeshes };
}
