<?php
require_once __DIR__ . '/friends_common.php';

$data = friends_read_json();
$db = new Database();
$me = friends_require_user($db, $data);

$inviteId = isset($data['invite_id']) ? (int)$data['invite_id'] : (isset($data['id']) ? (int)$data['id'] : 0);
if ($inviteId <= 0) {
    friends_fail('ERR_MISSING_FIELDS', '缺少邀请 ID');
}

$result = $db->consumeFriendInvite($me, $inviteId);
if (!$result['success']) {
    echo json_encode($result);
    exit;
}
friends_ok($result);
