<?php
require_once __DIR__ . '/friends_common.php';

$data = friends_read_json();
$db = new Database();
$me = friends_require_user($db, $data);

$friends = $db->listFriends($me);
$pending = $db->listIncomingFriendRequests($me);
$invites = $db->listFriendInvites($me);

friends_ok([
    'data' => [
        'friends' => $friends,
        'pending' => $pending,
        'pending_incoming' => count($pending),
        'invites' => $invites
    ]
]);
