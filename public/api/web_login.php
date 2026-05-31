<?php
// api/web_login.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'database.php';

$json = file_get_contents('php://input');
$data = json_decode($json, true);

$username = $data['userName'] ?? $data['username'] ?? '';
$password = $data['passWord'] ?? $data['password'] ?? '';
$source = $data['source'] ?? 'web'; // 获取登录来源，默认为 web

if (empty($username) || empty($password)) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_EMPTY_CREDENTIALS', 'message' => '用户名或密码不能为空']);
    exit;
}

$db = new Database();
$user = $db->getUser($username);

if (!$user) {
    // 检查是否在临时表中（未验证邮箱）
    $tempUser = $db->getTempUserByUsername($username);
    if ($tempUser) {
        echo json_encode([
            'success' => false, 
            'error_code' => 'ERR_EMAIL_NOT_VERIFIED',
            'message' => '您的邮箱尚未验证，请先前往邮箱激活账号。',
            'needs_verification' => true
        ]);
        exit;
    }

    echo json_encode(['success' => false, 'error_code' => 'ERR_USER_NOT_FOUND', 'message' => '用户不存在']);
    exit;
}

// 验证网页端 Hash
if (password_verify($password, $user['web_password_hash'])) {
    // 检查邮箱是否已验证
    if ($user['is_email_verified'] == 0) {
        echo json_encode([
            'success' => false, 
            'error_code' => 'ERR_EMAIL_NOT_VERIFIED',
            'message' => '您的邮箱尚未验证，请先前往邮箱激活账号。',
            'needs_verification' => true
        ]);
        exit;
    }

    // 生成一个简单的 Token (实际应用中应使用 JWT)
    $token = bin2hex(random_bytes(16));
    
    // 可以在这里将 Token 存入数据库或 Redis 关联用户
    
    $response = [
        'success' => true,
        'error_code' => 'SUCCESS',
        'token' => $token,
        'message' => '登录成功',
        'source' => $source
    ];

    // 如果是 Launcher 或 Game 来源，提示客户端需要进行第二步 PvPGN 登录
    if ($source === 'launcher' || $source === 'game') {
        $response['next_step'] = 'pvpgn_login';
    }
    
    echo json_encode($response);
} else {
    echo json_encode(['success' => false, 'error_code' => 'ERR_INVALID_PASSWORD', 'message' => '密码错误']);
}
