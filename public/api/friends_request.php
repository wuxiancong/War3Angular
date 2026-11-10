<?php
require_once __DIR__ . '/friends_common.php';

$data = friends_read_json();
$db = new Database();
$me = friends_require_user($db, $data);

$target = trim($data['target'] ?? $data['friendName'] ?? $data['userName'] ?? '');
if ($target === '') {
    friends_fail('ERR_EMPTY_TARGET', '请指定要添加的用户');
}
if (!preg_match('/^[a-zA-Z0-9._\-\[\]()]{2,20}$/', $target)) {
    friends_fail('ERR_INVALID_TARGET', '用户名格式不正确');
}

$result = $db->sendFriendRequest($me, $target);
if (!$result['success']) {
    echo json_encode($result);
    exit;
}
friends_ok(['message' => $result['message']]);
