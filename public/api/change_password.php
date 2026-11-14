<?php
/**
 * 登录后修改密码 API
 *
 * POST JSON:
 *   oldPassword / oldPassWord
 *   newPassword / newPassWord
 *   confirmPassword (可选，若传则需一致)
 * 鉴权：Authorization: Bearer <token> 或 body.token
 * 可选：userName（须与 token 用户一致）
 *
 * 成功后同时更新网页 bcrypt 与 PvPGN SRP3 salt/verifier
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error_code' => 'ERR_METHOD', 'message' => '仅支持 POST']);
    exit;
}

require_once __DIR__ . '/database.php';

$raw = file_get_contents('php://input');
$data = json_decode($raw ?: '', true);
if (!is_array($data)) {
    $data = $_POST;
}

$token = trim((string)($data['token'] ?? ''));
if ($token === '' && !empty($_SERVER['HTTP_AUTHORIZATION'])) {
    if (preg_match('/Bearer\s+(\S+)/i', $_SERVER['HTTP_AUTHORIZATION'], $m)) {
        $token = $m[1];
    }
}

$db = new Database();
$authUser = $db->validateApiSession($token);
if (!$authUser) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error_code' => 'ERR_UNAUTHORIZED', 'message' => '登录已失效，请重新登录']);
    exit;
}

$bodyUser = trim((string)($data['userName'] ?? $data['username'] ?? ''));
if ($bodyUser !== '' && strcasecmp($bodyUser, $authUser) !== 0) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error_code' => 'ERR_FORBIDDEN', 'message' => '无权修改其他账号密码']);
    exit;
}

$oldPassword = $data['oldPassword'] ?? $data['oldPassWord'] ?? $data['password'] ?? '';
$newPassword = $data['newPassword'] ?? $data['newPassWord'] ?? '';
$confirm = $data['confirmPassword'] ?? $data['confirm'] ?? null;

if (!is_string($oldPassword) || $oldPassword === '') {
    echo json_encode(['success' => false, 'error_code' => 'ERR_EMPTY_OLD_PASSWORD', 'message' => '请输入当前密码']);
    exit;
}
if (!is_string($newPassword) || $newPassword === '') {
    echo json_encode(['success' => false, 'error_code' => 'ERR_EMPTY_NEW_PASSWORD', 'message' => '请输入新密码']);
    exit;
}
if ($confirm !== null && $confirm !== $newPassword) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_PASSWORD_MISMATCH', 'message' => '两次输入的新密码不一致']);
    exit;
}
if ($oldPassword === $newPassword) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_SAME_PASSWORD', 'message' => '新密码不能与当前密码相同']);
    exit;
}
if (strlen($newPassword) < 8
    || !preg_match('/[a-z]/', $newPassword)
    || !preg_match('/[A-Z]/', $newPassword)
    || !preg_match('/[0-9]/', $newPassword)
    || !preg_match('/[^a-zA-Z0-9]/', $newPassword)) {
    echo json_encode([
        'success' => false,
        'error_code' => 'ERR_WEAK_PASSWORD',
        'message' => '新密码必须包含大小写字母、数字及特殊符号，且不少于 8 位'
    ]);
    exit;
}

$user = $db->getUser($authUser);
if (!$user) {
    $pdo = $db->getConnection();
    $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1");
    $stmt->execute([$authUser]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
}
if (!$user) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_USER_NOT_FOUND', 'message' => '用户不存在']);
    exit;
}

$hash = $user['web_password_hash'] ?? '';
if ($hash === '' || !password_verify($oldPassword, $hash)) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_INVALID_PASSWORD', 'message' => '当前密码错误']);
    exit;
}

$result = $db->updatePasswordBoth($user['username'], $newPassword);
if (empty($result['success'])) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error_code' => 'ERR_SYSTEM_ERROR',
        'message' => $result['message'] ?? '修改失败，请稍后再试'
    ]);
    exit;
}

// 改密成功后发送通知邮件（失败不影响改密结果）
$emailSent = false;
$email = trim((string)($user['acct_email'] ?? ''));
if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
    try {
        require_once __DIR__ . '/mailer.php';
        $mailer = new Mailer();
        $changedAt = date('Y-m-d H:i:s');
        $subject = '密码修改成功通知';
        $body = $mailer->getPasswordChangedTemplate($user['username'], $changedAt);
        $emailSent = (bool)$mailer->send($email, $subject, $body);
        if ($emailSent) {
            $db->logEmailSent($email);
        }
    } catch (Throwable $e) {
        error_log('[change_password] 通知邮件发送失败: ' . $e->getMessage());
    }
}

$msg = $result['message'] ?? '密码修改成功';
if ($emailSent) {
    $msg .= '，已向注册邮箱发送通知邮件';
} elseif ($email === '') {
    $msg .= '（未绑定邮箱，无法发送通知邮件）';
} else {
    $msg .= '（通知邮件发送失败，请检查邮箱或稍后重试）';
}

echo json_encode([
    'success' => true,
    'error_code' => 'SUCCESS_PASSWORD_CHANGED',
    'message' => $msg,
    'username' => $user['username'],
    'web_updated' => !empty($result['web_updated']),
    'pvpgn_updated' => !empty($result['pvpgn_updated']),
    'email_sent' => $emailSent
], JSON_UNESCAPED_UNICODE);
