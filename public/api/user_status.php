<?php
// api/user_status.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'database.php';

// 1. Anti-Bot: Check User-Agent
$ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
$forbidden_agents = ['curl', 'python', 'wget', 'go-http', 'postman', 'spider', 'bot', 'headless'];
foreach ($forbidden_agents as $agent) {
    if (stripos($ua, $agent) !== false) {
        http_response_code(403);
        echo json_encode(['error' => 'Access Denied: Bot detected']);
        exit;
    }
}

// In a real app, we would get the user ID from a session or JWT token
$username = $_GET['userName'] ?? $_GET['username'] ?? '';

// Strict username validation (alphanumeric, underscores, hyphens, dots, brackets, parentheses, 2-20 chars)
if (!preg_match('/^[a-zA-Z0-9._\-\[\]()]{2,20}$/', $username)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid username format']);
    exit;
}

if (empty($username)) {
    echo json_encode(['success' => false, 'message' => 'Username required']);
    exit;
}

$db = new Database();
$pdo = $db->getConnection();

$stmt = $pdo->prepare("SELECT is_phone_verified, total_ingame_time, cheat_records_count, report_records_count FROM users WHERE username = ?");
$stmt->execute([$username]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    echo json_encode(['success' => false, 'message' => 'User not found']);
    exit;
}

// Verification logic: phone verified AND game time > 168 hours (10080 minutes)
$is_fully_verified = ($user['is_phone_verified'] == 1 && $user['total_ingame_time'] >= 10080);

echo json_encode([
    'success' => true,
    'data' => [
        'is_phone_verified' => (bool)$user['is_phone_verified'],
        'total_ingame_time' => (int)$user['total_ingame_time'],
        'cheat_records_count' => (int)$user['cheat_records_count'],
        'report_records_count' => (int)$user['report_records_count'],
        'is_fully_verified' => $is_fully_verified
    ]
]);
