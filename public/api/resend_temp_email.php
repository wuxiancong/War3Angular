<?php
/**
 * 重新发送临时邮箱激活邮件 API
 * 供客户端 (Qt/QML 等) 调用
 * 
 * 请求方式: POST 或 GET
 * 参数:
 *   - username / userName: 用户名 (必填)
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

$inputJson = file_get_contents('php://input');
$bodyData = !empty($inputJson) ? json_decode($inputJson, true) : [];

$username = $bodyData['username'] 
    ?? $bodyData['userName'] 
    ?? $_POST['username'] 
    ?? $_POST['userName'] 
    ?? $_GET['username'] 
    ?? $_GET['userName'] 
    ?? '';

$username = trim($username);

if (empty($username)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error_code' => 'ERR_EMPTY_USERNAME',
        'message' => __('err_empty_username')
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $db = new Database();
    $data = $db->getTempEmail($username);

    if (!$data || empty($data['temp_email'])) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error_code' => 'ERR_NO_TEMP_EMAIL',
            'message' => __('err_no_temp_email')
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($data['is_temp_email_verified']) {
        echo json_encode([
            'success' => true,
            'already_verified' => true,
            'message' => __('err_already_verified')
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $email = $data['temp_email'];

    // 检查 60 秒限流
    if (!$db->canSendEmail($email)) {
        http_response_code(429);
        echo json_encode([
            'success' => false,
            'error_code' => 'ERR_RATE_LIMIT',
            'message' => __('err_rate_limit')
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 重新生成 Token
    $result = $db->setTempEmail($username, $email);
    $token = $result['token'];

    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? '139.155.155.166';
    $verifyLink = "{$scheme}://{$host}/api/verify_temp_email.php?token={$token}";

    $mailer = new Mailer();
    $subject = __('temp_email_subject');
    $body = $mailer->getTempEmailTemplate($username, $email, $verifyLink, true);

    $mailSent = $mailer->send($email, $subject, $body);
    if ($mailSent) {
        $db->logEmailSent($email);
    }

    echo json_encode([
        'success' => true,
        'message' => __('temp_email_resend_success'),
        'data' => [
            'username' => $username,
            'temp_email' => $email,
            'mail_sent' => $mailSent
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
