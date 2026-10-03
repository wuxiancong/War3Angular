<?php
/**
 * 设置用户临时通知邮箱并发送激活邮件 API
 * 供客户端 (Qt/QML、游戏启动器等) 调用
 * 
 * 特性:
 *   1. 允许重复绑定（不作唯一性排他查重，多个小号可共享通知邮箱）
 *   2. 自动生成激活 Token 并发送激活邮件
 *   3. 激活前状态为未激活 (is_temp_email_verified = false)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

require_once 'database.php';
require_once 'mailer.php';
require_once 'i18n.php';

// 获取输入
$inputJson = file_get_contents('php://input');
$bodyData = !empty($inputJson) ? json_decode($inputJson, true) : [];

$username = $bodyData['username'] 
    ?? $bodyData['userName'] 
    ?? $_POST['username'] 
    ?? $_POST['userName'] 
    ?? $_GET['username'] 
    ?? $_GET['userName'] 
    ?? '';

$email = $bodyData['email'] 
    ?? $bodyData['temp_email'] 
    ?? $bodyData['acct_email'] 
    ?? $_POST['email'] 
    ?? $_POST['temp_email'] 
    ?? $_GET['email'] 
    ?? $_GET['temp_email'] 
    ?? '';

$username = trim($username);
$email = trim($email);

if (empty($username)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error_code' => 'ERR_EMPTY_USERNAME',
        'message' => __('err_empty_username')
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error_code' => 'ERR_INVALID_EMAIL',
        'message' => __('err_invalid_email')
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $db = new Database();

    // 1. 保存临时邮箱并生成激活 Token (不进行排他查重)
    $result = $db->setTempEmail($username, $email);

    if (!$result['success']) {
        http_response_code(400);
        echo json_encode($result, JSON_UNESCAPED_UNICODE);
        exit;
    }

    $token = $result['token'];

    // 2. 构造激活链接
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? '139.155.155.166';
    $verifyLink = "{$scheme}://{$host}/api/verify_temp_email.php?token={$token}";

    // 3. 发送激活邮件
    $mailer = new Mailer();
    $subject = "【CC对战平台】请激活您的临时通知邮箱";
    $body = "
    <div style='font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden; background: #ffffff;'>
        <div style='background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; padding: 25px; text-align: center;'>
            <h2 style='margin: 0; font-size: 22px;'>📬 CC 对战平台 - 临时邮箱激活</h2>
        </div>
        <div style='padding: 30px; color: #333; line-height: 1.6;'>
            <p style='font-size: 16px;'>尊敬的玩家 <strong>" . htmlspecialchars($username) . "</strong>，您好：</p>
            <p>您已将本邮箱（<strong>" . htmlspecialchars($email) . "</strong>）设置为您的战网临时通知邮箱，用于接收游戏战报、对局通知及系统提醒。</p>
            <p>为确保能顺利接收到通知，请点击下方按钮激活此临时邮箱：</p>
            <div style='text-align: center; margin: 35px 0;'>
                <a href='{$verifyLink}' style='background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;'>点击激活临时邮箱</a>
            </div>
            <p style='color: #888; font-size: 13px;'>如果上方按钮无法点击，请复制以下链接到浏览器打开：</p>
            <p style='word-break: break-all; font-size: 13px; color: #007bff; background: #f8f9fa; padding: 10px; border-radius: 4px;'>{$verifyLink}</p>
            <p style='color: #999; font-size: 12px; margin-top: 30px;'>提示：此激活链接有效期为 24 小时。若非您本人操作，请忽略此邮件。</p>
        </div>
    </div>";

    $mailSent = false;
    try {
        $mailSent = $mailer->send($email, $subject, $body);
        if ($mailSent) {
            $db->logEmailSent($email);
        }
    } catch (Exception $mailEx) {
        error_log("Failed to send temp email activation: " . $mailEx->getMessage());
    }

    echo json_encode([
        'success' => true,
        'message' => $mailSent ? __('temp_email_saved_and_sent') : __('temp_email_saved_delay'),
        'data' => [
            'username' => $username,
            'temp_email' => $email,
            'is_temp_email_verified' => false,
            'mail_sent' => $mailSent,
            'debug_verify_link' => $verifyLink // 便于本地测试直接激活
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error_code' => 'ERR_SERVER_EXCEPTION',
        'message' => '服务器异常: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
