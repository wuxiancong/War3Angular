<?php
// api/config.php
// 本地联调：优先读环境变量 / 同级 .env；默认连本机 MySQL（与 War3Bot [mysql] 对齐）

function war3_load_dotenv_if_present(): void
{
    $candidates = [
        __DIR__ . '/.env',
        __DIR__ . '/../.env',
        __DIR__ . '/../../.env',
    ];
    foreach ($candidates as $path) {
        if (!is_readable($path)) {
            continue;
        }
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            continue;
        }
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
                continue;
            }
            [$k, $v] = explode('=', $line, 2);
            $k = trim($k);
            $v = trim($v, " \t\"'");
            if ($k !== '' && getenv($k) === false) {
                putenv("$k=$v");
                $_ENV[$k] = $v;
            }
        }
        break;
    }
}

war3_load_dotenv_if_present();

$appMode = strtolower(getenv('APP_MODE') ?: (getenv('LOCAL_MODE') === 'true' ? 'local' : 'local'));
$isLocalLike = in_array($appMode, ['local', 'test'], true)
    || filter_var(getenv('LOCAL_MODE') ?: 'true', FILTER_VALIDATE_BOOLEAN)
    || filter_var(getenv('DEBUG_MODE') ?: 'false', FILTER_VALIDATE_BOOLEAN);

if (!defined('APP_MODE')) {
    define('APP_MODE', $appMode);
}
if (!defined('IS_LOCAL_MODE')) {
    define('IS_LOCAL_MODE', $isLocalLike);
}

// 数据库连接配置（本地默认 127.0.0.1；正式部署用环境变量覆盖）
if (!defined('DB_HOST')) {
    define('DB_HOST', getenv('DATABASE_URL') ?: ($isLocalLike ? '127.0.0.1' : '139.155.155.166'));
}
if (!defined('DB_NAME')) {
    define('DB_NAME', getenv('DATABASE_NAME') ?: 'pvpgn');
}
if (!defined('DB_USER')) {
    define('DB_USER', getenv('DATABASE_USER') ?: 'pvpgn');
}
if (!defined('DB_PASS')) {
    define('DB_PASS', getenv('DATABASE_PASSWORD') ?: 'Wxc@15685243548');
}

// PvPGN 服务器配置
if (!defined('PVPGN_HOST')) {
    define('PVPGN_HOST', getenv('PVPGN_HOST') ?: '127.0.0.1');
}
if (!defined('PVPGN_PORT')) {
    define('PVPGN_PORT', intval(getenv('PVPGN_PORT') ?: 6112));
}

// 代理设置
if (!defined('HTTP_PROXY')) {
    define('HTTP_PROXY', getenv('HTTP_PROXY') ?: (getenv('ALL_PROXY') ?: ''));
}

// AI首先模型
if (!defined('GEMINI_MODEL')) {
    define('GEMINI_MODEL', getenv('GEMINI_MODEL') ?: 'gemini-2.0-flash');
}

// ============================================================
// AI API 密钥配置 (可在此处直接填入密钥，也可通过 .env 配置)
// ============================================================
if (!defined('DEEPSEEK_API_KEY')) {
    define('DEEPSEEK_API_KEY', getenv('DEEPSEEK_API_KEY') ?: '');
}

if (!defined('GEMINI_API_KEY')) {
    define('GEMINI_API_KEY', getenv('GEMINI_API_KEY') ?: '');
}

if (!defined('GEMINI_API_KEYS')) {
    define('GEMINI_API_KEYS', getenv('GEMINI_API_KEYS') ?: '');
}
