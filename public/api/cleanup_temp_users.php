<?php
/**
 * 清理过期的临时用户
 * 建议通过 cron 定期运行此脚本 (例如每小时运行一次)
 * 0 * * * * php /path/to/your/project/public/api/cleanup_temp_users.php
 */

require_once __DIR__ . '/database.php';

try {
    $db = new Database();
    $pdo = $db->getPdo(); // 需要在 Database 类中添加 getPdo 方法，或者直接在这里连接

    $sql = "DELETE FROM temp_users WHERE email_verify_expires < NOW()";
    $stmt = $pdo->prepare($sql);
    $stmt->execute();

    $deletedCount = $stmt->rowCount();
    echo "成功清理了 {$deletedCount} 个过期的临时账号。\n";
} catch (Exception $e) {
    error_log("清理过期临时用户失败: " . $e->getMessage());
    echo "清理失败: " . $e->getMessage() . "\n";
}
