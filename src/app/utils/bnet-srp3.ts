import * as CryptoJS from 'crypto-js';
import { BigInt as PvpgnBigInt } from './bigint';

export class BnetSRP3 {
  // SRP 常量
  private static readonly N_HEX = 'F8FF1A8B619918032186B68CA0929F21DF410BB68E13C807211B5E71F6A51C24C1171808E4181E151C3DDB3613C0171284A228B2B04E38F31D608167A639DAED';
  private static readonly N = new PvpgnBigInt(globalThis.BigInt('0x' + BnetSRP3.N_HEX));
  private static readonly g = new PvpgnBigInt(47n); // 0x2F
  
  // I: H(g) ^ H(N) 的预计算结果 (20 bytes)
  // 在 PvPGN 中，I 被作为 BigInt 处理，并在 M1 计算时以 Little Endian 序列化。
  // 因此这里存储的是反转后的 Little Endian 字节序。
  private static readonly I_VAL = new Uint8Array([
    0x6C, 0x0E, 0x97, 0xED, 0x0A, 0xF9, 0x6B, 0xAB,
    0xB1, 0x58, 0x89, 0xEB, 0x8B, 0xBA, 0x25, 0xA4,
    0xF0, 0x8C, 0x01, 0xF8
  ]);

  private username: string;
  private password?: string;
  private a: PvpgnBigInt; // 客户端私钥 a
  private s: Uint8Array; // 盐值 (32 bytes)

  constructor(username: string, password?: string, salt?: Uint8Array) {
    this.username = username.toUpperCase();
    this.password = password;

    // 生成随机的 a (32 bytes)
    this.a = PvpgnBigInt.random(32).mod(BnetSRP3.N);

    if (salt) {
      // 在 PvPGN 中，salt 是以 Little Endian 序列化的 BigInt。
      // 但在内部计算 (x 和 M1) 时，使用的是 Big Endian 形式 (raw_salt)。
      // 因此我们需要反转字节序。
      this.s = new Uint8Array(salt).reverse();
    } else {
      // 生成随机的 s (32 bytes)
      const rand = PvpgnBigInt.random(32);
      this.s = rand.getData(32, 1, true);
    }
  }

  // ================= 辅助数学与转换方法 =================

  // Little Endian Bytes -> BigInt
  public static leBytesToBigInt(buf: Uint8Array): PvpgnBigInt {
    return new PvpgnBigInt(buf, 1, false);
  }

  // BigInt -> Little Endian Bytes
  public static bigIntToLeBytes(n: PvpgnBigInt, length: number): Uint8Array {
    return n.getData(length, 1, false);
  }

  // 统一的 SHA1 哈希函数 (返回 Uint8Array)
  private static async sha1(data: Uint8Array): Promise<Uint8Array> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-1', data as BufferSource);
      return new Uint8Array(hashBuffer);
    } else {
      // Fallback for non-HTTPS environments using crypto-js
      const words: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        words.push(
          (data[i] << 24) |
          ((data[i + 1] || 0) << 16) |
          ((data[i + 2] || 0) << 8) |
          (data[i + 3] || 0)
        );
      }
      const wordArray = CryptoJS.lib.WordArray.create(words, data.length);
      const hash = CryptoJS.SHA1(wordArray);
      
      const hashArray = new Uint8Array(hash.sigBytes);
      for (let i = 0; i < hash.sigBytes; i++) {
        hashArray[i] = (hash.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
      }
      return hashArray;
    }
  }

  // ================= SRP 核心逻辑 =================

  // 1. 获取客户端公钥 A = g^a % N
  public getClientSessionPublicKey(): Uint8Array {
    const A = BnetSRP3.g.powm(this.a, BnetSRP3.N);
    return BnetSRP3.bigIntToLeBytes(A, 32);
  }

  // 获取盐值 s (返回给服务器的 Little Endian 格式)
  public getSalt(): Uint8Array {
    return new Uint8Array(this.s).reverse();
  }

  // 设置服务端传来的盐值 (从 Little Endian 转换为内部的 Big Endian)
  public setSalt(salt: Uint8Array) {
    this.s = new Uint8Array(salt).reverse();
  }

  // 计算私钥 x = H(s + H(U:P))
  private async getClientPrivateKey(): Promise<PvpgnBigInt> {
    const userPass = new TextEncoder().encode(`${this.username}:${this.password}`);
    const h1 = await BnetSRP3.sha1(userPass);
    
    const s_h1 = new Uint8Array(this.s.length + h1.length);
    s_h1.set(this.s, 0);
    s_h1.set(h1, this.s.length);
    
    const xBytes = await BnetSRP3.sha1(s_h1);
    return BnetSRP3.leBytesToBigInt(xBytes);
  }

  // 计算扰码 u = H(B) 的前 4 个字节
  private async getScrambler(B_bytes: Uint8Array): Promise<PvpgnBigInt> {
    const hash = await BnetSRP3.sha1(B_bytes);
    // 在 PvPGN 中，u = *(uint32_t*)hash，因为 hash 是 5 个 uint32_t 的数组。
    // 标准 SHA-1 输出的第一个 uint32_t (A) 在字节流中是 Big Endian 的。
    // 所以我们需要将前 4 个字节作为 Big Endian 整数读取。
    const u = (hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3];
    return new PvpgnBigInt(globalThis.BigInt(u >>> 0));
  }

  // 计算客户端 Session Secret S = (B - g^x)^(a + u * x) % N
  private async getClientSecret(B_bytes: Uint8Array): Promise<PvpgnBigInt> {
    const B = BnetSRP3.leBytesToBigInt(B_bytes);
    const x = await this.getClientPrivateKey();
    const u = await this.getScrambler(B_bytes);

    const g_pow_x = BnetSRP3.g.powm(x, BnetSRP3.N);
    
    // base = (B - g^x) % N (注意处理负数)
    let baseVal = (B.value - g_pow_x.value) % BnetSRP3.N.value;
    if (baseVal < 0n) baseVal += BnetSRP3.N.value;
    const base = new PvpgnBigInt(baseVal);

    const exp = new PvpgnBigInt(this.a.value + (u.value * x.value));
    return base.powm(exp, BnetSRP3.N);
  }

  // 计算会话密钥 K = Interleave(H(S_even), H(S_odd))
  public async getHashedClientSecret(B_bytes: Uint8Array): Promise<Uint8Array> {
    const S = await this.getClientSecret(B_bytes);
    const sBytes = BnetSRP3.bigIntToLeBytes(S, 32);

    const odd = new Uint8Array(16);
    const even = new Uint8Array(16);

    for (let i = 0; i < 16; i++) {
      odd[i] = sBytes[i * 2];
      even[i] = sBytes[i * 2 + 1];
    }

    const oddHash = await BnetSRP3.sha1(odd);
    const evenHash = await BnetSRP3.sha1(even);

    const K = new Uint8Array(40);
    for (let i = 0; i < 20; i++) {
      K[i * 2] = oddHash[i];
      K[i * 2 + 1] = evenHash[i];
    }

    return K;
  }

  // 计算 M1 证明 = H(I + H(U) + s + A + B + K)
  public async getClientPasswordProof(B_bytes: Uint8Array): Promise<Uint8Array> {
    const K = await this.getHashedClientSecret(B_bytes);
    const A_bytes = this.getClientSessionPublicKey();

    const hU = await BnetSRP3.sha1(new TextEncoder().encode(this.username));

    // 拼接所有部分
    const proofData = new Uint8Array(20 + 20 + 32 + 32 + 32 + 40);
    let offset = 0;
    
    proofData.set(BnetSRP3.I_VAL, offset); offset += 20;
    proofData.set(hU, offset); offset += 20;
    proofData.set(this.s, offset); offset += 32;
    proofData.set(A_bytes, offset); offset += 32;
    proofData.set(B_bytes, offset); offset += 32;
    proofData.set(K, offset);

    return await BnetSRP3.sha1(proofData);
  }

  // 注册用：计算 Verifier v = g^x % N
  public async getVerifier(): Promise<Uint8Array> {
    const x = await this.getClientPrivateKey();
    const v = BnetSRP3.g.powm(x, BnetSRP3.N);
    return BnetSRP3.bigIntToLeBytes(v, 32);
  }
}

