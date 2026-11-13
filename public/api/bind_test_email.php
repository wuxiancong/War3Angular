<?php
/**
 * 测试账号邮箱一键绑定 API（供 AiControl / 联调脚本调用）
 *
 * 默认邮箱: 461079075@qq.com
 * 作用:
 *   1) 写入注册邮箱 acct_email，并置 is_email_verified=1（无需点链接）
 *   2) 写入临时邮箱 temp_email；auto_verify=1 时直接置 is_temp_email_verified=1（跳过邮件点击）
 *   3) 同步 pvpgn_BNET.acct_email，避免魔兽客户端弹邮箱绑定窗
 *
 * POST/GET JSON/Form:
 *   username / userName   必填
 *   email                 可选，默认 461079075@qq.com
 *   auto_verify           可选，默认 1（测试联调跳过激活链接）
 *   send_mail             可选，默认 0（不发激活邮件）；auto_verify=0 时可设 1
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
require_once 'i18n.php';

$inputJson = file_get_contents('php://input');
$bodyData = [];
if (!empty($inputJson)) {
    $decoded = json_decode($inputJson, true);
    if (is_array($decoded)) {
        $bodyData = $decoded;
    }
}

$username = $bodyData['username']
    ?? $bodyData['userName']
    ?? $bodyData['user']
    ?? $_POST['username']
    ?? $_POST['userName']
    ?? $_GET['username']
    ?? $_GET['userName']
    ?? '';

$email = $bodyData['email']
    ?? $bodyData['acct_email']
    ?? $_POST['email']
    ?? $_GET['email']
    ?? '461079075@qq.com';

$autoVerifyParam = $bodyData['auto_verify'] ?? $_POST['auto_verify'] ?? $_GET['auto_verify'] ?? '1';
$autoVerify = ($autoVerifyParam === '1' || $autoVerifyParam === 'true' || $autoVerifyParam === true || $autoVerifyParam === 1);

$sendMailParam = $bodyData['send_mail'] ?? $_POST['send_mail'] ?? $_GET['send_mail'] ?? '0';
$sendMail = ($sendMailParam === '1' || $sendMailParam === 'true' || $sendMailParam === true || $sendMailParam === 1);

$username = trim($username);
$email = trim($email);

if ($username === '') {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error_code' => 'ERR_EMPTY_USERNAME',
        'message' => '用户名不能为空'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error_code' => 'ERR_INVALID_EMAIL',
        'message' => '邮箱格式不正确'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $db = new Database();
    $result = $db->bindTestAccountEmail($username, $email, $autoVerify);

    if (!$result['success']) {
        http_response_code(400);
        echo json_encode($result, JSON_UNESCAPED_UNICODE);
        exit;
    }

    $mailSent = false;
    $verifyLink = $result['verify_link'] ?? null;

    // 需要走邮件激活时才发信；测试默认 auto_verify=1 不发
    if (!$autoVerify && $sendMail && !empty($result['token'])) {
        require_once 'mailer.php';
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? '139.155.155.166';
        $verifyLink = "{$scheme}://{$host}/api/verify_temp_email.php?token={$result['token']}";
        try {
            $mailer = new Mailer();
            $subject = __('temp_email_subject');
            $body = $mailer->getTempEmailTemplate($username, $email, $verifyLink, false);
            $mailSent = $mailer->send($email, $subject, $body);
            if ($mailSent) {
                $db->logEmailSent($email);
            }
        } catch (Exception $mailEx) {
            error_log('bind_test_email mail failed: ' . $mailEx->getMessage());
        }
    }

    echo json_encode([
        'success' => true,
        'message' => $autoVerify
            ? '测试账号邮箱已绑定并自动激活'
            : ($mailSent ? '测试账号邮箱已绑定，激活邮件已发送' : '测试账号邮箱已绑定，请点击激活链接'),
        'data' => [
            'username' => $username,
            'email' => $email,
            'registered_verified' => true,
            'temp_verified' => $autoVerify || !empty($result['temp_verified']),
            'auto_verify' => $autoVerify,
            'mail_sent' => $mailSent,
            'users_updated' => $result['users_updated'] ?? false,
            'pvpgn_updated' => $result['pvpgn_updated'] ?? false,
            'debug_verify_link' => $verifyLink
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
