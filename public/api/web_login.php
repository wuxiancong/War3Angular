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

$username = $data['username'] ?? '';
$password = $data['password'] ?? '';
$source = $data['source'] ?? 'web'; // 获取登录来源，默认为 web

if (empty($username) || empty($password)) {
    echo json_encode(['success' => false, 'message' => '用户名或密码不能为空']);
    exit;
}

$db = new Database();
$user = $db->getUser($username);

if (!$user) {
    echo json_encode(['success' => false, 'message' => '用户不存在']);
    exit;
}

// 验证网页端 Hash
if (password_verify($password, $user['web_password_hash'])) {
    // 生成一个简单的 Token (实际应用中应使用 JWT)
    $token = bin2hex(random_bytes(16));
    
    // 可以在这里将 Token 存入数据库或 Redis 关联用户
    
    $response = [
        'success' => true,
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
    echo json_encode(['success' => false, 'message' => '密码错误']);
}
