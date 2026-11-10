<?php
require_once __DIR__ . '/friends_common.php';

$data = friends_read_json();
$db = new Database();
$me = friends_require_user($db, $data);

$fromUser = trim($data['from'] ?? $data['userName'] ?? $data['friendName'] ?? '');
$accept = $data['accept'] ?? null;
if ($fromUser === '') {
    friends_fail('ERR_EMPTY_TARGET', '缺少申请人用户名');
}
if ($accept === null) {
    friends_fail('ERR_MISSING_FIELDS', '缺少 accept 字段');
}
$accept = filter_var($accept, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
if ($accept === null) {
    // 兼容 1/0/"true"/"false"
    $accept = in_array($data['accept'], [1, '1', true, 'true', 'yes'], true);
}

$result = $db->respondFriendRequest($me, $fromUser, (bool)$accept);
if (!$result['success']) {
    echo json_encode($result);
    exit;
}
friends_ok(['message' => $result['message']]);
