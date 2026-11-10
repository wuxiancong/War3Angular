<?php
require_once __DIR__ . '/friends_common.php';

$data = friends_read_json();
$db = new Database();
$me = friends_require_user($db, $data);

$other = trim($data['friendName'] ?? $data['target'] ?? $data['userName'] ?? '');
$limit = isset($data['limit']) ? (int)$data['limit'] : 50;
$beforeId = isset($data['before_id']) ? (int)$data['before_id'] : 0;

if ($other === '') {
    friends_fail('ERR_EMPTY_TARGET', '请指定好友');
}

$result = $db->getFriendChatHistory($me, $other, $limit, $beforeId);
if (!$result['success']) {
    echo json_encode($result);
    exit;
}
friends_ok($result);
