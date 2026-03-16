<?php
require_once 'public/api/config.php';
try {
    $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS);
    $stmt = $pdo->query("SHOW TABLES");
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    file_put_contents('/workspace/tables.txt', implode("\n", $tables));
} catch (Exception $e) {
    file_put_contents('/workspace/tables.txt', "Error: " . $e->getMessage());
}
