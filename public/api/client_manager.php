<?php
/**
 * PvPGN 协议客户端 (PHP 版)
 * 模仿 QML ClientManager 的注册逻辑
 */
class ClientManager {
    private $host;
    private $port;
    private $socket;
    private $username;
    private $password;
    private $lastError = null;

    public function __construct($host, $port = 6112) {
        $this->host = $host;
        $this->port = $port;
    }

    public function getLastError() {
        return $this->lastError;
    }

    /**
     * 执行注册流程
     */
    public function register($username, $password) {
        $this->username = $username;
        $this->password = $password;
        $this->lastError = null;

        // 1. 建立 TCP 连接
        $this->socket = fsockopen($this->host, $this->port, $errno, $errstr, 5);
        if (!$this->socket) {
            $this->lastError = "无法连接到 PvPGN 服务器: $errstr ($errno)";
            throw new Exception($this->lastError);
        }

        stream_set_timeout($this->socket, 5);

        try {
            // 2. 发送握手字节 0x01
            fwrite($this->socket, pack('C', 0x01));

            // 3. 发送 SID_AUTH_INFO (0x50)
            $this->sendAuthInfo();

            // 4. 读取响应 (循环读取直到获取到 0x50 或 0x51)
            while ($packet = $this->readPacket()) {
                $packetId = $packet['id'];
                $payload = $packet['payload'];

                if ($packetId === 0x50 || $packetId === 0x51) {
                    // 5. 收到挑战，发送 SID_AUTH_ACCOUNTCREATE (0x52)
                    return $this->sendAccountCreate();
                }
                
                // 处理 Ping (0x25)
                if ($packetId === 0x25) {
                    $this->sendPacket(0x25, $payload);
                }
            }
            $this->lastError = "未收到 0x50/0x51 响应，连接可能已断开或超时";
        } catch (Exception $e) {
            $this->lastError = $e->getMessage();
            throw $e;
        } finally {
            fclose($this->socket);
        }

        return false;
    }

    private function sendAuthInfo() {
        $payload = pack('V', 0); // Protocol ID
        $payload .= "68XI";      // Platform: IX86
        $payload .= "PX3W";      // Product: W3XP
        $payload .= pack('V', 26); // Version: 1.26
        $payload .= "SUne";      // Language: enUS
        $payload .= pack('V', 0); // Local IP
        $payload .= pack('V', 0xFFFFFE20); // TZ Bias
        $payload .= pack('V', 2052); // Locale ID 1
        $payload .= pack('V', 2052); // Locale ID 2
        $payload .= "CHN\0";     // Region
        $payload .= "China\0";   // Country
        $payload .= $this->username . "\0";

        $this->sendPacket(0x50, $payload);
    }

    private function sendAccountCreate() {
        // 模仿 QML 的简化版注册逻辑
        
        // 1. 生成 32 字节随机盐值
        $salt = random_bytes(32);
        
        // 2. 将明文密码放入 32 字节缓冲区 (Verifier)
        $verifier = str_pad(substr($this->password, 0, 32), 32, "\0");

        // 3. 构造载荷
        $payload = $salt;
        $payload .= $verifier;
        $payload .= strtolower(trim($this->username)) . "\0";

        $this->sendPacket(0x52, $payload);

        // 4. 等待注册结果
        while ($result = $this->readPacket()) {
            if ($result['id'] === 0x52) {
                $status = unpack('V', substr($result['payload'], 0, 4))[1];
                if ($status === 0) {
                    return true;
                } else {
                    throw new Exception("PvPGN 注册失败，状态码: " . $status);
                }
            }
            if ($result['id'] === 0x25) {
                $this->sendPacket(0x25, $result['payload']);
            }
        }

        throw new Exception("PvPGN 注册超时或连接断开");
    }

    private function sendPacket($id, $payload) {
        $len = strlen($payload) + 4;
        $header = pack('CCv', 0xFF, $id, $len);
        fwrite($this->socket, $header . $payload);
    }

    private function readPacket() {
        $header = fread($this->socket, 4);
        if (strlen($header) < 4) return null;

        $data = unpack('Cmagic/Cid/vlen', $header);
        if ($data['magic'] !== 0xFF) return null;

        $payloadLen = $data['len'] - 4;
        $payload = $payloadLen > 0 ? fread($this->socket, $payloadLen) : '';

        return ['id' => $data['id'], 'payload' => $payload];
    }
}
