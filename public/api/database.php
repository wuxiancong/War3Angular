<?php
// api/database.php
require_once 'config.php';

class Database {
    private $pdo;

    public function getPdo() {
        return $this->pdo;
    }

    public function __construct() {
        try {
            $this->pdo = new PDO(
                "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS users (
                uid int NOT NULL AUTO_INCREMENT COMMENT '战网唯一ID',
                acct_username varchar(32) DEFAULT NULL,
                username varchar(32) NOT NULL PRIMARY KEY COMMENT '平台登录名',
                acct_userid int DEFAULT NULL,
                acct_passhash1 varchar(40) DEFAULT NULL,
                acct_email varchar(128) DEFAULT NULL,
                auth_admin varchar(6) DEFAULT 'false',
                auth_normallogin varchar(6) DEFAULT 'true',
                auth_changepass varchar(6) DEFAULT 'true',
                auth_changeprofile varchar(6) DEFAULT 'true',
                auth_botlogin varchar(6) DEFAULT 'false',
                auth_operator varchar(6) DEFAULT 'false',
                new_at_team_flag int DEFAULT 0,
                auth_lock varchar(6) DEFAULT 'false',
                auth_locktime int DEFAULT 0,
                auth_lockreason varchar(128) DEFAULT NULL,
                auth_mute varchar(6) DEFAULT 'false',
                auth_mutetime int DEFAULT 0,
                auth_mutereason varchar(128) DEFAULT NULL,
                auth_command_groups varchar(16) DEFAULT '1',
                acct_lastlogin_time int DEFAULT 0,
                acct_lastlogin_owner varchar(128) DEFAULT NULL,
                acct_lastlogin_clienttag varchar(4) DEFAULT NULL,
                acct_lastlogin_ip varchar(45) DEFAULT NULL COMMENT '支持IPv6',
                acct_ctime varchar(128) DEFAULT NULL,
                acct_userlang varchar(128) DEFAULT NULL,
                acct_verifier varchar(128) DEFAULT NULL,
                acct_salt varchar(128) DEFAULT NULL,
                nickname VARCHAR(32) DEFAULT '' COMMENT '显示昵称',
                last_uuid VARCHAR(40) DEFAULT '' COMMENT '软件安装实例UUID',
                last_hwid VARCHAR(64) DEFAULT '' COMMENT '物理硬件指纹',
                web_password_hash VARCHAR(255) DEFAULT NULL COMMENT '网页端登录密码Hash',
                login_source VARCHAR(20) DEFAULT 'web' COMMENT '登录来源: web, launcher, game',
                is_web_verified TINYINT(1) DEFAULT 0 COMMENT '网页端验证状态',
                tellphone_number VARCHAR(20) DEFAULT NULL COMMENT '绑定手机号',
                is_email_verified TINYINT(1) DEFAULT 0 COMMENT '邮箱是否已激活',
                is_phone_verified TINYINT(1) DEFAULT 0 COMMENT '手机是否已绑定',
                total_ingame_time INT DEFAULT 0 COMMENT '游戏内累计时长(分钟)',
                cheat_records_count INT DEFAULT 0 COMMENT '作弊记录次数',
                report_records_count INT DEFAULT 0 COMMENT '被举报次数',
                email_verify_token VARCHAR(64) DEFAULT NULL COMMENT '邮箱验证Token',
                email_verify_expires DATETIME DEFAULT NULL COMMENT '邮箱验证链接过期时间',
                password_reset_token VARCHAR(64) DEFAULT NULL COMMENT '密码重置Token',
                password_reset_expires DATETIME DEFAULT NULL COMMENT '密码重置链接过期时间',
                register_ip VARCHAR(45) DEFAULT '' COMMENT '初始注册IP (支持IPv6)',
                register_location VARCHAR(64) DEFAULT '未知' COMMENT '注册地理位置',
                register_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '平台注册时间',
                deleted_time DATETIME DEFAULT NULL COMMENT '注销时间(软删除)',
                role TINYINT DEFAULT 0 COMMENT '0玩家, 1管理, 2超管',
                status TINYINT DEFAULT 0 COMMENT '0离线, 1大厅, 2房间, 3战斗',
                total_online_time INT DEFAULT 0 COMMENT '累计在线分钟',
                avatar_url VARCHAR(255) DEFAULT '' COMMENT '用户头像路径',
                banned_until DATETIME DEFAULT NULL COMMENT 'Web端封禁截止时间',
                coins_current_balance DECIMAL(10,2) DEFAULT 0.00 COMMENT 'CC币余额',
                coins_total_recharged DECIMAL(10,2) DEFAULT 0.00 COMMENT '累计充值总额',
                is_vip BOOLEAN DEFAULT FALSE COMMENT '是否是VIP',
                vip_expires_at DATETIME DEFAULT NULL COMMENT 'VIP到期时间',
                UNIQUE KEY idx_uid (uid),
                INDEX idx_hwid (last_hwid),
                INDEX idx_email (acct_email),
                INDEX idx_phone (tellphone_number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // b. 用户临时表 (temp_users)
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS temp_users (
                id INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '临时表自增ID',
                username VARCHAR(32) NOT NULL COMMENT '平台登录名',
                acct_email VARCHAR(128) NOT NULL COMMENT '注册邮箱',
                tellphone_number VARCHAR(20) DEFAULT NULL COMMENT '绑定手机号',
                web_password_hash VARCHAR(255) NOT NULL COMMENT '网页端登录密码Hash',
                encrypted_password VARCHAR(255) NOT NULL COMMENT '加密的明文密码用于PvPGN注册',
                acct_salt VARCHAR(128) DEFAULT NULL COMMENT '战网密码盐值',
                acct_verifier VARCHAR(128) DEFAULT NULL COMMENT '战网密码验证器',
                email_verify_token VARCHAR(64) NOT NULL COMMENT '邮箱验证Token',
                email_verify_expires DATETIME NOT NULL COMMENT '邮箱验证链接过期时间',
                register_ip VARCHAR(45) DEFAULT '' COMMENT '初始注册IP (支持IPv6)',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '临时记录创建时间',
                UNIQUE KEY idx_temp_username (username),
                UNIQUE KEY idx_temp_email (acct_email),
                INDEX idx_temp_token (email_verify_token)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // c. 邮件发送记录表 (email_logs)
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS email_logs (
                id INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '自增ID',
                email VARCHAR(128) NOT NULL COMMENT '邮箱地址',
                sent_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
                INDEX idx_email_sent (email, sent_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        } catch (PDOException $e) {
            // 在实际生产环境中，不要把详细的数据库错误暴露给前端，记录到日志即可
            error_log("Database connection failed: " . $e->getMessage());
            http_response_code(500);
            die(json_encode(['success' => false, 'message' => '数据库连接失败']));
        }
    }

    /**
     * 检查是否可以发送邮件 (限制 60 秒内只能发送一次)
     */
    public function canSendEmail($email) {
        $email = trim($email);
        $stmt = $this->pdo->prepare("SELECT sent_at FROM email_logs WHERE email = ? ORDER BY sent_at DESC LIMIT 1");
        $stmt->execute([$email]);
        $lastSent = $stmt->fetchColumn();
        
        if ($lastSent) {
            $lastSentTime = strtotime($lastSent);
            $diff = time() - $lastSentTime;
            error_log("canSendEmail: email=$email, lastSent=$lastSent, diff=$diff");
            if ($diff < 60) {
                return false;
            }
        }
        return true;
    }

    /**
     * 记录邮件发送时间
     */
    public function logEmailSent($email) {
        $email = trim($email);
        $stmt = $this->pdo->prepare("INSERT INTO email_logs (email, sent_at) VALUES (?, ?)");
        $result = $stmt->execute([$email, date('Y-m-d H:i:s')]);
        if (!$result) {
            error_log("logEmailSent failed: " . implode(" ", $stmt->errorInfo()));
        }
        return $result;
    }

    /**
     * 获取 PDO 连接实例
     */
    public function getConnection() {
        return $this->pdo;
    }

    /**
     * 检查用户名是否存在
     */
    public function userExists($username) {
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM users WHERE username = ?");
        $stmt->execute([$username]);
        return $stmt->fetchColumn() > 0;
    }

    /**
     * 检查用户名是否存在于 users, temp_users 或 pvpgn_BNET 表中
     */
    public function checkUserInBothTables($username) {
        $existsInUsers = false;
        $existsInTemp = false;
        $existsInPvpgn = false;

        // 1. 检查 Web 的 users 表
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM users WHERE username = ?");
        $stmt->execute([$username]);
        if ($stmt->fetchColumn() > 0) {
            $existsInUsers = true;
        }

        // 2. 检查 temp_users 表
        $stmtTemp = $this->pdo->prepare("SELECT COUNT(*) FROM temp_users WHERE username = ?");
        $stmtTemp->execute([$username]);
        if ($stmtTemp->fetchColumn() > 0) {
            $existsInTemp = true;
        }

        // 3. 检查 PvPGN 的 pvpgn_BNET 表 (使用 try-catch 防止表不存在时报错)
        try {
            $stmt2 = $this->pdo->prepare("SELECT COUNT(*) FROM pvpgn_BNET WHERE username = ?");
            $stmt2->execute([$username]);
            if ($stmt2->fetchColumn() > 0) {
                $existsInPvpgn = true;
            }
        } catch (PDOException $e) {
            // 表不存在或查询失败，忽略
        }

        return [
            'exists' => ($existsInUsers || $existsInTemp || $existsInPvpgn),
            'in_users' => $existsInUsers,
            'in_temp' => $existsInTemp,
            'in_pvpgn' => $existsInPvpgn
        ];
    }

    /**
     * 检查邮箱是否存在于 users 或 temp_users 表中
     */
    public function checkEmailExists($email) {
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM users WHERE acct_email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetchColumn() > 0) {
            return true;
        }

        $stmtTemp = $this->pdo->prepare("SELECT COUNT(*) FROM temp_users WHERE acct_email = ?");
        $stmtTemp->execute([$email]);
        if ($stmtTemp->fetchColumn() > 0) {
            return true;
        }

        return false;
    }

    /**
     * 创建临时用户 (待邮箱验证)
     */
    public function createTempUser($username, $password, $email, $phone, $salt, $verifier, $email_token, $email_expires, $encrypted_password, $register_ip) {
        $sql = "INSERT INTO temp_users (
            username, 
            acct_email, 
            tellphone_number, 
            web_password_hash,
            encrypted_password,
            acct_salt,
            acct_verifier,
            email_verify_token,
            email_verify_expires,
            register_ip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        
        $web_hash = password_hash($password, PASSWORD_BCRYPT);
        
        $stmt = $this->pdo->prepare($sql);
        return $stmt->execute([
            $username,
            $email,
            $phone,
            $web_hash,
            $encrypted_password,
            $salt,
            $verifier,
            $email_token,
            $email_expires,
            $register_ip
        ]);
    }

    /**
     * 通过 Token 获取临时用户
     */
    public function getTempUserByToken($token) {
        $stmt = $this->pdo->prepare("SELECT * FROM temp_users WHERE email_verify_token = ?");
        $stmt->execute([$token]);
        return $stmt->fetch();
    }

    /**
     * 通过用户名获取临时用户
     */
    public function getTempUserByUsername($username) {
        $stmt = $this->pdo->prepare("SELECT * FROM temp_users WHERE username = ?");
        $stmt->execute([$username]);
        return $stmt->fetch();
    }

    /**
     * 删除临时用户
     */
    public function deleteTempUser($username) {
        $stmt = $this->pdo->prepare("DELETE FROM temp_users WHERE username = ?");
        return $stmt->execute([$username]);
    }

    /**
     * 将临时用户移动到主用户表
     */
    public function moveTempUserToUsers($tempUser) {
        $sql = "INSERT INTO users (
            username, 
            acct_username, 
            acct_email, 
            tellphone_number, 
            web_password_hash,
            acct_salt,
            acct_verifier,
            is_email_verified,
            register_ip,
            register_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())";
        
        $stmt = $this->pdo->prepare($sql);
        return $stmt->execute([
            $tempUser['username'],
            $tempUser['username'], // acct_username
            $tempUser['acct_email'],
            $tempUser['tellphone_number'],
            $tempUser['web_password_hash'],
            $tempUser['acct_salt'],
            $tempUser['acct_verifier'],
            $tempUser['register_ip']
        ]);
    }

    /**
     * 创建新用户 (初始仅包含 Web 相关数据)
     */
    public function createUser($username, $password, $email, $phone, $salt, $verifier, $email_token = null, $email_expires = null) {
        // 初始注册仅存储 Web 登录所需字段，PvPGN 相关字段将在后续同步
        $sql = "INSERT INTO users (
            username, 
            acct_username, 
            acct_email, 
            tellphone_number, 
            web_password_hash,
            email_verify_token,
            email_verify_expires,
            register_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())";
        
        // 网页端密码使用 password_hash 进行安全存储
        $web_hash = password_hash($password, PASSWORD_BCRYPT);
        
        $stmt = $this->pdo->prepare($sql);
        return $stmt->execute([
            $username,
            $username, // acct_username 通常与 username 相同
            $email,
            $phone,
            $web_hash,
            $email_token,
            $email_expires
        ]);
    }

    /**
     * 创建纯 Web 用户 (不包含 PvPGN 游戏账号数据)
     */
    public function createWebUser($username, $password, $email, $phone, $email_token, $email_expires) {
        $sql = "INSERT INTO users (
            username, 
            acct_username, 
            acct_email, 
            tellphone_number, 
            web_password_hash,
            email_verify_token,
            email_verify_expires,
            register_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())";
        
        $web_hash = password_hash($password, PASSWORD_BCRYPT);
        
        $stmt = $this->pdo->prepare($sql);
        return $stmt->execute([
            $username,
            $username, // acct_username 保持与 username 一致
            $email,
            $phone,
            $web_hash,
            $email_token,
            $email_expires
        ]);
    }

    /**
     * 从 pvpgn_BNET 同步数据到 users 表
     */
    public function syncFromPvpgn($username) {
        try {
            // 1. 从 pvpgn_BNET 获取数据
            $stmt = $this->pdo->prepare("SELECT * FROM pvpgn_BNET WHERE username = ?");
            $stmt->execute([$username]);
            $pvpgnData = $stmt->fetch();

            if (!$pvpgnData) return false;

            // 2. 更新 users 表中的对应字段，同步所有 28 个 PvPGN 原生字段
            $sql = "UPDATE users SET 
                uid = ?,
                acct_username = ?,
                acct_userid = ?,
                acct_passhash1 = ?,
                acct_email = ?,
                auth_admin = ?,
                auth_normallogin = ?,
                auth_changepass = ?,
                auth_changeprofile = ?,
                auth_botlogin = ?,
                auth_operator = ?,
                new_at_team_flag = ?,
                auth_lock = ?,
                auth_locktime = ?,
                auth_lockreason = ?,
                auth_mute = ?,
                auth_mutetime = ?,
                auth_mutereason = ?,
                auth_command_groups = ?,
                acct_lastlogin_time = ?,
                acct_lastlogin_owner = ?,
                acct_lastlogin_clienttag = ?,
                acct_lastlogin_ip = ?,
                acct_ctime = ?,
                acct_userlang = ?,
                acct_verifier = ?,
                acct_salt = ?
                WHERE username = ?";
            
            $stmt2 = $this->pdo->prepare($sql);
            return $stmt2->execute([
                $pvpgnData['uid'] ?? null,
                $pvpgnData['acct_username'] ?? null,
                $pvpgnData['acct_userid'] ?? null,
                $pvpgnData['acct_passhash1'] ?? null,
                $pvpgnData['acct_email'] ?? null,
                $pvpgnData['auth_admin'] ?? 'false',
                $pvpgnData['auth_normallogin'] ?? 'true',
                $pvpgnData['auth_changepass'] ?? 'true',
                $pvpgnData['auth_changeprofile'] ?? 'true',
                $pvpgnData['auth_botlogin'] ?? 'false',
                $pvpgnData['auth_operator'] ?? 'false',
                $pvpgnData['new_at_team_flag'] ?? 0,
                $pvpgnData['auth_lock'] ?? 'false',
                $pvpgnData['auth_locktime'] ?? 0,
                $pvpgnData['auth_lockreason'] ?? null,
                $pvpgnData['auth_mute'] ?? 'false',
                $pvpgnData['auth_mutetime'] ?? 0,
                $pvpgnData['auth_mutereason'] ?? null,
                $pvpgnData['auth_command_groups'] ?? '1',
                $pvpgnData['acct_lastlogin_time'] ?? 0,
                $pvpgnData['acct_lastlogin_owner'] ?? null,
                $pvpgnData['acct_lastlogin_clienttag'] ?? null,
                $pvpgnData['acct_lastlogin_ip'] ?? null,
                $pvpgnData['acct_ctime'] ?? null,
                $pvpgnData['acct_userlang'] ?? null,
                $pvpgnData['acct_verifier'] ?? null,
                $pvpgnData['acct_salt'] ?? null,
                $username
            ]);
        } catch (PDOException $e) {
            error_log("Sync from PvPGN failed: " . $e->getMessage());
            return false;
        }
    }

    /**
     * 验证邮箱 Token
     */
    public function verifyEmailToken($token) {
        $stmt = $this->pdo->prepare("SELECT username, email_verify_expires, is_email_verified FROM users WHERE email_verify_token = ?");
        $stmt->execute([$token]);
        return $stmt->fetch();
    }

    /**
     * 标记邮箱为已验证
     */
    public function markEmailAsVerified($username) {
        $stmt = $this->pdo->prepare("UPDATE users SET is_email_verified = 1, email_verify_token = NULL, email_verify_expires = NULL WHERE username = ?");
        return $stmt->execute([$username]);
    }

    /**
     * 获取用户信息
     */
    public function getUser($username) {
        $stmt = $this->pdo->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$username]);
        return $stmt->fetch();
    }

    /**
     * 更新用户的 SRP 会话数据 (临时存储 A 用于后续验证)
     */
    public function updateSessionA($username, $A) {
        $stmt = $this->pdo->prepare("UPDATE users SET last_A = ? WHERE username = ?");
        return $stmt->execute([$A, $username]);
    }
}
