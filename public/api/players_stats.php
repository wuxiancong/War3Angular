<?php
/**
 * players_stats.php
 * Fetch player statistics for room slots with security verification.
 */

require_once 'database.php';

// --- Security Configuration ---
define('APP_SECRET_KEY', 'CC_War3_@#_Platform_2026_SecureKey'); // Must match C++ client
define('SIGN_EXPIRY', 60); // Signature valid for 60 seconds

// 1. Prevent Cross-Origin (CORS)
header('Access-Control-Allow-Origin: none');
header('Content-Type: application/json; charset=utf-8');

// 2. Anti-Bot: Check User-Agent
$ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
$forbidden_agents = ['curl', 'python', 'wget', 'go-http', 'postman', 'spider', 'bot', 'headless'];
foreach ($forbidden_agents as $agent) {
    if (stripos($ua, $agent) !== false) {
        http_response_code(403);
        echo json_encode(['error' => 'Access Denied: Bot detected']);
        exit;
    }
}

// 3. Security Parameters Check
$usernamesStr = $_GET['usernames'] ?? '';
$timestamp    = intval($_GET['t'] ?? 0);
$signature    = $_GET['sign'] ?? '';

// Basic sanitization: only allow alphanumeric, comma, underscore, hyphen, dot
if (!preg_match('/^[a-zA-Z0-9._,-]+$/', $usernamesStr)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid usernames format']);
    exit;
}

if (empty($usernamesStr) || empty($signature) || $timestamp <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing security parameters']);
    exit;
}

// 4. Signature Expiry Check (Anti-Replay)
if (abs(time() - $timestamp) > SIGN_EXPIRY) {
    http_response_code(403);
    echo json_encode(['error' => 'Request expired']);
    exit;
}

// 5. Signature Verification: md5(usernames + timestamp + secret_key)
$expectedSign = md5($usernamesStr . $timestamp . APP_SECRET_KEY);
if ($signature !== $expectedSign) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

// --- Database Logic ---
try {
    $db = new Database();
    $pdo = $db->getConnection();

    $usernames = explode(',', $usernamesStr);
    if (count($usernames) > 12) {
        http_response_code(400);
        echo json_encode(['error' => 'Too many usernames']);
        exit;
    }

    // Batch query using IN
    $placeholders = str_repeat('?,', count($usernames) - 1) . '?';
    $sql = "SELECT * FROM ladder_stats WHERE username IN ($placeholders)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($usernames);
    $rows = $stmt->fetchAll();

    $result = [];
    $rankMap = ["D", "D", "C", "B", "A", "S", "SS", "SSS"]; // Index 0 and 1 are 'D'

    foreach ($rows as $row) {
        $totalGames = $row['wins'] + $row['losses'] + $row['draws'] + $row['escapes'];
        
        // Calculate Win Rate
        $winRate = ($totalGames > 0) ? round(($row['wins'] / $totalGames) * 100, 1) . '%' : '0%';
        
        // Calculate KDA: (K+A)/max(1, D)
        $deaths = max(1, $row['total_deaths']);
        $kda = round(($row['total_kills'] + $row['total_assists']) / $deaths, 1);
        
        // Calculate Escape Rate
        $escapeRate = ($totalGames > 0) ? round(($row['escapes'] / $totalGames) * 100, 1) . '%' : '0%';

        $result[$row['username']] = [
            "score" => (string)$row['score'],
            "rank_name" => $rankMap[$row['rank_level']] ?? "-",
            "kda" => (string)$kda,
            "winRate" => $winRate,
            "escapeRate" => $escapeRate
        ];
    }

    // Fill defaults for missing players
    foreach ($usernames as $name) {
        if (!isset($result[$name])) {
            $result[$name] = [
                "score" => "1000",
                "rank_name" => "D",
                "kda" => "0.0",
                "winRate" => "0%",
                "escapeRate" => "0%"
            ];
        }
    }

    echo json_encode($result);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error']);
}
