<?php
/**
 * 获取用户临时通知邮箱及激活状态 API
 * 供客户端 (Qt/QML、游戏启动器等) 调用
 * 
 * 请求方式: GET 或 POST
 * 参数:
 *   - username / userName: 用户名 (必填)
 * 
 * 返回字段:
 *   - username: 用户名
 *   - registered_email: 注册安全邮箱 (只读)
 *   - temp_email: 临时通知邮箱
 *   - is_temp_email_verified: 临时邮箱是否已激活 (布尔值)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

require_once 'database.php';
require_once 'i18n.php';

// 获取 username 参数
$inputJson = file_get_contents('php://input');
$bodyData = !empty($inputJson) ? json_decode($inputJson, true) : [];

$username = $bodyData['username'] 
    ?? $bodyData['userName'] 
    ?? $_POST['username'] 
    ?? $_POST['userName'] 
    ?? $_GET['username'] 
    ?? $_GET['userName'] 
    ?? '';

$username = trim($username);

if (empty($username)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error_code' => 'ERR_EMPTY_USERNAME',
        'message' => __('err_empty_username')
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $db = new Database();
    $data = $db->getTempEmail($username);

    if (!$data) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error_code' => 'ERR_USER_NOT_FOUND',
            'message' => __('err_user_not_found')
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode([
        'success' => true,
        'message' => __('temp_email_fetch_success'),
        'data' => [
            'username' => $data['username'],
            'registered_email' => $data['registered_email'],
            'temp_email' => $data['temp_email'],
            'is_temp_email_verified' => (bool)$data['is_temp_email_verified'],
            'is_expired' => (bool)($data['is_expired'] ?? false)
        ]
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error_code' => 'ERR_SERVER_EXCEPTION',
        'message' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
