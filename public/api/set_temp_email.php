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
    $subject = __('temp_email_subject');
    $body = $mailer->getTempEmailTemplate($username, $email, $verifyLink, false);

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
