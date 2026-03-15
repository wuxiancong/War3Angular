<?php
/**
 * 简易 SMTP 邮件发送工具 (支持 SSL/TLS)
 */
class Mailer {
    private $smtp_host = 'ssl://smtp.qq.com';
    private $smtp_port = 465;
    private $smtp_user;
    private $smtp_pass;
    private $log_file = '/public/api/mail_debug.log';

    public function __construct() {
        // 优先从环境变量读取，如果未设置则使用您提供的默认值
        $this->smtp_user = getenv('SMTP_USER') ?: '595292630@qq.com';
        $this->smtp_pass = getenv('SMTP_PASS') ?: 'ekdypstlulnvbahe';
    }

    private function log($msg) {
        @file_put_contents($this->log_file, date('[Y-m-d H:i:s] ') . $msg . "\n", FILE_APPEND);
    }

    public function send($to, $subject, $body) {
        $fp = @stream_socket_client($this->smtp_host . ':' . $this->smtp_port, $errno, $errstr, 30);
        if (!$fp) {
            $this->log("连接失败: $errstr ($errno)");
            return false;
        }

        try {
            $this->read($fp, "220");
            $this->write($fp, "EHLO smtp.qq.com");
            $this->read($fp, "250");
            $this->write($fp, "AUTH LOGIN");
            $this->read($fp, "334");
            $this->write($fp, base64_encode($this->smtp_user));
            $this->read($fp, "334");
            $this->write($fp, base64_encode($this->smtp_pass));
            $this->read($fp, "235"); // 认证成功
            $this->write($fp, "MAIL FROM:<" . $this->smtp_user . ">");
            $this->read($fp, "250");
            $this->write($fp, "RCPT TO:<" . $to . ">");
            $this->read($fp, "250");
            $this->write($fp, "DATA");
            $this->read($fp, "354");
            
            $msg = "From: " . $this->smtp_user . "\r\n";
            $msg .= "To: " . $to . "\r\n";
            $msg .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
            $msg .= "MIME-Version: 1.0\r\n";
            $msg .= "Content-Type: text/html; charset=UTF-8\r\n\r\n";
            $msg .= $body . "\r\n.";
            
            $this->write($fp, $msg);
            $this->read($fp, "250");
            $this->write($fp, "QUIT");
            fclose($fp);
            return true;
        } catch (Exception $e) {
            $this->log("发送过程错误: " . $e->getMessage());
            return false;
        }
    }

    private function write($fp, $data) { 
        $this->log("C: $data");
        fwrite($fp, $data . "\r\n"); 
    }
    
    private function read($fp, $expected_code) { 
        $res = fgets($fp, 512);
        $this->log("S: $res");
        if (strpos($res, $expected_code) === false) {
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
