<?php
// /api/chat.php

// 允许跨域（如果前端和后端在同一个域名下，这几行可以省略）
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

// 处理 OPTIONS 预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ==========================================
// 你的 API Keys (从你的 .env.example 中读取的默认值)
// ==========================================
$DEEPSEEK_API_KEY = getenv('DEEPSEEK_API_KEY') ?: 'sk-8d40d91525994e4c8996abbbbeeb7687';
$GEMINI_API_KEY = getenv('GEMINI_API_KEY') ?: 'AIzaSyCh9mFFlpHs7kODSoly31-geZ0s2HvwwBU';

// 获取前端传过来的 JSON 数据
$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, true);

if (!$input || !isset($input['prompt'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request']);
    exit;
}

$model = isset($input['model']) ? $input['model'] : 'deepseek';
$prompt = $input['prompt'];
$reply = '';

try {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    // 如果你的 PHP 服务器有 SSL 证书验证问题，可以取消注释下面这行（不推荐在生产环境使用）
    // curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    if ($model === 'deepseek') {
        // 请求 DeepSeek API
        $url = 'https://api.deepseek.com/chat/completions';
        $data = [
            'model' => 'deepseek-chat',
            'messages' => [
                ['role' => 'user', 'content' => $prompt]
            ],
            'temperature' => 0.7
        ];

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $DEEPSEEK_API_KEY
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));

    } else if ($model === 'gemini') {
        // 请求 Gemini API
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=' . $GEMINI_API_KEY;
        $data = [
            'contents' => [
                ['parts' => [['text' => $prompt]]]
            ]
        ];

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json'
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    } else {
        throw new Exception("Unknown model selected");
    }

    $result = curl_exec($ch);
    
    if (curl_errno($ch)) {
        throw new Exception("cURL Error: " . curl_error($ch));
    }
    
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    $responseObj = json_decode($result, true);
    
    if ($httpCode >= 400) {
        $errorMsg = isset($responseObj['error']['message']) ? $responseObj['error']['message'] : $result;
        throw new Exception("API Error ($httpCode): " . $errorMsg);
    }

    if ($model === 'deepseek') {
        if (isset($responseObj['choices'][0]['message']['content'])) {
            $reply = $responseObj['choices'][0]['message']['content'];
        } else {
            throw new Exception("DeepSeek API Invalid Response: " . $result);
        }
    } else if ($model === 'gemini') {
        if (isset($responseObj['candidates'][0]['content']['parts'][0]['text'])) {
            $reply = $responseObj['candidates'][0]['content']['parts'][0]['text'];
        } else {
            throw new Exception("Gemini API Invalid Response: " . $result);
        }
    }

    // 将结果返回给前端
    echo json_encode(['reply' => $reply]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
