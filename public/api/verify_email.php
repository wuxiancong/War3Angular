<?php
/**
 * Email Verification API
 */
header('Content-Type: text/html; charset=utf-8');

require_once 'database.php';

$token = $_GET['token'] ?? '';

if (empty($token)) {
    die("<h2>无效的验证链接</h2><p>缺少验证 Token。</p>");
}

$db = new Database();
$user = $db->verifyEmailToken($token);

if (!$user) {
    die("<h2>验证失败</h2><p>验证链接不存在或已失效。</p>");
}

if ($user['is_email_verified'] == 1) {
    die("<h2>无需重复验证</h2><p>该邮箱已经验证过了，您可以直接登录。</p>");
}

if (strtotime($user['email_verify_expires']) < time()) {
    die("<h2>验证链接已过期</h2><p>该链接已超过 24 小时有效期，请重新注册或重新发送验证邮件。</p>");
}

if ($db->markEmailAsVerified($user['username'])) {
    echo "<h2>邮箱验证成功！</h2>";
    echo "<p>恭喜您，您的邮箱已成功验证。您现在可以返回登录页面进行登录了。</p>";
    // 可以在这里加一个跳转回登录页面的按钮或自动跳转
    echo "<p><a href='/'>返回首页</a></p>";
} else {
    echo "<h2>验证失败</h2><p>系统错误，请稍后再试。</p>";
}
