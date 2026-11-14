<?php
/**
 * 密码重置 API
 *
 * GET  ?token=...
 *   - 浏览器访问：302 跳转到 /reset-password?token=...
 *   - XHR / Accept: application/json：校验 token，返回 { success, username }
 *
 * POST JSON { token, password, confirm } 或 form-urlencoded
 *   同时更新：
 *     - users.web_password_hash (bcrypt)
 *     - users + PvPGN 表的 acct_salt / acct_verifier (SRP3)
 *     - acct_passhash1 (SC 兼容)
 */
require_once 'database.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

function wantsJson(): bool {
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    $xhr = strtolower($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '');
    if ($xhr === 'xmlhttprequest') {
        return true;
    }
    if (stripos($accept, 'application/json') !== false) {
        return true;
    }
    // Angular HttpClient 默认 Accept 含 application/json；若无 Accept，按 JSON 处理（API 用途）
    if ($accept === '' || $accept === '*/*') {
        return true;
    }
    return false;
}

function jsonOut(array $payload, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function findResetUser(PDO $pdo, string $token): ?array {
    $stmt = $pdo->prepare("SELECT username, password_reset_expires FROM users WHERE password_reset_token = ? LIMIT 1");
    $stmt->execute([$token]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    return $user ?: null;
}

function tokenError(?array $user): ?array {
    if (!$user) {
        return ['success' => false, 'error_code' => 'ERR_INVALID_TOKEN', 'message' => '重置链接无效或已被使用'];
    }
    if (empty($user['password_reset_expires']) || strtotime($user['password_reset_expires']) < time()) {
        return ['success' => false, 'error_code' => 'ERR_TOKEN_EXPIRED', 'message' => '重置链接已过期，请重新申请找回密码'];
    }
    return null;
}

$db = new Database();
$pdo = $db->getConnection();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $token = trim($_GET['token'] ?? '');

    // 邮件直链：非 JSON 请求跳转到 Angular 重置页
    if (!wantsJson()) {
        $q = $token !== '' ? ('?token=' . rawurlencode($token)) : '';
        header('Location: /reset-password' . $q, true, 302);
        exit;
    }

    if ($token === '') {
        jsonOut(['success' => false, 'error_code' => 'ERR_MISSING_TOKEN', 'message' => '缺少重置令牌'], 400);
    }

    $user = findResetUser($pdo, $token);
    if ($err = tokenError($user)) {
        jsonOut($err, 400);
    }

    jsonOut([
        'success' => true,
        'username' => $user['username'],
        'message' => '令牌有效'
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonOut(['success' => false, 'error_code' => 'ERR_METHOD', 'message' => '仅支持 GET/POST'], 405);
}

$raw = file_get_contents('php://input');
$data = json_decode($raw ?: '', true);
if (!is_array($data)) {
    $data = $_POST;
}

$token = trim($data['token'] ?? '');
$password = $data['password'] ?? $data['passWord'] ?? '';
$confirm = $data['confirm'] ?? $data['confirmPassword'] ?? '';

if ($token === '') {
    jsonOut(['success' => false, 'error_code' => 'ERR_MISSING_TOKEN', 'message' => '缺少重置令牌'], 400);
}

$user = findResetUser($pdo, $token);
if ($err = tokenError($user)) {
    jsonOut($err, 400);
}

if (!is_string($password) || strlen($password) < 8) {
    jsonOut(['success' => false, 'error_code' => 'ERR_WEAK_PASSWORD', 'message' => '密码长度至少 8 位'], 400);
}

$hasLower = preg_match('/[a-z]/', $password);
$hasUpper = preg_match('/[A-Z]/', $password);
$hasDigit = preg_match('/[0-9]/', $password);
$hasSpecial = preg_match('/[^a-zA-Z0-9]/', $password);
if (!$hasLower || !$hasUpper || !$hasDigit || !$hasSpecial) {
    jsonOut(['success' => false, 'error_code' => 'ERR_WEAK_PASSWORD', 'message' => '密码必须包含大小写字母、数字及特殊符号，且不少于 8 位'], 400);
}

if ($password !== $confirm) {
    jsonOut(['success' => false, 'error_code' => 'ERR_PASSWORD_MISMATCH', 'message' => '两次输入的密码不一致'], 400);
}

// 二次确认 token 仍属于该用户（防竞态）
$chk = $pdo->prepare("SELECT username FROM users WHERE username = ? AND password_reset_token = ? LIMIT 1");
$chk->execute([$user['username'], $token]);
if (!$chk->fetch()) {
    jsonOut(['success' => false, 'error_code' => 'ERR_INVALID_TOKEN', 'message' => '重置链接无效或已被使用'], 400);
}

// 同时更新网页 bcrypt + PvPGN SRP3 salt/verifier（及 passhash1）
$result = $db->updatePasswordBoth($user['username'], $password);
if (empty($result['success'])) {
    jsonOut([
        'success' => false,
        'error_code' => 'ERR_SYSTEM_ERROR',
        'message' => $result['message'] ?? '系统错误，请稍后再试'
    ], 500);
}

jsonOut([
    'success' => true,
    'error_code' => 'SUCCESS_PASSWORD_RESET',
    'message' => $result['message'] ?? '密码已重置成功，请使用新密码登录',
    'username' => $user['username'],
    'web_updated' => !empty($result['web_updated']),
    'pvpgn_updated' => !empty($result['pvpgn_updated'])
]);
