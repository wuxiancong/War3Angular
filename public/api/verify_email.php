<?php
/**
 * Email Verification API
 */
header('Content-Type: text/html; charset=utf-8');

require_once 'database.php';
require_once 'client_manager.php';

$token = $_GET['token'] ?? '';

if (empty($token)) {
    die("<h2>无效的验证链接</h2><p>缺少验证 Token。</p>");
}

$db = new Database();
$tempUser = $db->getTempUserByToken($token);

if (!$tempUser) {
    die("<h2>验证失败</h2><p>验证链接不存在或已失效。</p>");
}

if (strtotime($tempUser['email_verify_expires']) < time()) {
    // Token expired, delete the temp user
    $db->deleteTempUser($tempUser['username']);
    die("<h2>验证链接已过期</h2><p>该链接已超过 24 小时有效期，请重新注册。</p>");
}

// 1. 解密密码
$encryption_key = 'WAR3_TEMP_PASS_KEY_2026'; // 生产环境请移至 config.php
$encrypted_data = base64_decode($tempUser['encrypted_password']);
list($encrypted_password, $iv) = explode('::', $encrypted_data, 2);
$password = openssl_decrypt($encrypted_password, 'aes-256-cbc', $encryption_key, 0, $iv);

if (!$password) {
    die("<h2>验证失败</h2><p>密码解密失败，请联系管理员。</p>");
}

// 2. 尝试通过 TCP 协议注册到 PvPGN 服务器
$pvpgnRegistered = false;
try {
    $pvpgn = new ClientManager(PVPGN_HOST, PVPGN_PORT);
    if ($pvpgn->register($tempUser['username'], $password)) {
        $pvpgnRegistered = true;
    } else {
        die("<h2>验证失败</h2><p>PvPGN 游戏服务器注册失败，请稍后重试。</p>");
    }
} catch (Exception $e) {
    error_log("PvPGN TCP Registration failed: " . $e->getMessage());
    die("<h2>验证失败</h2><p>PvPGN 游戏服务器连接失败，请稍后重试。</p>");
}

// 3. 注册成功后，将临时用户移动到主用户表
if ($pvpgnRegistered && $db->moveTempUserToUsers($tempUser)) {
    // 4. 从 pvpgn_BNET 同步数据到 users 表
    $db->syncFromPvpgn($tempUser['username']);
    
    // 5. 删除临时用户
    $db->deleteTempUser($tempUser['username']);
    
    echo "<h2>邮箱验证成功！</h2>";
    echo "<p>您的账号已成功注册并激活，现在可以登录游戏或网页平台了。</p>";
    echo "<p><a href='/'>返回首页</a></p>";
} else {
    echo "<h2>验证失败</h2><p>将用户数据写入主表时发生错误，请联系管理员。</p>";
}
