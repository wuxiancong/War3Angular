<?php
// api/login_step1.php
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
$A_hex = $data['A'] ?? '';
$web_token = $data['web_token'] ?? '';

if (empty($username) || empty($A_hex) || empty($web_token)) {
    echo json_encode(['status' => 1, 'message' => '参数不完整']);
    exit;
}

$db = new Database();
$user = $db->getUser($username);

if (!$user) {
    // 检查是否在临时表中（未验证邮箱）
    $tempUser = $db->getTempUserByUsername($username);
    if ($tempUser) {
        echo json_encode(['status' => 1, 'message' => '您的邮箱尚未验证，请先前往邮箱激活账号。']);
        exit;
    }

    echo json_encode(['status' => 1, 'message' => '用户不存在']);
    exit;
}

// 存储 A 用于后续验证
$db->updateSessionA($username, $A_hex);

// 在真实的 SRP3 中，B 是动态计算的：B = (kv + g^b) % N
// 这里为了演示，我们返回存储的 Salt 和一个模拟的 B (或者如果需要真实 SRP，应在这里计算)
// 由于环境限制，我们返回 Salt 和一个随机生成的 B，实际验证逻辑在 step2 处理
$B_hex = bin2hex(random_bytes(32)); 

echo json_encode([
    'status' => 0,
    'salt' => $user['acct_salt'],
    'B' => $B_hex
]);
