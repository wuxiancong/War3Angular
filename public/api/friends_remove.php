<?php
require_once __DIR__ . '/friends_common.php';

$data = friends_read_json();
$db = new Database();
$me = friends_require_user($db, $data);

$target = trim($data['target'] ?? $data['friendName'] ?? $data['userName'] ?? '');
if ($target === '') {
    friends_fail('ERR_EMPTY_TARGET', '请指定要删除的好友');
}

$result = $db->removeFriend($me, $target);
if (!$result['success']) {
    echo json_encode($result);
    exit;
}
friends_ok(['message' => $result['message']]);
