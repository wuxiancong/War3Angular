<?php
/**
 * Forgot Password API — 发送密码重置验证链接
 *
 * POST JSON:
 *   { "userName": "..." } 或 { "email": "..." }
 *   可选: "source": "launcher" | "web"
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'database.php';
require_once 'mailer.php';

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_INVALID_JSON', 'message' => '无效的请求数据']);
    exit;
}

$username = trim($data['userName'] ?? $data['username'] ?? '');
$emailInput = trim($data['email'] ?? '');
$cooldownSec = 60;

if ($username === '' && $emailInput === '') {
    echo json_encode(['success' => false, 'error_code' => 'ERR_EMPTY_CREDENTIALS', 'message' => '请输入用户名或邮箱']);
    exit;
}

$db = new Database();
$pdo = $db->getConnection();
$user = null;

if ($username !== '') {
    // 支持用户名或把邮箱填在 userName 字段（登录框同字段）
    if (filter_var($username, FILTER_VALIDATE_EMAIL)) {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(acct_email) = LOWER(?) LIMIT 1");
        $stmt->execute([$username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
    } else {
        $user = $db->getUser($username);
        if (!$user) {
            $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1");
            $stmt->execute([$username]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
        }
    }
}

if (!$user && $emailInput !== '') {
    $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(acct_email) = LOWER(?) LIMIT 1");
    $stmt->execute([$emailInput]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
}

if (!$user) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_USER_NOT_FOUND', 'message' => '用户不存在']);
    exit;
}

$email = trim($user['acct_email'] ?? '');
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_NO_EMAIL', 'message' => '该账号未绑定有效邮箱，无法找回密码']);
    exit;
}

if (!$db->canSendEmail($email)) {
    echo json_encode([
        'success' => false,
        'error_code' => 'ERR_TOO_MANY_REQUESTS',
        'message' => '发送过于频繁，请稍后再试',
        'cooldown_sec' => $cooldownSec
    ]);
    exit;
}

$token = bin2hex(random_bytes(32));
$expires = date('Y-m-d H:i:s', strtotime('+1 hour'));

$stmt = $pdo->prepare("UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE username = ?");
if (!$stmt->execute([$token, $expires, $user['username']])) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_SYSTEM_ERROR', 'message' => '系统错误，请稍后再试']);
    exit;
}

$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
// 邮件链接直达 Angular 重置密码页
$resetLink = "{$protocol}://{$host}/reset-password?token=" . urlencode($token);

$mailer = new Mailer();
$subject = '找回密码：请重置您的账号密码';
$body = $mailer->getPasswordResetTemplate($user['username'], $resetLink);
$mailSent = $mailer->send($email, $subject, $body);

// 无论成败都记日志，防止刷信
$db->logEmailSent($email);

if ($mailSent) {
    echo json_encode([
        'success' => true,
        'error_code' => 'SUCCESS_EMAIL_SENT',
        'message' => '重置链接已发送至注册邮箱，请查收（含垃圾箱）',
        'cooldown_sec' => $cooldownSec
    ]);
} else {
    echo json_encode([
        'success' => false,
        'error_code' => 'ERR_MAIL_SEND_FAILED',
        'message' => '发送失败，请检查邮件服务或稍后再试',
        'debug_reset_link' => $resetLink
    ]);
}
