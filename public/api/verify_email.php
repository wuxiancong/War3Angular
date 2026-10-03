<?php
/**
 * Email Verification API
 */
header('Content-Type: text/html; charset=utf-8');

require_once 'database.php';
require_once 'client_manager.php';
require_once 'i18n.php';

function renderPage($title, $message, $isSuccess = true) {
    $class = $isSuccess ? 'success' : 'error';
    $lang = I18n::getInstance()->getLocale();
    $backHome = __('back_to_home');
    echo <<<HTML
<!DOCTYPE html>
<html lang="$lang">
<head>
    <meta charset="UTF-8">
    <title>$title</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f4f4f9; margin: 0; }
        .container { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; max-width: 450px; width: 90%; }
        h2 { margin-top: 0; font-size: 1.5rem; }
        .success { color: #10b981; }
        .error { color: #ef4444; }
        p { color: #4b5563; line-height: 1.6; }
        a { display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #3b82f6; color: white; text-decoration: none; border-radius: 8px; font-weight: 500; transition: background 0.2s; }
        a:hover { background: #2563eb; }
    </style>
</head>
<body>
    <div class="container">
        <h2 class="$class">$title</h2>
        <p>$message</p>
        <a href='/'>$backHome</a>
    </div>
</body>
</html>
HTML;
    exit;
}

$token = $_GET['token'] ?? '';

if (empty($token)) {
    renderPage(__("email_verify_invalid_token"), __("email_verify_missing_token"), false);
}

$db = new Database();
$tempUser = $db->getTempUserByToken($token);

if (!$tempUser) {
    renderPage(__("email_verify_fail_title"), __("email_verify_not_found"), false);
}

if (strtotime($tempUser['email_verify_expires']) < time()) {
    // Token expired, delete the temp user
    $db->deleteTempUser($tempUser['username']);
    renderPage(__("email_verify_expired_title"), __("email_verify_expired_msg"), false);
}

// 1. 解密密码
$encryption_key = 'WAR3_TEMP_PASS_KEY_2026'; // 生产环境请移至 config.php
$encrypted_data = base64_decode($tempUser['encrypted_password']);
list($encrypted_password, $iv) = explode('::', $encrypted_data, 2);
$password = openssl_decrypt($encrypted_password, 'aes-256-cbc', $encryption_key, 0, $iv);

if (!$password) {
    renderPage(__("email_verify_fail_title"), __("email_verify_decrypt_fail"), false);
}

// 2. 尝试通过 TCP 协议注册到 PvPGN 服务器
$pvpgnRegistered = false;
try {
    $pvpgn = new ClientManager(PVPGN_HOST, PVPGN_PORT);
    if ($pvpgn->register($tempUser['username'], $password)) {
        $pvpgnRegistered = true;
        // 注册成功后，立即更新 PvPGN 数据库的 acct_email，避免魔兽争霸客户端登录时弹出邮箱验证/绑定窗口
        $db->updatePvpgnEmail($tempUser['username'], $tempUser['acct_email']);
    } else {
        $errorMsg = $pvpgn->getLastError() ?? '未知错误';
        renderPage(__("email_verify_fail_title"), __("email_verify_pvpgn_fail") . " 详细信息: " . htmlspecialchars($errorMsg), false);
    }
} catch (Exception $e) {
    error_log("PvPGN TCP Registration failed: " . $e->getMessage());
    renderPage(__("email_verify_fail_title"), __("email_verify_pvpgn_fail") . " 详细信息: " . htmlspecialchars($e->getMessage()), false);
}

// 3. 注册成功后，将临时用户移动到主用户表
if ($pvpgnRegistered && $db->moveTempUserToUsers($tempUser)) {
    // 4. 从 pvpgn_BNET 同步数据到 users 表
    error_log("Starting sync for user: " . $tempUser['username'] . " with email: " . $tempUser['acct_email']);
    $db->syncFromPvpgn($tempUser['username'], $tempUser['acct_email']);
    
    // 5. 删除临时用户
    $db->deleteTempUser($tempUser['username']);
    
    renderPage(__("email_verify_success_title"), __("email_verify_success_msg"), true);
} else {
    renderPage(__("email_verify_fail_title"), __("email_verify_db_fail"), false);
}
