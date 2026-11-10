<?php
require_once __DIR__ . '/friends_common.php';

$data = friends_read_json();
$db = new Database();
$me = friends_require_user($db, $data);

$target = trim($data['target'] ?? $data['friendName'] ?? $data['userName'] ?? '');
$roomName = trim($data['room'] ?? $data['roomName'] ?? '');
$hostName = trim($data['host'] ?? $data['hostName'] ?? '');

if ($target === '') {
    friends_fail('ERR_EMPTY_TARGET', '请指定邀请对象');
}
if ($roomName === '') {
    // 未显式传房间时，取自己当前房间
    $stmt = $db->getPdo()->prepare("SELECT current_room, current_host, status FROM users WHERE username = ? LIMIT 1");
    $stmt->execute([$me]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || (int)($row['status'] ?? 0) < 2 || trim($row['current_room'] ?? '') === '') {
        friends_fail('ERR_NOT_IN_ROOM', '你当前不在房间中，无法邀请');
    }
    $roomName = $row['current_room'];
    if ($hostName === '') {
        $hostName = $row['current_host'] ?? '';
    }
}

$result = $db->createFriendInvite($me, $target, $roomName, $hostName, 120);
if (!$result['success']) {
    echo json_encode($result);
    exit;
}
friends_ok($result);
