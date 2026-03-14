<?php
/**
 * Check User Exists API
 * 
 * Flow:
 * 1. Receive username from GET or POST request
 * 2. Check if username exists in `users` table
 * 3. Check if username exists in `pvpgn_BNET` table
 * 4. Return result to frontend
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *'); 
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'database.php';

// 支持 GET 或 POST (JSON) 获取 username
$username = $_GET['username'] ?? '';
if (empty($username)) {
    $data = json_decode(file_get_contents('php://input'), true);
    $username = $data['username'] ?? '';
}

$username = trim($username);

if (empty($username)) {
    echo json_encode(['success' => false, 'message' => '用户名不能为空']);
    exit;
}

$db = new Database();
$result = $db->checkUserInBothTables($username);

if ($result['exists']) {
    echo json_encode([
        'success' => true,
        'exists' => true,
        'message' => '该用户名已被注册',
        'details' => $result
    ]);
} else {
    echo json_encode([
        'success' => true,
        'exists' => false,
        'message' => '该用户名可用',
        'details' => $result
    ]);
}
