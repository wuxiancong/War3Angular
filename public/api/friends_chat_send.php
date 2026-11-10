<?php
require_once __DIR__ . '/friends_common.php';

$data = friends_read_json();
$db = new Database();
$me = friends_require_user($db, $data);

$other = trim($data['friendName'] ?? $data['target'] ?? $data['userName'] ?? '');
$message = $data['message'] ?? $data['text'] ?? '';

if ($other === '') {
    friends_fail('ERR_EMPTY_TARGET', '请指定好友');
}

$result = $db->sendFriendChatMessage($me, $other, $message);
if (!$result['success']) {
    echo json_encode($result);
    exit;
}
friends_ok($result);
