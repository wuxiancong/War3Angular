<?php
/**
 * 好友 API 公共头：CORS / JSON / Token 鉴权
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

function friends_read_json() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        echo json_encode(['success' => false, 'error_code' => 'ERR_INVALID_JSON', 'message' => '无效的 JSON']);
        exit;
    }
    return $data;
}

function friends_extract_token(array $data) {
    $token = $data['token'] ?? '';
    if ($token === '' && !empty($_SERVER['HTTP_AUTHORIZATION'])) {
        if (preg_match('/Bearer\s+(\S+)/i', $_SERVER['HTTP_AUTHORIZATION'], $m)) {
            $token = $m[1];
        }
    }
    return trim((string)$token);
}

/** @return string 已鉴权用户名 */
function friends_require_user(Database $db, array $data) {
    $token = friends_extract_token($data);
    $username = $db->validateApiSession($token);
    if (!$username) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error_code' => 'ERR_UNAUTHORIZED', 'message' => '登录已失效，请重新登录']);
        exit;
    }
    return $username;
}

function friends_ok(array $payload = []) {
    echo json_encode(array_merge(['success' => true, 'error_code' => 'SUCCESS'], $payload));
    exit;
}

function friends_fail($errorCode, $message, $http = 200) {
    if ($http !== 200) {
        http_response_code($http);
    }
    echo json_encode(['success' => false, 'error_code' => $errorCode, 'message' => $message]);
    exit;
}
