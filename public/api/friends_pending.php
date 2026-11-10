<?php
require_once __DIR__ . '/friends_common.php';

$data = friends_read_json();
$db = new Database();
$me = friends_require_user($db, $data);

$pending = $db->listIncomingFriendRequests($me);
friends_ok([
    'data' => [
        'pending' => $pending,
        'pending_incoming' => count($pending)
    ]
]);
