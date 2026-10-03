<?php
/**
 * 临时邮箱激活页面
 * 用户在邮件中点击链接访问此页面进行激活
 */
require_once 'database.php';
require_once 'i18n.php';

$token = $_GET['token'] ?? '';
$token = trim($token);

$success = false;
$title = __('temp_email_verify_title');
$message = "";
$username = "";
$email = "";

if (empty($token)) {
    $title = __('temp_email_verify_fail_title');
    $message = __('email_verify_missing_token');
} else {
    try {
        $db = new Database();
        $result = $db->verifyTempEmailToken($token);
        if ($result['success']) {
            $success = true;
            $title = __('temp_email_verify_success_title');
            $username = $result['username'];
            $email = $result['temp_email'];
            $message = __('temp_email_verify_success_msg') . "<br><br><strong>" . htmlspecialchars($username) . "</strong> (" . htmlspecialchars($email) . ")";
        } else {
            $title = __('temp_email_verify_fail_title');
            $message = $result['message'];
        }
    } catch (Exception $e) {
        $title = __('temp_email_verify_fail_title');
        $message = htmlspecialchars($e->getMessage());
    }
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $title; ?> - CC 对战平台</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: #f8fafc;
        }
        .card {
            background: rgba(30, 41, 59, 0.85);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            max-width: 500px;
            width: 100%;
            padding: 40px 30px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        }
        .icon-wrap {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
        }
        .icon-success {
            background: rgba(34, 197, 94, 0.15);
            border: 2px solid #22c55e;
            color: #22c55e;
        }
        .icon-fail {
            background: rgba(239, 68, 68, 0.15);
            border: 2px solid #ef4444;
            color: #ef4444;
        }
        h1 {
            font-size: 24px;
            margin-bottom: 16px;
            font-weight: 700;
        }
        .msg {
            font-size: 15px;
            line-height: 1.7;
            color: #cbd5e1;
            margin-bottom: 30px;
        }
        .tips {
            background: rgba(255, 255, 255, 0.05);
            padding: 15px;
            border-radius: 10px;
            font-size: 13px;
            color: #94a3b8;
            margin-bottom: 25px;
            text-align: left;
        }
        .btn {
            display: inline-block;
            background: #3b82f6;
            color: #fff;
            text-decoration: none;
            padding: 12px 30px;
            border-radius: 10px;
            font-weight: 600;
            font-size: 15px;
            transition: all 0.2s;
        }
        .btn:hover {
            background: #2563eb;
            transform: translateY(-1px);
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon-wrap <?php echo $success ? 'icon-success' : 'icon-fail'; ?>">
            <?php echo $success ? '✓' : '✕'; ?>
        </div>
        <h1><?php echo $title; ?></h1>
        <div class="msg">
            <?php echo $message; ?>
        </div>

        <?php if ($success): ?>
            <div class="tips">
                <p>📌 <strong>温馨提示：</strong></p>
                <p>• 您现在可以在游戏客户端中直接查看临时通知邮箱状态为【已激活】。</p>
                <p>• 每日战报、成就达成、活动消息等将自动投递至该邮箱。</p>
            </div>
        <?php endif; ?>

        <a href="javascript:window.close();" class="btn"><?php echo __('temp_email_verify_btn_done'); ?></a>
    </div>
</body>
</html>
