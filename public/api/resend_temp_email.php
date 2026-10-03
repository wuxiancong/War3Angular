<?php
/**
 * 重新发送临时邮箱激活邮件 API
 * 供客户端 (Qt/QML 等) 调用
 * 
 * 请求方式: POST 或 GET
 * 参数:
 *   - username / userName: 用户名 (必填)
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
require_once 'mailer.php';
require_once 'i18n.php';

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

    if (!$data || empty($data['temp_email'])) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error_code' => 'ERR_NO_TEMP_EMAIL',
            'message' => __('err_no_temp_email')
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($data['is_temp_email_verified']) {
        echo json_encode([
            'success' => true,
            'already_verified' => true,
            'message' => __('err_already_verified')
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $email = $data['temp_email'];

    // 检查 60 秒限流
    if (!$db->canSendEmail($email)) {
        http_response_code(429);
        echo json_encode([
            'success' => false,
            'error_code' => 'ERR_RATE_LIMIT',
            'message' => __('err_rate_limit')
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 重新生成 Token
    $result = $db->setTempEmail($username, $email);
    $token = $result['token'];

    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? '139.155.155.166';
    $verifyLink = "{$scheme}://{$host}/api/verify_temp_email.php?token={$token}";

    $mailer = new Mailer();
    $subject = "【CC对战平台】请激活您的临时通知邮箱";
    $body = "
    <div style='font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden; background: #ffffff;'>
        <div style='background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; padding: 25px; text-align: center;'>
            <h2 style='margin: 0; font-size: 22px;'>📬 CC 对战平台 - 临时邮箱激活</h2>
        </div>
        <div style='padding: 30px; color: #333; line-height: 1.6;'>
            <p style='font-size: 16px;'>尊敬的玩家 <strong>" . htmlspecialchars($username) . "</strong>，您好：</p>
            <p>您重新申请了激活临时通知邮箱（<strong>" . htmlspecialchars($email) . "</strong>）。</p>
            <p>请点击下方按钮激活此临时邮箱：</p>
            <div style='text-align: center; margin: 35px 0;'>
                <a href='{$verifyLink}' style='background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;'>点击激活临时邮箱</a>
            </div>
            <p style='color: #888; font-size: 13px;'>如果上方按钮无法点击，请复制以下链接到浏览器打开：</p>
            <p style='word-break: break-all; font-size: 13px; color: #007bff; background: #f8f9fa; padding: 10px; border-radius: 4px;'>{$verifyLink}</p>
            <p style='color: #999; font-size: 12px; margin-top: 30px;'>提示：此激活链接有效期为 24 小时。若非您本人操作，请忽略此邮件。</p>
        </div>
    </div>";

    $mailSent = $mailer->send($email, $subject, $body);
    if ($mailSent) {
        $db->logEmailSent($email);
    }

    echo json_encode([
        'success' => true,
        'message' => __('temp_email_resend_success'),
        'data' => [
            'username' => $username,
            'temp_email' => $email,
            'mail_sent' => $mailSent
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error_code' => 'ERR_SERVER_EXCEPTION',
        'message' => '服务器异常: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
