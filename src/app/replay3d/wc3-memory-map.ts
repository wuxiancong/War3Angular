/**
 * DotA / WC3 map files served from extracted named buffers (bypasses broken MPQ zlib).
 */

export class MemoryMpqFile {
  nameResolved = true;

  constructor(
    public name: string,
    private readonly data: Uint8Array
  ) {}

  bytes(): Uint8Array {
    return this.data;
  }

  arrayBuffer(): ArrayBuffer {
    const copy = new Uint8Array(this.data.byteLength);
    copy.set(this.data);
    return copy.buffer;
  }

  text(): string {
    return new TextDecoder('utf-8').decode(this.data);
  }
}

export class MemoryMpqArchive {
  constructor(private readonly files: Map<string, Uint8Array>) {}

  get(name: string): MemoryMpqFile | null {
    const key = String(name).replace(/\//g, '\\');
    const buf =
      this.files.get(key.toLowerCase()) ||
      this.files.get(key) ||
      this.files.get(name.toLowerCase());
    if (!buf) return null;
    return new MemoryMpqFile(key, buf);
  }

  has(name: string): boolean {
    return !!this.get(name);
  }
}

/** Load war3map.* from /assets/maps/dota683/named/ */
export async function loadDotaNamedMapFiles(
  baseUrl = '/assets/maps/dota683/named/'
): Promise<Map<string, Uint8Array>> {
  const names = [
    'war3map.w3e',
    'war3map.w3i',
    'war3map.doo',
    'war3map.wpm',
    'war3map.mmp',
    'war3map.shd',
    'war3map.w3d',
    'war3map.w3b',
  ];
  const base = baseUrl.replace(/\/?$/, '/');
  const files = new Map<string, Uint8Array>();
  await Promise.all(
    names.map(async (name) => {
      const res = await fetch(`${base}${name}`);
      if (!res.ok) {
        console.warn(`[wc3-map] missing ${name}: ${res.status}`);
        return;
      }
      files.set(name.toLowerCase(), new Uint8Array(await res.arrayBuffer()));
    })
  );
  if (!files.has('war3map.w3e')) {
    throw new Error('缺少 war3map.w3e，无法构建 3D 地形');
  }
  return files;
}

/**
 * Patch War3Map.load so War3MapViewer uses in-memory named files
 * (DotA protected MPQ / MPQEditor zlib is unreadable by mdx-m3-viewer).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function installMemoryMapLoader(War3MapCtor: any, files: Map<string, Uint8Array>): void {
  War3MapCtor.prototype.load = function loadMemoryMap(_buffer: unknown, readonly = false) {
    this.readonly = readonly;
    this.archive = new MemoryMpqArchive(files);
    if (!this.imports) {
      this.imports = { entries: new Map(), set() {}, delete() {}, rename() {}, load() {} };
    }
  };
}
