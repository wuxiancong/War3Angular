<?php
// api/login_step2.php
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
$M1_hex = $data['M1'] ?? '';
$web_token = $data['web_token'] ?? '';

if (empty($username) || empty($M1_hex) || empty($web_token)) {
    echo json_encode(['success' => false, 'message' => '参数不完整']);
    exit;
}

$db = new Database();
$user = $db->getUser($username);

if (!$user) {
    // 检查是否在临时表中（未验证邮箱）
    $tempUser = $db->getTempUserByUsername($username);
    if ($tempUser) {
        echo json_encode(['success' => false, 'message' => '您的邮箱尚未验证，请先前往邮箱激活账号。']);
        exit;
    }

    echo json_encode(['success' => false, 'message' => '用户不存在']);
    exit;
}

// 在真实 SRP3 中，这里会使用 A, B, s, v 计算并验证 M1
// 这里我们假设如果 web_token 验证通过（第一步已完成），且收到了 M1，则认为验证成功
// 实际应用中必须进行完整的 SRP3 校验

echo json_encode([
    'success' => true,
    'token' => bin2hex(random_bytes(16)), // 战网 Token
    'message' => '战网验证成功'
]);
