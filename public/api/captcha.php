<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// 图片源配置 (与 QML 相同)
$sources = [
    "https://picsum.photos/400/200?random=",
    "https://loremflickr.com/400/200?lock=",
    "https://placebear.com/400/200?random=",
    "https://img.paulzzh.com/touhou/random?w=400&h=200&_="
];

$randomId = mt_rand(1, 10000);
$sourceUrl = $sources[array_rand($sources)] . $randomId;

// 获取图片数据
$ch = curl_init($sourceUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 5); // 设置超时时间
$imgData = curl_exec($ch);
curl_close($ch);

if (!$imgData) {
    echo json_encode(['success' => false, 'message' => '无法获取验证码图片源']);
    exit;
}

// 从字符串创建图像
$bg_img = @imagecreatefromstring($imgData);
if (!$bg_img) {
    echo json_encode(['success' => false, 'message' => '验证码图片源格式错误']);
    exit;
}

// 尺寸配置 (与 QML 保持一致)
$bg_width = 400;
$bg_height = 200;
$piece_size = 45;
$tab_radius = 8;

// 缩放背景图到 400x200 (防止源图片尺寸不一致)
$resized_bg = imagecreatetruecolor($bg_width, $bg_height);
imagecopyresampled($resized_bg, $bg_img, 0, 0, 0, 0, $bg_width, $bg_height, imagesx($bg_img), imagesy($bg_img));
imagedestroy($bg_img);
$bg_img = $resized_bg;

// 计算随机 X, Y
$margin = $tab_radius + 10;
$rangeX = $bg_width - $piece_size - $margin - 20;

// 目标 X 坐标 (100 到 rangeX)
$targetX = mt_rand(100, $rangeX);
// 目标 Y 坐标 (margin 到 height - pieceSize - margin)
$targetY = mt_rand($margin, $bg_height - $piece_size - $margin);

// 生成无状态的 Token，替代 Session
$secret_key = 'WAR3_CAPTCHA_SECRET_KEY_2026';
$timestamp = time();
$payload = $targetX . '|' . $timestamp;
$signature = hash_hmac('sha256', $payload, $secret_key);
$captcha_token = base64_encode($payload . '|' . $signature);

// 创建拼图块 (带透明通道)
$slice_img = imagecreatetruecolor($piece_size, $piece_size);
imagealphablending($slice_img, false);
$transparency = imagecolorallocatealpha($slice_img, 0, 0, 0, 127);
imagefill($slice_img, 0, 0, $transparency);
imagesavealpha($slice_img, true);

// 抠图
imagecopy($slice_img, $bg_img, 0, 0, $targetX, $targetY, $piece_size, $piece_size);

// 注意：不再在背景图上画缺口，由前端通过 clip-path 渲染，保证形状一致
// 如果需要后端画，需要复杂的遮罩逻辑，这里优先保证前端对齐

// 转为 Base64
ob_start();
imagepng($bg_img);
$bg_base64 = 'data:image/png;base64,' . base64_encode(ob_get_clean());

ob_start();
imagepng($slice_img);
$slice_base64 = 'data:image/png;base64,' . base64_encode(ob_get_clean());

imagedestroy($bg_img);
imagedestroy($slice_img);

echo json_encode([
    'success' => true,
    'bg_img' => $bg_base64,
    'slice_img' => $slice_base64,
    'x' => $targetX,
    'y' => $targetY,
    'captcha_token' => $captcha_token
]);
