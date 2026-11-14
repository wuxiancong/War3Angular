<?php
/**
 * Battle.net / PvPGN SRP3 工具
 * 对齐 War3Server common/bnetsrp3.cpp 与建号时 salt/verifier 落库格式。
 */
class BnetSRP3Helper {
    // 与 bnetsrp3.cpp 一致的 32 字节模数 N、生成元 g
    private const N_HEX = 'F8FF1A8B619918032186B68CA092B5557E976C78C73212D91216F6658523C787';
    private const G = 47;

    /**
     * 为新密码生成 PvPGN 可存储的 salt / verifier（以及 SC 用 passhash1）
     * @return array{salt_hex:string,verifier_hex:string,passhash1:string,salt_bin:string,verifier_bin:string}
     */
    public static function generateCredentials(string $username, string $password): array {
        $saltBin = random_bytes(32);
        $verifierBin = self::computeVerifier($username, $password, $saltBin);

        require_once __DIR__ . '/pvpgn_hash.inc.php';
        $lpass = strtolower(substr($password, 0, 19));
        $passhash1 = pvpgn_hash($lpass);

        return [
            'salt_bin' => $saltBin,
            'verifier_bin' => $verifierBin,
            'salt_hex' => self::bytesToPvpgnHex($saltBin),
            'verifier_hex' => self::bytesToPvpgnHex($verifierBin),
            'passhash1' => $passhash1,
        ];
    }

    /**
     * 复刻建号：salt 按 blockSize=4 LE 载入，setSalt 后取 BE raw_salt 算 x，v=g^x mod N，
     * verifier 按 getData(32, 4, false) 导出。
     */
    public static function computeVerifier(string $username, string $password, string $saltBin): string {
        if (strlen($saltBin) !== 32) {
            throw new InvalidArgumentException('salt must be 32 bytes');
        }

        $user = strtoupper($username);
        $userpass = $user . ':' . $password;
        $h1 = self::littleEndianSha1($userpass);

        // BigInt(salt, 32, 4, false) → setSalt → getData(32) big-endian = raw_salt
        $rawSalt = self::bigintGetDataBe(self::bytesToBigIntLeBlock($saltBin, 4), 32);

        $xHash = self::littleEndianSha1($rawSalt . $h1);
        // BigInt(xHash, 20, 1, false)
        $x = self::bytesToBigIntLeBlock($xHash, 1);

        $v = self::modPow(self::G, $x, self::N_HEX);
        // getData(32, 4, false)
        return self::bigintGetDataLeBlock($v, 32, 4);
    }

    /** PvPGN str_to_hex：每字节 "XX " */
    public static function bytesToPvpgnHex(string $bin): string {
        $out = '';
        $len = strlen($bin);
        for ($i = 0; $i < $len; $i++) {
            $out .= sprintf('%02X ', ord($bin[$i]));
        }
        return $out;
    }

    /** little_endian_sha1_hash：标准 SHA1 后对 5 个 uint32 做字节序翻转 */
    private static function littleEndianSha1(string $data): string {
        $hash = sha1($data, true);
        $out = '';
        for ($i = 0; $i < 20; $i += 4) {
            $out .= $hash[$i + 3] . $hash[$i + 2] . $hash[$i + 1] . $hash[$i];
        }
        return $out;
    }

    /**
     * 对齐 BigInt(bytes, size, blockSize, bigEndian=false)
     * 返回十六进制大端整数字符串（无 0x 前缀）
     */
    private static function bytesToBigIntLeBlock(string $input, int $blockSize): string {
        $size = strlen($input);
        $buf = $input;
        if ($blockSize > 1) {
            $arr = array_values(unpack('C*', $buf));
            for ($i = 0; $i < $size; $i += $blockSize) {
                for ($j = 0; $j < intdiv($blockSize, 2); $j++) {
                    $a = $i + $j;
                    $b = $i + $blockSize - ($j + 1);
                    if ($b < $size) {
                        $tmp = $arr[$a];
                        $arr[$a] = $arr[$b];
                        $arr[$b] = $tmp;
                    }
                }
            }
            $buf = pack('C*', ...$arr);
        }
        // 再按 little-endian 指针从末尾读入 → 等价于整体反转后按大端解析
        $be = strrev($buf);
        return bin2hex($be);
    }

    /** getData(byteCount) bigEndian=true */
    private static function bigintGetDataBe(string $hexValue, int $byteCount): string {
        $hex = strtolower($hexValue);
        $hex = ltrim($hex, '0');
        if ($hex === '') {
            $hex = '0';
        }
        if (strlen($hex) % 2 !== 0) {
            $hex = '0' . $hex;
        }
        $bin = hex2bin($hex);
        if ($bin === false) {
            $bin = '';
        }
        if (strlen($bin) > $byteCount) {
            $bin = substr($bin, -$byteCount);
        }
        return str_pad($bin, $byteCount, "\0", STR_PAD_LEFT);
    }

    /** getData(byteCount, blockSize, bigEndian=false) */
    private static function bigintGetDataLeBlock(string $hexValue, int $byteCount, int $blockSize): string {
        $be = self::bigintGetDataBe($hexValue, $byteCount);
        if ($blockSize <= 1) {
            return strrev($be);
        }
        $arr = array_values(unpack('C*', $be));
        for ($i = 0; $i < $byteCount; $i += $blockSize) {
            for ($j = 0; $j < intdiv($blockSize, 2); $j++) {
                $a = $i + $j;
                $b = $i + $blockSize - ($j + 1);
                if ($b < $byteCount) {
                    $tmp = $arr[$a];
                    $arr[$a] = $arr[$b];
                    $arr[$b] = $tmp;
                }
            }
        }
        return pack('C*', ...$arr);
    }

    /** g^x mod N，返回十六进制大端 */
    private static function modPow($base, string $expHex, string $modHex): string {
        if (function_exists('gmp_powm')) {
            $r = gmp_powm(gmp_init((string)$base, 10), gmp_init($expHex, 16), gmp_init($modHex, 16));
            return gmp_strval($r, 16);
        }
        if (function_exists('bcpowmod')) {
            $baseDec = is_numeric($base) ? (string)$base : self::hexToDec((string)$base);
            $expDec = self::hexToDec($expHex);
            $modDec = self::hexToDec($modHex);
            $r = bcpowmod($baseDec, $expDec, $modDec);
            if ($r === false || $r === null) {
                throw new RuntimeException('bcpowmod 计算失败');
            }
            return self::decToHex($r);
        }
        throw new RuntimeException('需要 PHP GMP 或 BCMath 扩展以计算 SRP3 verifier');
    }

    private static function hexToDec(string $hex): string {
        $hex = strtolower(ltrim($hex, '0'));
        if ($hex === '') {
            return '0';
        }
        $dec = '0';
        $len = strlen($hex);
        for ($i = 0; $i < $len; $i++) {
            $dec = bcmul($dec, '16', 0);
            $digit = $hex[$i];
            $v = ctype_digit($digit) ? (int)$digit : (ord($digit) - ord('a') + 10);
            $dec = bcadd($dec, (string)$v, 0);
        }
        return $dec;
    }

    private static function decToHex(string $dec): string {
        if ($dec === '0') {
            return '0';
        }
        $hex = '';
        while (bccomp($dec, '0', 0) > 0) {
            $rem = (int)bcmod($dec, '16');
            $hex = dechex($rem) . $hex;
            $dec = bcdiv($dec, '16', 0);
        }
        return $hex;
    }
}
