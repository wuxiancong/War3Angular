<?php
/**
 * 邮件发送工具 (支持 PHP mail() 和 SMTP 双重保险)
 */
class Mailer {
    private $smtp_host = 'ssl://smtp.qq.com';
    private $smtp_port = 465;
    private $smtp_user;
    private $smtp_pass;
    private $log_file;

    public function __construct() {
        // 移动日志到 /tmp 目录，这是容器环境下最可靠的写入位置
        $this->log_file = '/tmp/mailer.log';
        $this->smtp_user = getenv('SMTP_USER') ?: '595292630@qq.com';
        $this->smtp_pass = getenv('SMTP_PASS') ?: 'ekdypstlulnvbahe';
        
        // 确保日志文件存在且可写
        if (!file_exists($this->log_file)) {
            @touch($this->log_file);
            @chmod($this->log_file, 0666);
        }
    }

    private function log($msg) {
        $log_entry = date('[Y-m-d H:i:s] ') . $msg . "\n";
        // 显式检查写入是否成功
        if (@file_put_contents($this->log_file, $log_entry, FILE_APPEND) === false) {
            // 如果文件写入失败，输出到标准错误流
            error_log("CRITICAL: Mailer could not write to log file {$this->log_file}");
        }
        error_log("[Mailer] " . $msg);
    }

    /**
     * 发送函数
     */
    public function send($to, $subject, $body) {
        $this->log("========================================");
        $this->log("开始新发送任务: " . $to);

        // 深度环境检测
        $this->log("PHP Version: " . phpversion());
        $this->log("OS: " . PHP_OS);
        $sendmail_path = ini_get('sendmail_path');
        $this->log("php.ini sendmail_path: " . ($sendmail_path ?: 'EMPTY'));
        
        // 检查 sendmail 程序是否存在
        if ($sendmail_path) {
            $binary = explode(' ', $sendmail_path)[0];
            $this->log("检测二进制文件 $binary: " . (file_exists($binary) ? '存在' : '不存在'));
        }

        // --- 尝试方案一：PHP mail() ---
        $this->log("执行方案一 (PHP mail)...");
        $result = $this->sendViaMail($to, $subject, $body);
        if ($result) {
            $this->log("方案一成功。");
            return true;
        }
        $this->log("方案一失败。返回值为 false。");

        // --- 尝试方案二：直接 SMTP ---
        $this->log("执行方案二 (Direct SMTP)...");
        if ($this->sendViaSMTP($to, $subject, $body)) {
            $this->log("方案二成功。");
            return true;
        }

        $this->log("所有方案均失败。");
        return false;
    }

    /**
     * 方案一：PHP mail() 函数
     */
    private function sendViaMail($to, $subject, $body) {
        $headers = [
            'MIME-Version: 1.0',
            'Content-type: text/html; charset=UTF-8',
            'From: Account Verification <' . $this->smtp_user . '>',
            'Reply-To: ' . $this->smtp_user,
            'X-Mailer: PHP/' . phpversion()
        ];

        // 清除之前的错误状态
        error_clear_last();

        try {
            $result = @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers));
            
            if (!$result) {
                // 如果 mail() 返回 false，捕获底层的警告或错误信息
                $error = error_get_last();
                if ($error !== null) {
                    $this->log("mail() 内部错误详情: " . $error['message']);
                } else {
                    $this->log("mail() 返回 false (sendmail 进程返回了非零退出码)。");
                }
            } else {
                $this->log("mail() 返回 true。邮件已成功移交给本地 Postfix 队列。");
                $this->log("注意：这不代表邮件已送达！真实的投递状态请在 Ubuntu 终端查看: tail -f /var/log/mail.log");
            }
            
            return $result;
        } catch (Exception $e) {
            $this->log("mail() 函数执行异常: " . $e->getMessage());
            return false;
        }
    }

    /**
     * 方案二：SMTP 协议发送
     */
    private function sendViaSMTP($to, $subject, $body) {
        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true
            ]
        ]);
        
        $fp = @stream_socket_client($this->smtp_host . ':' . $this->smtp_port, $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $context);
        if (!$fp) {
            $this->log("SMTP 连接失败: $errstr ($errno)");
            return false;
        }

        try {
            $this->read($fp, "220");
            $this->write($fp, "EHLO " . parse_url($this->smtp_host, PHP_URL_HOST));
            $this->read($fp, "250");
            $this->write($fp, "AUTH LOGIN");
            $this->read($fp, "334");
            $this->write($fp, base64_encode($this->smtp_user));
            $this->read($fp, "334");
            $this->write($fp, base64_encode($this->smtp_pass));
            $this->read($fp, "235");
            $this->write($fp, "MAIL FROM:<" . $this->smtp_user . ">");
            $this->read($fp, "250");
            $this->write($fp, "RCPT TO:<" . $to . ">");
            $this->read($fp, "250");
            $this->write($fp, "DATA");
            $this->read($fp, "354");
            
            $boundary = md5(time());
            $date = date('r');
            $messageId = sprintf("<%s.%s@%s>", base64_encode(microtime()), base64_encode($to), 'smtp.qq.com');

            $msg = "Date: " . $date . "\r\n";
            $msg .= "Message-ID: " . $messageId . "\r\n";
            $msg .= "From: \"Account Verification\" <" . $this->smtp_user . ">\r\n";
            $msg .= "To: <" . $to . ">\r\n";
            $msg .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
            $msg .= "MIME-Version: 1.0\r\n";
            $msg .= "Content-Type: text/html; charset=UTF-8\r\n";
            $msg .= "Content-Transfer-Encoding: base64\r\n\r\n";
            $msg .= chunk_split(base64_encode($body)) . "\r\n.";
            
            $this->write($fp, $msg);
            $this->read($fp, "250");
            $this->write($fp, "QUIT");
            fclose($fp);
            return true;
        } catch (Exception $e) {
            $this->log("SMTP 发送错误: " . $e->getMessage());
            if ($fp) fclose($fp);
            return false;
        }
    }

    private function write($fp, $data) { 
        fwrite($fp, $data . "\r\n"); 
    }
    
    private function read($fp, $expected_code = null) { 
        $res = "";
        while ($line = fgets($fp, 512)) {
            $res .= $line;
            if (isset($line[3]) && $line[3] == ' ') break;
        }
        if ($expected_code && strpos($res, $expected_code) === false) {
            throw new Exception("SMTP Error: Expected $expected_code, got $res");
        }
        return $res;
    }

    public function getVerificationTemplate($username, $verify_link) {
        return "
        <div style='font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;'>
            <div style='background-color: #4CAF50; color: white; padding: 20px; text-align: center;'>
                <h1 style='margin: 0;'>欢迎加入！</h1>
            </div>
            <div style='padding: 20px;'>
                <p>亲爱的 <strong>{$username}</strong>，</p>
                <p>感谢您注册我们的平台。为了保障您的账号安全，请点击下方按钮完成邮箱验证：</p>
                <div style='text-align: center; margin: 30px 0;'>
                    <a href='{$verify_link}' style='background-color: #4CAF50; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;'>立即激活账号</a>
                </div>
                <p style='color: #888; font-size: 12px;'>如果按钮无法点击，请复制以下链接到浏览器打开：</p>
                <p style='word-break: break-all; font-size: 12px; color: #555;'>{$verify_link}</p>
                <p style='color: #888; font-size: 12px;'>此链接 24 小时内有效。如果您未进行此操作，请忽略此邮件。</p>
            </div>
        </div>";
    }
}
