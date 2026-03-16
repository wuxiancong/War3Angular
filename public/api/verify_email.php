<?php
/**
 * Email Verification API
 */
header('Content-Type: text/html; charset=utf-8');

require_once 'database.php';
require_once 'client_manager.php';

function renderPage($title, $message, $isSuccess = true) {
    $class = $isSuccess ? 'success' : 'error';
    echo <<<HTML
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>邮箱验证 - $title</title>
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
        <a href='/'>返回首页</a>
    </div>
</body>
</html>
HTML;
    exit;
}

$token = $_GET['token'] ?? '';

if (empty($token)) {
    renderPage("无效的验证链接", "缺少验证 Token。", false);
}

$db = new Database();
$tempUser = $db->getTempUserByToken($token);

if (!$tempUser) {
    renderPage("验证失败", "验证链接不存在或已失效。", false);
}

if (strtotime($tempUser['email_verify_expires']) < time()) {
    // Token expired, delete the temp user
    $db->deleteTempUser($tempUser['username']);
    renderPage("验证链接已过期", "该链接已超过 24 小时有效期，请重新注册。", false);
}

// 1. 解密密码
$encryption_key = 'WAR3_TEMP_PASS_KEY_2026'; // 生产环境请移至 config.php
$encrypted_data = base64_decode($tempUser['encrypted_password']);
list($encrypted_password, $iv) = explode('::', $encrypted_data, 2);
$password = openssl_decrypt($encrypted_password, 'aes-256-cbc', $encryption_key, 0, $iv);

if (!$password) {
    renderPage("验证失败", "密码解密失败，请联系管理员。", false);
}

// 2. 尝试通过 TCP 协议注册到 PvPGN 服务器
$pvpgnRegistered = false;
try {
    $pvpgn = new ClientManager(PVPGN_HOST, PVPGN_PORT);
    if ($pvpgn->register($tempUser['username'], $password)) {
        $pvpgnRegistered = true;
    } else {
        $errorMsg = $pvpgn->getLastError() ?? '未知错误';
        renderPage("验证失败", "PvPGN 游戏服务器注册失败，请稍后重试。详细信息: " . htmlspecialchars($errorMsg), false);
    }
} catch (Exception $e) {
    error_log("PvPGN TCP Registration failed: " . $e->getMessage());
    renderPage("验证失败", "PvPGN 游戏服务器连接失败，请稍后重试。详细信息: " . htmlspecialchars($e->getMessage()), false);
}

// 3. 注册成功后，将临时用户移动到主用户表
if ($pvpgnRegistered && $db->moveTempUserToUsers($tempUser)) {
    // 4. 从 pvpgn_BNET 同步数据到 users 表
    $db->syncFromPvpgn($tempUser['username']);
    
    // 5. 删除临时用户
    $db->deleteTempUser($tempUser['username']);
    
    renderPage("邮箱验证成功！", "您的账号已成功注册并激活，现在可以登录游戏或网页平台了。", true);
} else {
    renderPage("验证失败", "将用户数据写入主表时发生错误，请联系管理员。", false);
}
