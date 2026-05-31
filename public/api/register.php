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
error_log("[Register Debug] Register API called");
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *'); 
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'database.php';
require_once 'client_manager.php';
require_once 'i18n.php';

$raw_input = file_get_contents('php://input');
$data = json_decode($raw_input, true);

if ($data === null) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_INVALID_JSON', 'message' => '无效的请求数据 (JSON解析失败)']);
    exit;
}

// Set language if provided in request
if (isset($data['lang'])) {
    setcookie('lang', $data['lang'], time() + (86400 * 30), "/");
    // We might need to manually set it for the current request if I18n is already instantiated
}

$username = trim($data['userName'] ?? $data['username'] ?? '');
$password = $data['passWord'] ?? $data['password'] ?? '';
$email = trim($data['email'] ?? '');
$phone = trim($data['phone'] ?? '');
$salt = $data['salt'] ?? '';
$verifier = $data['verifier'] ?? '';
$slide_x = isset($data['slide_x']) ? (int)$data['slide_x'] : null;
$captcha_token = $data['captcha_token'] ?? '';

$missing = [];
if ($username === '') $missing[] = 'userName';
if ($password === '') $missing[] = 'passWord';
if ($email === '') $missing[] = 'email';
if ($slide_x === null) $missing[] = 'slide_x';
if ($captcha_token === '') $missing[] = 'captcha_token';

if (!empty($missing)) {
    error_log("[Register Debug] Missing fields: " . implode(', ', $missing));
    echo json_encode([
        'success' => false, 
        'error_code' => 'ERR_MISSING_FIELDS', 
        'message' => '缺少必填字段: ' . implode(', ', $missing)
    ]);
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

// 检查发送频率
if (!$db->canSendEmail($email)) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_TOO_MANY_REQUESTS', 'message' => '发送过于频繁，请稍后再试']);
    exit;
}

$checkResult = $db->checkUserInBothTables($username);
if ($checkResult['exists']) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_USER_EXISTS', 'message' => '该用户名已被注册']);
    exit;
}

if ($db->checkEmailExists($email)) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_EMAIL_EXISTS', 'message' => '该邮箱已被注册']);
    exit;
}

// 3. 生成邮箱验证 Token 和加密密码
$email_token = bin2hex(random_bytes(32));
$email_expires = date('Y-m-d H:i:s', strtotime('+24 hours'));

// 加密明文密码，以便在验证邮箱时用于 PvPGN 注册
$encryption_key = 'WAR3_TEMP_PASS_KEY_2026'; // 生产环境请移至 config.php
$iv = openssl_random_pseudo_bytes(openssl_cipher_iv_length('aes-256-cbc'));
$encrypted_password = openssl_encrypt($password, 'aes-256-cbc', $encryption_key, 0, $iv);
$encrypted_password_with_iv = base64_encode($encrypted_password . '::' . $iv);

$register_ip = $_SERVER['REMOTE_ADDR'] ?? '';

// 4. 将用户写入临时表 (temp_users)
if ($db->createTempUser($username, $password, $email, $phone, $salt, $verifier, $email_token, $email_expires, $encrypted_password_with_iv, $register_ip)) {
    
    // 5. 发送验证邮件
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $verify_link = "{$protocol}://{$host}/api/verify_email.php?token=" . $email_token;
    
    require_once 'mailer.php';
    $mailer = new Mailer();
    $subject = __("email_subject");
    $message = $mailer->getVerificationTemplate($username, $verify_link);

    $mail_sent = $mailer->send($email, $subject, $message);
    
    // 无论发送是否成功，都记录尝试时间，以防止恶意频繁请求
    $db->logEmailSent($email);

    echo json_encode([
        'success' => true, 
        'error_code' => 'SUCCESS_REGISTERED_PENDING_VERIFY',
        'message' => __("reg_pending_msg") . (!$mail_sent ? ' (Note: Email sending failed, please check SMTP config)' : ''),
        'debug_verify_link' => $verify_link // 仅供测试阶段查看，生产环境请移除
    ]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error_code' => 'ERR_REGISTER_FAILED', 'message' => '注册失败，请稍后再试']);
}
