/**
 * 复刻自 PvPGN bigint.cpp
 * 用于处理 PvPGN 特有的字节块处理 (blockSize) 和大小端转换逻辑。
 */
export class BigInt {
  private _value: bigint;

  constructor(input: Uint8Array | bigint | number, blockSize = 1, bigEndian = true) {
    if (typeof input === 'bigint') {
      this._value = input;
    } else if (typeof input === 'number') {
      this._value = globalThis.BigInt(input);
    } else {
      // 复刻 BigInt::BigInt(unsigned char const * input, int input_size, int blockSize, bool bigEndian)
      const inBuf = new Uint8Array(input);
      
      if (!bigEndian) {
        if (blockSize > 1) {
          // assert(blockSize % 2 == 0);
          for (let i = 0; i < inBuf.length; i += blockSize) {
            for (let j = 0; j < Math.floor(blockSize / 2); j++) {
              const idx1 = i + j;
              const idx2 = i + blockSize - (j + 1);
              if (idx2 < inBuf.length) {
                const temp = inBuf[idx1];
                inBuf[idx1] = inBuf[idx2];
                inBuf[idx2] = temp;
              }
            }
          }
        }
        // bigint.cpp 中如果不使用 bigEndian，内部处理逻辑会涉及到指针移动方向
        // 在 TS 中，我们统一转为大端序 BigInt 处理
        inBuf.reverse();
      }

      let hex = '';
      for (const byte of inBuf) {
        hex += byte.toString(16).padStart(2, '0');
      }
      this._value = globalThis.BigInt('0x' + (hex || '0'));
    }
  }

  public get value(): bigint {
    return this._value;
  }

  /**
   * 复刻 BigInt::powm
   */
  public powm(exp: BigInt, mod: BigInt): BigInt {
    let res = 1n;
    let b = this._value % mod.value;
    let e = exp.value;
    const m = mod.value;

    while (e > 0n) {
      if (e % 2n === 1n) res = (res * b) % m;
      e = e / 2n;
      b = (b * b) % m;
    }
    return new BigInt(res);
  }

  /**
   * 复刻 BigInt::getData
   */
  public getData(byteCount: number, blockSize = 1, bigEndian = true): Uint8Array {
    let hex = this._value.toString(16);
    if (hex.length % 2 !== 0) hex = '0' + hex;
    
    const out = new Uint8Array(byteCount);
    let j = byteCount - 1;
    for (let i = hex.length; i > 0; i -= 2) {
      if (j < 0) break;
      out[j--] = parseInt(hex.substring(Math.max(0, i - 2), i), 16);
    }

    if (!bigEndian && blockSize > 1) {
      // 复刻 BigInt::getData 中的反转逻辑
      for (let i = 0; i < byteCount; i += blockSize) {
        for (let j = 0; j < Math.floor(blockSize / 2); j++) {
          const idx1 = i + j;
          const idx2 = i + blockSize - (j + 1);
          if (idx2 < byteCount) {
            const val = out[idx1];
            out[idx1] = out[idx2];
            out[idx2] = val;
          }
        }
      }
    }
    return out;
  }

  public toHexString(): string {
    return this._value.toString(16).padStart(2, '0');
  }

  // 运算符重载模拟
  public add(other: BigInt): BigInt { return new BigInt(this._value + other.value); }
  public sub(other: BigInt): BigInt { return new BigInt(this._value - other.value); }
  public mul(other: BigInt): BigInt { return new BigInt(this._value * other.value); }
  public div(other: BigInt): BigInt { return new BigInt(this._value / other.value); }
  public mod(other: BigInt): BigInt { return new BigInt(this._value % other.value); }
  public lt(other: BigInt): boolean { return this._value < other.value; }
  public gt(other: BigInt): boolean { return this._value > other.value; }
  public eq(other: BigInt): boolean { return this._value === other.value; }

  public static random(size: number): BigInt {
    const arr = new Uint8Array(size);
    globalThis.crypto.getRandomValues(arr);
    return new BigInt(arr, 1, true);
  }
}
