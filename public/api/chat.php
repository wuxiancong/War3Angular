<?php
// /api/chat.php

// 允许跨域请求
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

// 处理 OPTIONS 预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ============================================================
// 1. 自动载入 config.php (如果存在)
// ============================================================
if (file_exists(__DIR__ . '/config.php')) {
    require_once __DIR__ . '/config.php';
}

// ============================================================
// 2. 自动载入 .env 文件 (解决 PHP-FPM 无法获取系统环境变量的问题)
// ============================================================
function loadEnvFile($path) {
    if (!file_exists($path)) return;
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if (empty($line) || $line[0] === '#') continue;
        if (strpos($line, '=') !== false) {
            list($name, $value) = explode('=', $line, 2);
            $name = trim($name);
            $value = trim($value, " \t\n\r\0\x0B\"'");
            if (!getenv($name)) {
                putenv("$name=$value");
                $_ENV[$name] = $value;
                $_SERVER[$name] = $value;
            }
        }
    }
}

// 尝试从当前目录及上级目录载入 .env
loadEnvFile(__DIR__ . '/.env');
loadEnvFile(__DIR__ . '/../.env');
loadEnvFile(__DIR__ . '/../../.env');
loadEnvFile(dirname(__DIR__, 2) . '/.env');

// 获取前端传过来的 JSON 数据
$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, true);

if (!$input || (!isset($input['prompt']) && !isset($input['message']))) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing prompt parameter']);
    exit;
}

$model = isset($input['model']) ? strtolower(trim($input['model'])) : 'deepseek';
$prompt = isset($input['prompt']) ? $input['prompt'] : $input['message'];
$reply = '';

// ==========================================
// 3. 读取 API Keys
// ==========================================
$DEEPSEEK_API_KEY = getenv('DEEPSEEK_API_KEY');
if (!$DEEPSEEK_API_KEY && defined('DEEPSEEK_API_KEY')) {
    $DEEPSEEK_API_KEY = constant('DEEPSEEK_API_KEY');
}

$rawGeminiKeys = getenv('GEMINI_API_KEYS') ?: (getenv('GEMINI_API_KEY') ?: '');
if (!$rawGeminiKeys && defined('GEMINI_API_KEYS')) {
    $rawGeminiKeys = constant('GEMINI_API_KEYS');
}
if (!$rawGeminiKeys && defined('GEMINI_API_KEY')) {
    $rawGeminiKeys = constant('GEMINI_API_KEY');
}

$geminiKeys = [];
if ($rawGeminiKeys) {
    $split = explode(',', $rawGeminiKeys);
    foreach ($split as $k) {
        $clean = trim($k, " \t\n\r\0\x0B\"'");
        if (!empty($clean)) {
            $geminiKeys[] = $clean;
        }
    }
}

try {
    if ($model === 'deepseek') {
        if (empty($DEEPSEEK_API_KEY)) {
            throw new Exception("DEEPSEEK_API_KEY 未配置，请在 api/config.php 或 .env 中填入 DEEPSEEK_API_KEY");
        }

        // 请求 DeepSeek API
        $url = 'https://api.deepseek.com/chat/completions';
        $data = [
            'model' => 'deepseek-chat',
            'messages' => [
                ['role' => 'user', 'content' => $prompt]
            ],
            'temperature' => 0.7
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $DEEPSEEK_API_KEY
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));

        $result = curl_exec($ch);
        if (curl_errno($ch)) {
            $curlErr = curl_error($ch);
            curl_close($ch);
            throw new Exception("DeepSeek 网络连接失败: " . $curlErr);
        }

        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $responseObj = json_decode($result, true);
        if ($httpCode >= 400) {
            $errorMsg = isset($responseObj['error']['message']) ? $responseObj['error']['message'] : $result;
            throw new Exception("DeepSeek API 错误 ($httpCode): " . $errorMsg);
        }

        if (isset($responseObj['choices'][0]['message']['content'])) {
            $reply = $responseObj['choices'][0]['message']['content'];
        } else {
            throw new Exception("DeepSeek 返回格式异常: " . $result);
        }

    } else if ($model === 'gemini') {
        if (empty($geminiKeys)) {
            throw new Exception("GEMINI_API_KEY 未配置，请在 api/config.php 或 .env 中填入 GEMINI_API_KEY");
        }

        $geminiSuccess = false;
        $lastGeminiError = '';

        // 支持多 Key 自动轮询容错
        foreach ($geminiKeys as $currentKey) {
            $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=' . urlencode($currentKey);
            $data = [
                'contents' => [
                    ['parts' => [['text' => $prompt]]]
                ]
            ];

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json'
            ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));

            $result = curl_exec($ch);
            $curlErr = curl_errno($ch) ? curl_error($ch) : '';
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if (!empty($curlErr)) {
                $lastGeminiError = "cURL 错误: " . $curlErr;
                continue;
            }

            $responseObj = json_decode($result, true);
            if ($httpCode >= 400) {
                $lastGeminiError = isset($responseObj['error']['message']) ? $responseObj['error']['message'] : ("HTTP " . $httpCode);
                continue;
            }

            if (isset($responseObj['candidates'][0]['content']['parts'][0]['text'])) {
                $reply = $responseObj['candidates'][0]['content']['parts'][0]['text'];
                $geminiSuccess = true;
                break;
            } else {
                $lastGeminiError = "Gemini 返回格式异常: " . $result;
            }
        }

        if (!$geminiSuccess) {
            throw new Exception("Gemini 请求失败: " . $lastGeminiError);
        }

    } else {
        throw new Exception("不支持的模型类型: " . htmlspecialchars($model));
    }

    echo json_encode([
        'success' => true,
        'reply' => $reply,
        'text' => $reply
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

