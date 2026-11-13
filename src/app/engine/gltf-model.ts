/**
 * glTF model path for the engine: loads .glb/.gltf files with three.js and
 * exposes each spawned copy through the engine's ModelInstance interface, so
 * LaneSim can drive it the same way it drives any other renderer.
 *
 * The engine's world is Z-up with yaw 0 facing +X. three.js is Y-up and glTF
 * models face +Z, so positions map (x, y, z) -> (x, z, -y) and a yaw of θ
 * becomes a rotation of θ + π/2 around three's Y axis.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ModelInstance, ModelSpawner, ModelSpawnRequest } from './types';

export interface GltfLibraryOptions {
  /** Prefix for relative model paths. */
  baseUrl?: string;
  /**
   * Renames animation clips to the sequence names the engine asks for
   * (Stand, Walk, Attack, Death), e.g. { Idle: 'Stand', Run: 'Walk' }.
   */
  clipNames?: Record<string, string>;
  /** Sequences that loop instead of ending. Defaults to Stand and Walk. */
  loopingSequences?: string[];
}

export class GltfModelInstance implements ModelInstance {
  readonly model: { sequences: { name: string }[] };
  sequence = -1;
  sequenceEnded = false;
  location: number[] = [0, 0, 0];
  private readonly mixer: THREE.AnimationMixer;
  private current: THREE.AnimationAction | null = null;

  constructor(
    readonly object: THREE.Object3D,
    private readonly clips: THREE.AnimationClip[],
    sequenceNames: string[],
    private readonly looping: Set<string>,
    private readonly onRemoved: (instance: GltfModelInstance) => void
  ) {
    this.model = { sequences: sequenceNames.map((name) => ({ name })) };
    this.mixer = new THREE.AnimationMixer(object);
    this.mixer.addEventListener('finished', () => {
      this.sequenceEnded = true;
    });
  }

  setLocation(location: number[]): void {
    this.location = [location[0] || 0, location[1] || 0, location[2] || 0];
    this.object.position.set(this.location[0], this.location[2], -this.location[1]);
  }

  /** Accepts the engine's yaw quaternion [0, 0, sin(θ/2), cos(θ/2)]. */
  setRotation(quaternion: number[]): void {
    const yaw = 2 * Math.atan2(quaternion[2] || 0, quaternion[3] ?? 1);
    this.object.rotation.set(0, yaw + Math.PI / 2, 0);
  }

  setSequence(index: number): void {
    const clip = this.clips[index];
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    const loops = this.looping.has(this.model.sequences[index].name);
    action.reset();
    action.setLoop(loops ? THREE.LoopRepeat : THREE.LoopOnce, loops ? Infinity : 1);
    action.clampWhenFinished = true;
    if (this.current && this.current !== action) this.current.stop();
    action.play();
    this.current = action;
    this.sequence = index;
    this.sequenceEnded = false;
  }

  update(dtSec: number): void {
    this.mixer.update(dtSec);
  }

  detach(): void {
    this.object.removeFromParent();
    this.mixer.stopAllAction();
    this.onRemoved(this);
  }

  setScene(scene: THREE.Object3D | null): void {
    if (scene) scene.add(this.object);
    else this.object.removeFromParent();
  }
}

/** Loads glTF models once per URL and spawns independent animated copies. */
export class GltfModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<GLTF | null>>();
  private readonly instances = new Set<GltfModelInstance>();
  private readonly looping: Set<string>;

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly options: GltfLibraryOptions = {}
  ) {
    this.looping = new Set(options.loopingSequences ?? ['Stand', 'Walk']);
  }

  /** A ModelSpawner that can be handed to LaneSim. */
  readonly spawn: ModelSpawner = async (req: ModelSpawnRequest) => {
    const gltf = await this.load(req.path);
    if (!gltf) return null;
    const object = cloneSkinned(gltf.scene);
    object.scale.setScalar(req.scale);
    const names = gltf.animations.map((clip) => this.options.clipNames?.[clip.name] ?? clip.name);
    const instance = new GltfModelInstance(object, gltf.animations, names, this.looping, (i) =>
      this.instances.delete(i)
    );
    instance.setLocation([req.x, req.y, req.z]);
    if (req.sequenceHint) {
      const hint = req.sequenceHint.toLowerCase();
      const index = names.findIndex((n) => n.toLowerCase() === hint);
      if (index >= 0) instance.setSequence(index);
    }
    this.scene.add(object);
    this.instances.add(instance);
    return instance;
  };

  /** Advance every live instance's animation. Call once per rendered frame. */
  update(dtSec: number): void {
    for (const instance of this.instances) instance.update(dtSec);
  }

  dispose(): void {
    for (const instance of [...this.instances]) instance.detach();
    this.cache.clear();
  }

  private load(path: string): Promise<GLTF | null> {
    const url = (this.options.baseUrl ?? '') + path;
    let pending = this.cache.get(url);
    if (!pending) {
      pending = this.loader.loadAsync(url).catch((err) => {
        console.warn(`[engine] could not load model ${url}`, err);
        return null;
      });
      this.cache.set(url, pending);
    }
    return pending;
  }
}
