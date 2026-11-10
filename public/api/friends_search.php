<?php
require_once __DIR__ . '/friends_common.php';

$data = friends_read_json();
$db = new Database();
$me = friends_require_user($db, $data);

$keyword = trim($data['keyword'] ?? $data['query'] ?? $data['userName'] ?? '');
if ($keyword === '') {
    friends_fail('ERR_EMPTY_KEYWORD', '请输入搜索关键词');
}
if (!preg_match('/^[a-zA-Z0-9._\-\[\]()]{1,20}$/', $keyword)) {
    friends_fail('ERR_INVALID_KEYWORD', '搜索关键词格式不正确');
}

$results = $db->searchUsersForFriend($me, $keyword, 20);
friends_ok(['data' => ['users' => $results]]);
