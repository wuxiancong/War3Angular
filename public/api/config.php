<?php
// api/config.php

// 数据库连接配置
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'pvpgn');
define('DB_USER', 'pvpgn');
define('DB_PASS', ''); // 请在部署时修改为真实密码

// PvPGN 服务器配置
define('PVPGN_HOST', '127.0.0.1');
define('PVPGN_PORT', 6112);

// 代理设置
define('HTTP_PROXY', 'http://127.0.0.1:10809');

// AI首先模型
define('GEMINI_MODEL', 'gemini-2.0-flash');

// ============================================================
// AI API 密钥配置 (可在此处直接填入密钥，也可通过 .env 配置)
// ============================================================
if (!defined('DEEPSEEK_API_KEY')) {
    define('DEEPSEEK_API_KEY', getenv('DEEPSEEK_API_KEY') ?: '');
}

if (!defined('GEMINI_API_KEY')) {
    define('GEMINI_API_KEY', getenv('GEMINI_API_KEY') ?: 'AIzaSyBqeOa7eGHlMCevtWUt45TkmkT-O5Uq-sA');
}

if (!defined('GEMINI_API_KEYS')) {
    define('GEMINI_API_KEYS', getenv('GEMINI_API_KEYS') ?: 'AIzaSyDupz4HnGkaz1Fdo-7fUGc1QCusTiURXCk,AIzaSyBWKPG_90GGGMPj0tOZTaIt8mk3tMnDDNs,AIzaSyAqHjxfuwxzjVINdJp3VdWRKqT02vVso88,AIzaSyBxl4WVX4s74rOOnB3A4w6Ed_KTr6GhzkQ,AIzaSyDF1_fsjxep703Ps8IgxFNVQqrl2KPpyJA,AIzaSyCh9mFFlpHs7kODSoly31-geZ0s2HvwwBU,AIzaSyBKjchJe93rRRrv1-OrxWKmtPVwN3Zpd-Y,AIzaSyCxXFUNN-vSgKGpzz9Z4CqMlmmrMiqzRi4,AIzaSyArMwhI7YXa-39LUxDfCtHOGwMI4iN3KXg,AIzaSyDpXRR3A4ggZ1IMhSHCVjkK6dfS1ksJs6U,AIzaSyDwo7jTRjflNThItvrmis57kSe2Soi8avM,AIzaSyBSNMZNJ8Ka7K9429MnXVs3DzMLzt8sNDY,AIzaSyBvR6u09ZLgNkzJ3QX7QmB3MqcbdOzfp0I,AIzaSyA7zrFMqT_y0u7OVtcqTRVjh5A2DfMNGjU');
}

// 代理设置（国内服务器直连 Google 会超时，若服务器安装了 Clash / V2Ray 等代理，可填入如 'http://127.0.0.1:10809' 或 'http://127.0.0.1:7890'）
if (!defined('HTTP_PROXY')) {
    define('HTTP_PROXY', getenv('HTTP_PROXY') ?: (getenv('ALL_PROXY') ?: ''));
}

