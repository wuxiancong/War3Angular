<?php
/**
 * Resend Email Verification API
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'database.php';

$data = json_decode(file_get_contents('php://input'), true);
$username = trim($data['userName'] ?? $data['username'] ?? '');

if (empty($username)) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_EMPTY_USERNAME', 'message' => '用户名不能为空']);
    exit;
}

$db = new Database();

$user = $db->getUser($username);

if ($user) {
    if ($user['is_email_verified'] == 1) {
        echo json_encode(['success' => false, 'error_code' => 'ERR_EMAIL_ALREADY_VERIFIED', 'message' => '该邮箱已经验证过了，无需重复验证']);
        exit;
    }
}

$tempUser = $db->getTempUserByUsername($username);

if (!$tempUser) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_USER_NOT_FOUND', 'message' => '用户不存在']);
    exit;
}

// 检查发送频率
if (!$db->canSendEmail($tempUser['acct_email'])) {
    echo json_encode(['success' => false, 'error_code' => 'ERR_TOO_MANY_REQUESTS', 'message' => '发送过于频繁，请稍后再试']);
    exit;
}

// 限制重发频率 (例如每 60 秒只能发一次)
// 这里简单处理，实际可以存入 Redis 或数据库记录上次发送时间

// 生成新的 Token
$email_token = bin2hex(random_bytes(32));
$email_expires = date('Y-m-d H:i:s', strtotime('+24 hours'));

// 更新数据库 (更新 temp_users 表)
$pdo = $db->getConnection();
$stmt = $pdo->prepare("UPDATE temp_users SET email_verify_token = ?, email_verify_expires = ? WHERE username = ?");
if ($stmt->execute([$email_token, $email_expires, $username])) {
    
    // 发送邮件
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $verify_link = "{$protocol}://{$host}/api/verify_email.php?token=" . $email_token;
    
    $email = $tempUser['acct_email'];
    
    require_once 'mailer.php';
    $mailer = new Mailer();
    $subject = "重发验证邮件：请激活您的账号";
    $message = $mailer->getVerificationTemplate($username, $verify_link);
    
    $mail_sent = $mailer->send($email, $subject, $message);
    
    // 无论发送是否成功，都记录尝试时间，以防止恶意频繁请求
    $db->logEmailSent($email);
    
    // 在没有配置 SMTP 服务的开发环境中，mail() 会返回 false。
    // 为了方便测试，我们始终返回成功并附带 debug_verify_link。
    echo json_encode([
        'success' => true, 
        'error_code' => 'SUCCESS_EMAIL_SENT',
        'message' => '验证邮件已重新发送，请检查您的邮箱。' . (!$mail_sent ? ' (注意：邮件发送失败，请检查 SMTP 配置)' : ''),
        'debug_verify_link' => $verify_link // 仅供测试
    ]);
} else {
    echo json_encode(['success' => false, 'error_code' => 'ERR_SYSTEM_ERROR', 'message' => '系统错误，请稍后再试']);
}
