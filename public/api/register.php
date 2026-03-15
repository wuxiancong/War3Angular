<?php
/**
 * Web Registration API
 * 
 * Flow:
 * 1. Validate Slider Captcha
 * 2. Web Account Registration (bcrypt) & Email Verification Token
 * 3. Send Verification Email
 * 4. Generate JWT Token
 */
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *'); 
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'database.php';
require_once 'client_manager.php';

$data = json_decode(file_get_contents('php://input'), true);

$username = trim($data['username'] ?? '');
$password = $data['password'] ?? '';
$email = trim($data['email'] ?? '');
$phone = trim($data['phone'] ?? '');
$salt = $data['salt'] ?? '';
$verifier = $data['verifier'] ?? '';
$slide_x = isset($data['slide_x']) ? (int)$data['slide_x'] : null;
$captcha_token = $data['captcha_token'] ?? '';

if (empty($username) || empty($password) || empty($email) || $slide_x === null || empty($captcha_token)) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_MISSING_FIELDS', 'message' => '缺少必填字段']);
    exit;
}

// 1. 验证滑块验证码 Token
$secret_key = 'WAR3_CAPTCHA_SECRET_KEY_2026';
$decoded = base64_decode($captcha_token);
if (!$decoded) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_CAPTCHA_FORMAT', 'message' => '验证码格式错误，请刷新重试']);
    exit;
}

$parts = explode('|', $decoded);
if (count($parts) !== 3) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_CAPTCHA_FORMAT', 'message' => '验证码格式错误，请刷新重试']);
    exit;
}

list($real_x, $timestamp, $hash) = $parts;
$expected_hash = hash_hmac('sha256', $real_x . '|' . $timestamp, $secret_key);

if (!hash_equals($expected_hash, $hash)) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_CAPTCHA_SIGNATURE', 'message' => '验证码签名无效，请刷新重试']);
    exit;
}

if (time() - (int)$timestamp > 300) { // 5分钟过期
    echo json_encode(['success' => false, 'error_code' => 'ERR_CAPTCHA_EXPIRED', 'message' => '验证码已过期，请刷新重试']);
    exit;
}

$tolerance = 5; // 允许的误差像素

if (abs((int)$real_x - $slide_x) > $tolerance) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_CAPTCHA_FAILED', 'message' => '滑块验证失败，请重试']);
    exit;
}

// 2. 检查用户是否已存在
$db = new Database();
$checkResult = $db->checkUserInBothTables($username);
if ($checkResult['exists']) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_USER_EXISTS', 'message' => '该用户名已被注册']);
    exit;
}

// 3. 生成邮箱验证 Token
$email_token = bin2hex(random_bytes(32));
$email_expires = date('Y-m-d H:i:s', strtotime('+24 hours'));

// 4. 创建用户 (Web 基础数据)
if ($db->createUser($username, $password, $email, $phone, $salt, $verifier, $email_token, $email_expires)) {
    
    // 4.1 尝试通过 TCP 协议注册到 PvPGN 服务器
    $pvpgnRegistered = false;
    try {
        $pvpgn = new ClientManager(PVPGN_HOST, PVPGN_PORT);
        if ($pvpgn->register($username, $password)) {
            $pvpgnRegistered = true;
            // 4.2 注册成功后，从 pvpgn_BNET 同步数据到 users 表
            $db->syncFromPvpgn($username);
        }
    } catch (Exception $e) {
        error_log("PvPGN TCP Registration failed: " . $e->getMessage());
    }

    // 5. 签发 JWT Token
    $jwt_secret = 'YOUR_SUPER_SECRET_JWT_KEY_HERE'; // 请在生产环境中更改此密钥
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload = json_encode([
        'user' => $username,
        'role' => 'player',
        'iat' => time(),
        'exp' => time() + 86400 // 24小时过期
    ]);
    
    $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
    $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));
    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, $jwt_secret, true);
    $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));
    
    $jwt_token = $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;

    // 6. 发送验证邮件
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $verify_link = "{$protocol}://{$host}/api/verify_email.php?token=" . $email_token;
    
    $subject = "欢迎注册！请验证您的邮箱";
    $message = "
    <html>
    <head>
        <title>邮箱验证</title>
    </head>
    <body>
        <h2>欢迎注册我们的平台！</h2>
        <p>您好，{$username}：</p>
        <p>请点击以下链接验证您的邮箱（24小时内有效）：</p>
        <p><a href='{$verify_link}'>{$verify_link}</a></p>
        <p>如果您无法点击链接，请将以下地址复制到浏览器地址栏中打开：</p>
        <p>{$verify_link}</p>
        <p>如果您没有注册，请忽略此邮件。</p>
    </body>
    </html>
    ";
    
    $headers = "MIME-Version: 1.0" . "\r\n";
    $headers .= "Content-type:text/html;charset=UTF-8" . "\r\n";
    $headers .= "From: noreply@{$host}" . "\r\n";
    
    // 发送邮件 (注意：在某些服务器或本地环境中，mail() 函数可能无法正常工作，需要配置 sendmail 或使用 SMTP 插件)
    require_once 'mailer.php';
    $mailer = new Mailer();
    $subject = "欢迎注册！请验证您的邮箱";
    $message = $mailer->getVerificationTemplate($username, $verify_link);

    $mail_sent = $mailer->send($email, $subject, $message);

    echo json_encode([
        'success' => true, 
        'error_code' => 'SUCCESS_REGISTERED',
        'message' => '注册成功！请检查您的邮箱进行验证。' . (!$mail_sent ? ' (注意：邮件发送失败，请检查 SMTP 配置)' : ''),
        'token' => $jwt_token,
        'debug_verify_link' => $verify_link // 仅供测试阶段查看，生产环境请移除
    ]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error_code' => 'ERR_REGISTER_FAILED', 'message' => '注册失败，请稍后再试']);
}
