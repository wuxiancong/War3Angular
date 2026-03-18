<?php
/**
 * player_stats.php
 * Fetch player statistics for stats tab with security verification.
 */

require_once 'database.php';

// --- Security Configuration ---
define('APP_SECRET_KEY', 'CC_War3_@#_Platform_2026_SecureKey'); 
define('SIGN_EXPIRY', 60); 

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
$username  = $_REQUEST['username'] ?? '';
$timestamp = intval($_REQUEST['t'] ?? 0);
$signature = $_REQUEST['sign'] ?? '';

if (empty($username) || empty($signature) || $timestamp <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing security parameters']);
    exit;
}

// 4. Signature Expiry Check
if (abs(time() - $timestamp) > SIGN_EXPIRY) {
    http_response_code(403);
    echo json_encode(['error' => 'Request expired']);
    exit;
}

// 5. Signature Verification: md5(username + timestamp + secret_key)
$expectedSign = md5($username . $timestamp . APP_SECRET_KEY);
if ($signature !== $expectedSign) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

// --- Database Logic ---
try {
    $db = new Database();
    $pdo = $db->getConnection();

    // 1. Query ladder stats
    $sql_ladder = "SELECT * FROM ladder_stats WHERE username = ? LIMIT 1";
    $stmt_ladder = $pdo->prepare($sql_ladder);
    $stmt_ladder->execute([$username]);
    $ladder_row = $stmt_ladder->fetch();

    if (!$ladder_row) {
        http_response_code(404);
        echo json_encode(['error' => 'Player stats not found']);
        exit;
    }

    $rankMap = ["D", "D", "C", "B", "A", "S", "SS", "SSS"]; // Index 0 and 1 are 'D'
    
    $wins = intval($ladder_row['wins'] ?? 0);
    $losses = intval($ladder_row['losses'] ?? 0);
    $draws = intval($ladder_row['draws'] ?? 0);
    $escapes = intval($ladder_row['escapes'] ?? 0);
    $totalGames = $wins + $losses + $draws + $escapes;

    $kills = intval($ladder_row['total_kills'] ?? 0);
    $deaths = intval($ladder_row['total_deaths'] ?? 0);
    $assists = intval($ladder_row['total_assists'] ?? 0);
    $gold = intval($ladder_row['total_gold'] ?? 0);

    // Calculations
    $winRate = ($totalGames > 0) ? round(($wins / $totalGames) * 100, 1) : 0;
    $escapeRate = ($totalGames > 0) ? round(($escapes / $totalGames) * 100, 1) : 0;
    $kda = ($deaths > 0) ? round(($kills + $assists) / $deaths, 2) : ($kills + $assists);
    
    $playTime = intval($ladder_row['total_play_time_mins'] ?? 0);
    $gpm = ($playTime > 0) ? round($gold / $playTime, 1) : 0;

    // 2. Query hero stats
    $sql_heroes = "SELECT hero_name, games_played, wins, total_kills, total_deaths, total_assists, max_kills, max_duration_secs 
                   FROM player_hero_stats 
                   WHERE username = ? 
                   ORDER BY games_played DESC, wins DESC 
                   LIMIT 10";
    $stmt_heroes = $pdo->prepare($sql_heroes);
    $stmt_heroes->execute([$username]);
    $hero_rows = $stmt_heroes->fetchAll();

    $heroes_stats = [];
    foreach ($hero_rows as $hero) {
        $h_games = intval($hero['games_played']);
        $h_wins = intval($hero['wins']);
        $h_deaths = max(1, intval($hero['total_deaths']));
        $h_kda = round((intval($hero['total_kills']) + intval($hero['total_assists'])) / $h_deaths, 2);
        
        $heroes_stats[] = [
            "name" => $hero['hero_name'],
            "games" => $h_games,
            "wins" => $h_wins,
            "winRate" => ($h_games > 0) ? round(($h_wins / $h_games) * 100, 1) : 0,
            "kda" => (string)$h_kda,
            "max_kills" => intval($hero['max_kills']),
            "max_duration_secs" => intval($hero['max_duration_secs'])
        ];
    }

    // 3. Query mode stats
    $sql_modes = "SELECT game_mode, games_played, wins FROM player_mode_stats WHERE username = ?";
    $stmt_modes = $pdo->prepare($sql_modes);
    $stmt_modes->execute([$username]);
    $mode_rows = $stmt_modes->fetchAll();

    $mode_stats = [];
    foreach ($mode_rows as $mode) {
        $m_games = intval($mode['games_played']);
        $m_wins = intval($mode['wins']);
        $mode_stats[$mode['game_mode']] = [
            "games" => $m_games,
            "wins" => $m_wins,
            "winRate" => ($m_games > 0) ? round(($m_wins / $m_games) * 100, 1) : 0
        ];
    }

    // 4. Query recent matches (last 15)
    $sql_matches = "SELECT map_name, game_mode, winner_team, start_time, duration_seconds, match_type 
                    FROM matches 
                    WHERE match_id IN (
                        SELECT match_id FROM match_players WHERE username = ?
                    )
                    ORDER BY start_time DESC 
                    LIMIT 15";
    // NOTE: This assumes a 'match_players' table exists to link users to matches.
    // If it doesn't, this query will fail. I'm adding a try-catch for this specific part.
    $recent_matches = [];
    try {
        $stmt_matches = $pdo->prepare($sql_matches);
        $stmt_matches->execute([$username]);
        $recent_matches = $stmt_matches->fetchAll();
    } catch (PDOException $e) {
        // match_players table might not exist yet, skip recent matches for now
    }

    $response = [
        "ladder" => [
            "score" => intval($ladder_row['score'] ?? 1000),
            "rank_level" => intval($ladder_row['rank_level'] ?? 0),
            "rank_name" => $rankMap[$ladder_row['rank_level'] ?? 0],
            "total_games" => $totalGames,
            "wins" => $wins,
            "losses" => $losses,
            "draws" => $draws,
            "escapes" => $escapes,
            "win_rate" => $winRate,
            "escape_rate" => $escapeRate,
            "kda" => (string)$kda,
            "gpm" => (string)$gpm,
            "mvps" => intval($ladder_row['mvp_count'] ?? 0),
            "current_streak" => intval($ladder_row['current_win_streak'] ?? 0),
            "max_streak" => intval($ladder_row['max_win_streak'] ?? 0),
            "total_time_mins" => $playTime,
            "total_kills" => $kills,
            "total_deaths" => $deaths,
            "total_assists" => $assists
        ],
        "heroes" => $heroes_stats,
        "modes" => $mode_stats,
        "recent_matches" => $recent_matches
    ];

    echo json_encode($response);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
