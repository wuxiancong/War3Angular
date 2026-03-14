export class BnetHash {
  private static ROTL32(x: number, n: number): number {
    n = n & 31;
    if (n === 0) return x >>> 0;
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  }

  /**
   * 计算暴雪密码哈希 (Blizzard Password Hash / Broken SHA-1)
   * 用于 PvPGN 账号创建 (对应数据库的 sc_hash / acct_passhash1 字段)。
   * 
   * 注意：
   * 1. 此函数会严格按照传入的字符串大小写进行哈希计算。
   * 2. 因为客户端已被 Hook，魔兽争霸3 (Warcraft III) 现在支持区分大小写的密码登录。
   * 3. 星际争霸 (StarCraft) 和暗黑破坏神 (Diablo) 依然保持原来的纯小写逻辑。
   *    因此，如果是为了兼容星际/暗黑生成 sc_hash，在调用此函数前，必须在外部手动调用 password.toLowerCase()。
   */
  public static hashPassword(password: string): string {
    const data = new TextEncoder().encode(password);
    
    const hash = new Uint32Array([
      0x67452301,
      0xefcdab89,
      0x98badcfe,
      0x10325476,
      0xc3d2e1f0
    ]);

    let size = data.length;
    let offset = 0;

    if (size === 0) {
      return BnetHash.hashToStr(hash);
    }

    while (size > 0) {
      const inc = size > 64 ? 64 : size;
      const tmp = new Uint32Array(80);

      // hash_set_16 (Little Endian, zero padding, no 0x80, no length)
      let pos = 0;
      for (let i = 0; i < 16; i++) {
        let val = 0;
        if (pos < inc) val |= data[offset + pos];
        pos++;
        if (pos < inc) val |= data[offset + pos] << 8;
        pos++;
        if (pos < inc) val |= data[offset + pos] << 16;
        pos++;
        if (pos < inc) val |= data[offset + pos] << 24;
        pos++;
        tmp[i] = val >>> 0;
      }

      // do_hash message schedule
      for (let i = 0; i < 64; i++) {
        const xorSum = tmp[i] ^ tmp[i + 8] ^ tmp[i + 2] ^ tmp[i + 13];
        // do_blizzard_hash uses ROTL32(1, xorSum)
        tmp[i + 16] = BnetHash.ROTL32(1, xorSum);
      }

      let a = hash[0];
      let b = hash[1];
      let c = hash[2];
      let d = hash[3];
      let e = hash[4];
      let g = 0;

      let i = 0;
      // Round 1
      for (; i < 20; i++) {
        g = (tmp[i] + BnetHash.ROTL32(a, 5) + e + ((b & c) | (~b & d)) + 0x5a827999) >>> 0;
        e = d;
        d = c;
        c = BnetHash.ROTL32(b, 30);
        b = a;
        a = g;
      }

      // Round 2
      for (; i < 40; i++) {
        g = ((d ^ c ^ b) + e + BnetHash.ROTL32(a, 5) + tmp[i] + 0x6ed9eba1) >>> 0;
        e = d;
        d = c;
        c = BnetHash.ROTL32(b, 30);
        b = a;
        a = g;
      }

      // Round 3
      for (; i < 60; i++) {
        // C++ code uses - 0x70e44324, which is equivalent to + 0x8F1BBCDC in 32-bit unsigned
        g = (tmp[i] + BnetHash.ROTL32(a, 5) + e + ((c & b) | (d & c) | (d & b)) - 0x70e44324) >>> 0;
        e = d;
        d = c;
        c = BnetHash.ROTL32(b, 30);
        b = a;
        a = g;
      }

      // Round 4
      for (; i < 80; i++) {
        // C++ code uses - 0x359d3e2a, which is equivalent to + 0xCA62C1D6 in 32-bit unsigned
        g = ((d ^ c ^ b) + e + BnetHash.ROTL32(a, 5) + tmp[i] - 0x359d3e2a) >>> 0;
        e = d;
        d = c;
        c = BnetHash.ROTL32(b, 30);
        b = a;
        a = g;
      }

      hash[0] = (hash[0] + a) >>> 0;
      hash[1] = (hash[1] + b) >>> 0;
      hash[2] = (hash[2] + c) >>> 0;
      hash[3] = (hash[3] + d) >>> 0;
      hash[4] = (hash[4] + e) >>> 0;

      offset += inc;
      size -= inc;
    }

    return BnetHash.hashToStr(hash);
  }

  private static hashToStr(hash: Uint32Array): string {
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += hash[i].toString(16).padStart(8, '0');
    }
    return result;
  }
}
