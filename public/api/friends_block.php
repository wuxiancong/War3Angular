<?php
require_once __DIR__ . '/friends_common.php';

$data = friends_read_json();
$db = new Database();
$me = friends_require_user($db, $data);

$target = trim($data['target'] ?? $data['friendName'] ?? $data['userName'] ?? '');
$block = $data['block'] ?? true;
$block = filter_var($block, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
if ($block === null) {
    $block = !in_array($data['block'] ?? true, [0, '0', false, 'false', 'no'], true);
}

if ($target === '') {
    friends_fail('ERR_EMPTY_TARGET', '请指定目标用户');
}

$result = $db->blockUser($me, $target, (bool)$block);
if (!$result['success']) {
    echo json_encode($result);
    exit;
}
friends_ok(['message' => $result['message']]);
