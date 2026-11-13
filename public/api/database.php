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
                -- --- [第一部分：PvPGN 原生字段 (28个)] ---
                uid int NOT NULL AUTO_INCREMENT COMMENT '平台唯一ID',
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

                -- --- [第二部分：CC 平台扩展字段] ---
                nickname VARCHAR(32) DEFAULT '' COMMENT '显示昵称',
                last_uuid VARCHAR(40) DEFAULT '' COMMENT '软件安装实例UUID',
                last_hwid VARCHAR(64) DEFAULT '' COMMENT '物理硬件指纹',

                -- --- [双重验证与来源追踪] ---
                web_password_hash VARCHAR(255) DEFAULT NULL COMMENT '网页端登录密码Hash',
                login_source VARCHAR(20) DEFAULT 'web' COMMENT '登录来源: web, launcher, game',
                is_web_verified TINYINT(1) DEFAULT 0 COMMENT '网页端验证状态',

                -- --- [认证与安全相关字段] ---
                tellphone_number VARCHAR(20) DEFAULT NULL COMMENT '绑定手机号',
                is_email_verified TINYINT(1) DEFAULT 0 COMMENT '邮箱是否已激活',
                is_phone_verified TINYINT(1) DEFAULT 0 COMMENT '手机是否已绑定',
                total_ingame_time INT DEFAULT 0 COMMENT '游戏内累计时长(分钟)',
                cheat_records_count INT DEFAULT 0 COMMENT '作弊记录次数',
                report_records_count INT DEFAULT 0 COMMENT '被举报次数',

                -- --- [Token 验证相关字段] ---
                email_verify_token VARCHAR(64) DEFAULT NULL COMMENT '邮箱验证Token',
                email_verify_expires DATETIME DEFAULT NULL COMMENT '邮箱验证链接过期时间',
                password_reset_token VARCHAR(64) DEFAULT NULL COMMENT '密码重置Token',
                password_reset_expires DATETIME DEFAULT NULL COMMENT '密码重置链接过期时间',

                register_ip VARCHAR(45) DEFAULT '' COMMENT '初始注册IP (支持IPv6)',
                register_location VARCHAR(64) DEFAULT '未知' COMMENT '注册地理位置',
                register_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '平台注册时间',
                deleted_time DATETIME DEFAULT NULL COMMENT '注销时间(软删除)',

                role TINYINT DEFAULT 0 COMMENT '0玩家, 1管理, 2超管',
                status TINYINT DEFAULT 0 COMMENT '0离线 1在线 2房间 3匹配 4启动 5游戏 6结算',
                current_room VARCHAR(128) DEFAULT '' COMMENT '当前房间名',
                current_host VARCHAR(32) DEFAULT '' COMMENT '当前房主',
                total_online_time INT DEFAULT 0 COMMENT '累计在线分钟',
                avatar_url VARCHAR(255) DEFAULT '' COMMENT '用户头像路径',
                banned_until DATETIME DEFAULT NULL COMMENT 'Web端封禁截止时间',

                coins_current_balance DECIMAL(10,2) DEFAULT 0.00 COMMENT 'CC币余额',
                coins_total_recharged DECIMAL(10,2) DEFAULT 0.00 COMMENT '累计充值总额',

                is_vip BOOLEAN DEFAULT FALSE COMMENT '是否是VIP',
                vip_expires_at DATETIME DEFAULT NULL COMMENT 'VIP到期时间',

                -- 增加唯一键索引
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
                acct_salt VARCHAR(128) DEFAULT NULL COMMENT '密码盐值',
                acct_verifier VARCHAR(128) DEFAULT NULL COMMENT '密码验证器',
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

            // d. 天梯数据表 (ladder_stats)
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS ladder_stats (
                username VARCHAR(32) PRIMARY KEY,
                rank_level TINYINT DEFAULT 0 COMMENT '等级索引',
                score INT DEFAULT 1000 COMMENT '天梯积分',
                wins INT DEFAULT 0,
                losses INT DEFAULT 0,
                draws INT DEFAULT 0,
                escapes INT DEFAULT 0 COMMENT '逃跑/秒退',
                total_kills INT DEFAULT 0,
                total_deaths INT DEFAULT 0,
                total_assists INT DEFAULT 0,
                total_gold INT DEFAULT 0,
                mvp_count INT DEFAULT 0,
                current_win_streak INT DEFAULT 0,
                max_win_streak INT DEFAULT 0,
                total_play_time_mins INT DEFAULT 0 COMMENT '游戏总时长',
                FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
                INDEX idx_score (score)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // e. 英雄汇总统计表 (player_hero_stats)
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS player_hero_stats (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(32),
                hero_name VARCHAR(64),
                games_played INT DEFAULT 0,
                wins INT DEFAULT 0,
                total_kills INT DEFAULT 0,
                total_deaths INT DEFAULT 0,
                total_assists INT DEFAULT 0,
                max_kills INT DEFAULT 0 COMMENT '该英雄单场最高击杀',
                max_duration_secs INT DEFAULT 0 COMMENT '该英雄最长比赛时间',
                UNIQUE KEY idx_user_hero (username, hero_name),
                FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // f. 游戏模式汇总表 (player_mode_stats)
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS player_mode_stats (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(32),
                game_mode VARCHAR(32),
                games_played INT DEFAULT 0,
                wins INT DEFAULT 0,
                UNIQUE KEY idx_user_mode (username, game_mode),
                FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // g. 游戏比赛主表 (matches)
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS matches (
                match_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                map_name VARCHAR(128),
                game_mode VARCHAR(32) COMMENT '如: -ap, -rd, -cm',
                winner_team TINYINT COMMENT '1: 近卫, 2: 天灾',
                start_time DATETIME,
                duration_seconds INT COMMENT '比赛时长',
                match_type TINYINT COMMENT '1: 天梯积分赛, 2: 普通练习赛'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // h. 比赛玩家关联表 (match_players) - Needed for recent matches query
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS match_players (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                match_id BIGINT,
                username VARCHAR(32),
                team TINYINT COMMENT '1: 近卫, 2: 天灾',
                hero_name VARCHAR(64),
                kills INT DEFAULT 0,
                deaths INT DEFAULT 0,
                assists INT DEFAULT 0,
                gold INT DEFAULT 0,
                is_winner BOOLEAN,
                FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
                FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
                INDEX idx_user_match (username, match_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // i. API 会话表 (api_sessions) — Launcher/Web 好友等接口鉴权
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS api_sessions (
                token CHAR(64) PRIMARY KEY,
                username VARCHAR(32) NOT NULL,
                source VARCHAR(20) DEFAULT 'launcher',
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                KEY idx_api_session_user (username),
                KEY idx_api_session_exp (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // j. 好友关系表 (friendships)
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS friendships (
                user_id VARCHAR(32) NOT NULL,
                friend_id VARCHAR(32) NOT NULL,
                status TINYINT NOT NULL DEFAULT 0 COMMENT '0申请中 1已是好友 2黑名单 3已拒绝',
                initiated_by VARCHAR(32) NOT NULL COMMENT '谁发起的申请',
                remark VARCHAR(64) DEFAULT '' COMMENT '备注名',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, friend_id),
                KEY idx_friend_status (friend_id, status),
                KEY idx_user_status (user_id, status),
                FOREIGN KEY (user_id) REFERENCES users(username) ON DELETE CASCADE,
                FOREIGN KEY (friend_id) REFERENCES users(username) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // k. 好友私聊消息表 (friend_messages)
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS friend_messages (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                sender VARCHAR(32) NOT NULL,
                receiver VARCHAR(32) NOT NULL,
                message TEXT NOT NULL,
                is_read TINYINT(1) DEFAULT 0,
                sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                KEY idx_pair_time (sender, receiver, sent_at),
                KEY idx_recv_unread (receiver, is_read, sent_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // 自动检查并为 users 表增加临时邮箱字段 (如果不存在)
            try {
                $cols = $this->pdo->query("SHOW COLUMNS FROM users LIKE 'temp_email'")->fetchAll();
                if (empty($cols)) {
                    $this->pdo->exec("ALTER TABLE users 
                        ADD COLUMN temp_email VARCHAR(128) DEFAULT NULL COMMENT '临时通知邮箱',
                        ADD COLUMN is_temp_email_verified TINYINT(1) DEFAULT 0 COMMENT '临时邮箱是否已激活',
                        ADD COLUMN temp_email_token VARCHAR(64) DEFAULT NULL COMMENT '临时邮箱激活Token',
                        ADD COLUMN temp_email_expires DATETIME DEFAULT NULL COMMENT '临时邮箱激活Token过期时间'");
                }
            } catch (Exception $e) {
                // 表结构已存在或临时异常，忽略
            }

            // friendships 旧表兼容：补齐 initiated_by / remark / updated_at
            try {
                $fsCols = $this->pdo->query("SHOW COLUMNS FROM friendships")->fetchAll(PDO::FETCH_COLUMN);
                if ($fsCols && !in_array('initiated_by', $fsCols, true)) {
                    $this->pdo->exec("ALTER TABLE friendships ADD COLUMN initiated_by VARCHAR(32) NOT NULL DEFAULT '' COMMENT '谁发起的申请' AFTER status");
                    $this->pdo->exec("UPDATE friendships SET initiated_by = user_id WHERE initiated_by = '' OR initiated_by IS NULL");
                }
                if ($fsCols && !in_array('remark', $fsCols, true)) {
                    $this->pdo->exec("ALTER TABLE friendships ADD COLUMN remark VARCHAR(64) DEFAULT '' COMMENT '备注名' AFTER initiated_by");
                }
                if ($fsCols && !in_array('updated_at', $fsCols, true)) {
                    $this->pdo->exec("ALTER TABLE friendships ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at");
                }
            } catch (Exception $e) {
                // 忽略兼容迁移异常
            }

            // users 在线态房间字段
            try {
                $uCols = $this->pdo->query("SHOW COLUMNS FROM users")->fetchAll(PDO::FETCH_COLUMN);
                if ($uCols && !in_array('current_room', $uCols, true)) {
                    $this->pdo->exec("ALTER TABLE users ADD COLUMN current_room VARCHAR(128) DEFAULT '' COMMENT '当前房间名'");
                }
                if ($uCols && !in_array('current_host', $uCols, true)) {
                    $this->pdo->exec("ALTER TABLE users ADD COLUMN current_host VARCHAR(32) DEFAULT '' COMMENT '当前房主'");
                }
            } catch (Exception $e) {
            }

            // 好友房间邀请
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS friend_invites (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                inviter VARCHAR(32) NOT NULL,
                invitee VARCHAR(32) NOT NULL,
                room_name VARCHAR(128) NOT NULL,
                host_name VARCHAR(32) DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                KEY idx_invitee_exp (invitee, expires_at),
                KEY idx_inviter (inviter)
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
        $username = trim($username);
        $existsInUsers = false;
        $existsInTemp = false;
        $existsInPvpgn = false;

        // 1. 检查 temp_users 表
        $stmtTemp = $this->pdo->prepare("SELECT COUNT(*) FROM temp_users WHERE username = ?");
        $stmtTemp->execute([$username]);
        if ($stmtTemp->fetchColumn() > 0) {
            $existsInTemp = true;
        }

        // 2. 检查 Web 的 users 表
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM users WHERE username = ?");
        $stmt->execute([$username]);
        if ($stmt->fetchColumn() > 0) {
            $existsInUsers = true;
        }

        // 3. 检查 PvPGN 表 (兼容不同表名大小写以及用户名大小写)
        $tables = ['pvpgn_BNET', 'BNET', 'pvpgn_bnet', 'bnet'];
        foreach ($tables as $table) {
            try {
                $stmt2 = $this->pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE LOWER(username) = LOWER(?) OR acct_username = ?");
                $stmt2->execute([$username, $username]);
                if ($stmt2->fetchColumn() > 0) {
                    $existsInPvpgn = true;
                    break;
                }
            } catch (PDOException $e) {
                // 表不存在或查询失败，尝试下一个可能表名
            }
        }

        return [
            'exists' => ($existsInUsers || $existsInTemp || $existsInPvpgn),
            'in_users' => $existsInUsers,
            'in_temp' => $existsInTemp,
            'in_pvpgn' => $existsInPvpgn
        ];
    }

    /**
     * 检查邮箱是否存在于 temp_users, users 或 pvpgn_BNET 表中
     */
    public function checkEmailExists($email) {
        $email = trim($email);

        // 1. 检查 temp_users 表
        $stmtTemp = $this->pdo->prepare("SELECT COUNT(*) FROM temp_users WHERE acct_email = ?");
        $stmtTemp->execute([$email]);
        if ($stmtTemp->fetchColumn() > 0) {
            return true;
        }

        // 2. 检查 users 表
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM users WHERE acct_email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetchColumn() > 0) {
            return true;
        }

        // 3. 检查 PvPGN 表 (兼容不同表名大小写)
        $tables = ['pvpgn_BNET', 'BNET', 'pvpgn_bnet', 'bnet'];
        foreach ($tables as $table) {
            try {
                $stmtPvpgn = $this->pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE acct_email = ?");
                $stmtPvpgn->execute([$email]);
                if ($stmtPvpgn->fetchColumn() > 0) {
                    return true;
                }
            } catch (PDOException $e) {
                // 表不存在或查询失败，忽略
            }
        }

        return false;
    }

    /**
     * 创建临时用户 (待邮箱验证)
     */
    public function createTempUser($username, $password, $email, $phone, $salt, $verifier, $email_token, $email_expires, $encrypted_password, $register_ip) {
        $username = trim($username);
        $email = trim($email);
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
     * 更新 PvPGN 数据库中的邮箱 (acct_email)
     * 避免魔兽争霸客户端登录时弹出邮箱验证/绑定页面
     */
    public function updatePvpgnEmail($username, $email) {
        if (empty($username) || empty($email)) {
            return false;
        }

        $username = trim($username);
        $email = trim($email);

        // 兼容不同的 PvPGN 表名大小写 (Linux MySQL 区分大小写)
        $tables = ['pvpgn_BNET', 'BNET', 'pvpgn_bnet', 'bnet'];
        $updated = false;

        foreach ($tables as $table) {
            try {
                // PvPGN 中 username 通常以小写存储，acct_username 为原始大小写
                $stmt = $this->pdo->prepare("UPDATE `{$table}` SET acct_email = ? WHERE LOWER(username) = LOWER(?) OR acct_username = ?");
                $stmt->execute([$email, $username, $username]);
                if ($stmt->rowCount() > 0) {
                    error_log("[PvPGN] Successfully updated acct_email to '{$email}' for '{$username}' in table {$table}");
                    $updated = true;
                    break;
                }
            } catch (PDOException $e) {
                // 表可能不存在，继续尝试下一个表名
                continue;
            }
        }

        return $updated;
    }

    /**
     * 设置/更新用户的邮箱
     * 同时更新 users 表、pvpgn_BNET 表以及 temp_users 表
     * 
     * @param string $username 用户名
     * @param string $email 目标邮箱
     * @param bool $checkDuplicate 是否检查邮箱被其他用户占用 (默认 true)
     * @return array [success => bool, message => string, users_updated => bool, pvpgn_updated => bool]
     */
    public function setUserEmail($username, $email, $checkDuplicate = true) {
        $username = trim($username);
        $email = trim($email);

        if (empty($username)) {
            return ['success' => false, 'message' => '用户名不能为空'];
        }

        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['success' => false, 'message' => '邮箱格式不正确'];
        }

        // 1. 如果需要查重，检查该邮箱是否被其他用户占用
        if ($checkDuplicate) {
            // 检查 users 表中是否有其他用户占用此邮箱
            $stmtUser = $this->pdo->prepare("SELECT username FROM users WHERE acct_email = ? AND LOWER(username) != LOWER(?) LIMIT 1");
            $stmtUser->execute([$email, $username]);
            $existingUser = $stmtUser->fetchColumn();
            if ($existingUser) {
                return ['success' => false, 'message' => "该邮箱已被用户 '{$existingUser}' 绑定"];
            }

            // 检查 pvpgn 表中是否有其他用户占用此邮箱
            $tables = ['pvpgn_BNET', 'BNET', 'pvpgn_bnet', 'bnet'];
            foreach ($tables as $table) {
                try {
                    $stmtPv = $this->pdo->prepare("SELECT username FROM `{$table}` WHERE acct_email = ? AND LOWER(username) != LOWER(?) LIMIT 1");
                    $stmtPv->execute([$email, $username]);
                    $existingPv = $stmtPv->fetchColumn();
                    if ($existingPv) {
                        return ['success' => false, 'message' => "该邮箱已被账号 '{$existingPv}' 绑定"];
                    }
                } catch (PDOException $e) {
                    // 表不存在则跳过
                }
            }
        }

        $usersUpdated = false;
        $pvpgnUpdated = false;

        // 2. 更新 users 表
        try {
            $stmtUpdate = $this->pdo->prepare("UPDATE users SET acct_email = ?, is_email_verified = 1 WHERE LOWER(username) = LOWER(?)");
            $stmtUpdate->execute([$email, $username]);
            if ($stmtUpdate->rowCount() > 0) {
                $usersUpdated = true;
            }
        } catch (PDOException $e) {
            error_log("setUserEmail error updating users: " . $e->getMessage());
        }

        // 3. 更新 PvPGN 表 (通过 updatePvpgnEmail)
        $pvpgnUpdated = $this->updatePvpgnEmail($username, $email);

        // 4. 更新 temp_users 表（如果存在）
        try {
            $stmtTemp = $this->pdo->prepare("UPDATE temp_users SET acct_email = ? WHERE LOWER(username) = LOWER(?)");
            $stmtTemp->execute([$email, $username]);
        } catch (PDOException $e) {
            // ignore
        }

        // 5. 如果 users 表没找到该用户，但 PvPGN 表存在该用户，则执行自动同步
        if (!$usersUpdated && $pvpgnUpdated) {
            $this->syncFromPvpgn($username, $email);
            $usersUpdated = true;
        }

        if ($usersUpdated || $pvpgnUpdated) {
            return [
                'success' => true,
                'message' => '邮箱更新成功',
                'users_updated' => $usersUpdated,
                'pvpgn_updated' => $pvpgnUpdated,
                'email' => $email,
                'username' => $username
            ];
        } else {
            return [
                'success' => false,
                'message' => '未找到对应的用户账号，请确认用户名是否正确',
                'users_updated' => false,
                'pvpgn_updated' => false
            ];
        }
    }

    /**
     * 从 pvpgn_BNET 同步数据到 users 表
     */
    public function syncFromPvpgn($username, $providedEmail = null) {
        try {
            // 0. 获取当前邮箱 (优先使用传入的，否则从数据库查)
            $currentEmail = $providedEmail;
            if (empty($currentEmail)) {
                $stmtEmail = $this->pdo->prepare("SELECT acct_email FROM users WHERE username = ?");
                $stmtEmail->execute([$username]);
                $currentEmail = $stmtEmail->fetchColumn();
            }

            // 1. 如果有邮箱，先同步更新到 PvPGN 表的 acct_email，避免魔兽客户端弹窗
            if (!empty($currentEmail)) {
                $this->updatePvpgnEmail($username, $currentEmail);
            }

            // 2. 从 pvpgn_BNET (或兼容表) 获取数据，同时匹配 LOWER(username) 与 acct_username
            $tables = ['pvpgn_BNET', 'BNET', 'pvpgn_bnet', 'bnet'];
            $pvpgnData = null;
            $matchedTable = 'pvpgn_BNET';

            foreach ($tables as $table) {
                try {
                    $stmt = $this->pdo->prepare("SELECT * FROM `{$table}` WHERE LOWER(username) = LOWER(?) OR acct_username = ? LIMIT 1");
                    $stmt->execute([$username, $username]);
                    $row = $stmt->fetch();
                    if ($row) {
                        $pvpgnData = $row;
                        $matchedTable = $table;
                        break;
                    }
                } catch (PDOException $e) {
                    continue;
                }
            }

            if (!$pvpgnData) {
                error_log("Sync from PvPGN failed: User $username not found in PvPGN tables");
                return false;
            }

            // 调试日志：查看从 PvPGN 获取到的原始数据
            error_log("PvPGN Data for $username: " . json_encode([
                'uid' => $pvpgnData['uid'] ?? 'null',
                'email' => $pvpgnData['acct_email'] ?? 'null',
                'has_verifier' => !empty($pvpgnData['acct_verifier']),
                'has_salt' => !empty($pvpgnData['acct_salt'])
            ]));

            // 如果 PvPGN 中没有邮箱，但我们有，则补充更新给 PvPGN
            if (empty($pvpgnData['acct_email']) && !empty($currentEmail)) {
                try {
                    $stmtUpdatePvpgn = $this->pdo->prepare("UPDATE `{$matchedTable}` SET acct_email = ? WHERE LOWER(username) = LOWER(?) OR acct_username = ?");
                    $stmtUpdatePvpgn->execute([$currentEmail, $username, $username]);
                    $pvpgnData['acct_email'] = $currentEmail;
                    error_log("Reverse synced email $currentEmail to PvPGN table {$matchedTable} for $username");
                } catch (PDOException $e) {
                    error_log("Reverse sync email failed: " . $e->getMessage());
                }
            }

            // 2. 更新 users 表中的对应字段
            // 注意：确保 acct_email 不会被 PvPGN 的空值覆盖
            $finalEmail = !empty($pvpgnData['acct_email']) ? $pvpgnData['acct_email'] : $currentEmail;

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
                $finalEmail,
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

    /**
     * 通过用户名获取临时通知邮箱信息
     */
    public function getTempEmail($username) {
        $username = trim($username);
        $stmt = $this->pdo->prepare("SELECT username, acct_email, temp_email, is_temp_email_verified, temp_email_expires FROM users WHERE LOWER(username) = LOWER(?)");
        $stmt->execute([$username]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            // 如果 users 表没找到，尝试从 PvPGN 同步一次
            $this->syncFromPvpgn($username);
            $stmt->execute([$username]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if (!$row) {
            return null;
        }

        return [
            'username' => $row['username'],
            'registered_email' => $row['acct_email'] ?? '',
            'temp_email' => $row['temp_email'] ?? '',
            'is_temp_email_verified' => (int)($row['is_temp_email_verified'] ?? 0) === 1,
            'is_expired' => !empty($row['temp_email_expires']) && (strtotime($row['temp_email_expires']) < time())
        ];
    }

    /**
     * 测试账号一键绑定注册邮箱 + 临时邮箱
     * @param string $username
     * @param string $email 默认测试邮箱
     * @param bool $autoVerify 临时邮箱是否直接激活（跳过邮件点击）
     */
    public function bindTestAccountEmail($username, $email = '461079075@qq.com', $autoVerify = true) {
        $username = trim($username);
        $email = trim($email);
        if ($email === '') {
            $email = '461079075@qq.com';
        }

        // 注册邮箱：允许测试账号共享同一邮箱，不做排他查重
        $reg = $this->setUserEmail($username, $email, false);
        if (!$reg['success']) {
            // 若 users 尚无该账号，尝试从 PvPGN 同步后再写一次
            $this->syncFromPvpgn($username, $email);
            $reg = $this->setUserEmail($username, $email, false);
            if (!$reg['success']) {
                return $reg;
            }
        }

        $token = null;
        $tempVerified = false;

        if ($autoVerify) {
            // 直接写入临时邮箱并标记已激活
            try {
                $stmtCheck = $this->pdo->prepare("SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER(?)");
                $stmtCheck->execute([$username]);
                if ((int)$stmtCheck->fetchColumn() === 0) {
                    $this->syncFromPvpgn($username, $email);
                }
                $stmt = $this->pdo->prepare("UPDATE users SET
                    temp_email = ?,
                    is_temp_email_verified = 1,
                    temp_email_token = NULL,
                    temp_email_expires = NULL
                    WHERE LOWER(username) = LOWER(?)");
                $stmt->execute([$email, $username]);
                $tempVerified = true;
            } catch (PDOException $e) {
                error_log('bindTestAccountEmail autoVerify error: ' . $e->getMessage());
                return [
                    'success' => false,
                    'message' => '临时邮箱自动激活失败: ' . $e->getMessage()
                ];
            }
        } else {
            $temp = $this->setTempEmail($username, $email);
            if (!$temp['success']) {
                return $temp;
            }
            $token = $temp['token'] ?? null;
        }

        return [
            'success' => true,
            'username' => $username,
            'email' => $email,
            'users_updated' => $reg['users_updated'] ?? false,
            'pvpgn_updated' => $reg['pvpgn_updated'] ?? false,
            'temp_verified' => $tempVerified,
            'token' => $token,
            'message' => '测试账号邮箱绑定成功'
        ];
    }

    /**
     * 设置/更新用户的临时通知邮箱 (允许重复，不作唯一性排他查重)
     * 生成验证 Token 并记录过期时间
     */
    public function setTempEmail($username, $email) {
        $username = trim($username);
        $email = trim($email);

        if (empty($username)) {
            return ['success' => false, 'message' => '用户名不能为空'];
        }

        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['success' => false, 'message' => '临时邮箱格式不正确'];
        }

        // 确保 users 表中存在该用户
        $stmtCheck = $this->pdo->prepare("SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER(?)");
        $stmtCheck->execute([$username]);
        if ($stmtCheck->fetchColumn() == 0) {
            $this->syncFromPvpgn($username);
        }

        // 生成 64 位随机 Token 与 24 小时过期时间
        $token = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', time() + 86400);

        try {
            $stmt = $this->pdo->prepare("UPDATE users SET 
                temp_email = ?, 
                is_temp_email_verified = 0, 
                temp_email_token = ?, 
                temp_email_expires = ? 
                WHERE LOWER(username) = LOWER(?)");
            $stmt->execute([$email, $token, $expires, $username]);

            return [
                'success' => true,
                'username' => $username,
                'temp_email' => $email,
                'token' => $token,
                'expires' => $expires,
                'message' => '临时邮箱更新成功'
            ];
        } catch (PDOException $e) {
            error_log("setTempEmail database error: " . $e->getMessage());
            return ['success' => false, 'message' => '数据库更新失败: ' . $e->getMessage()];
        }
    }

    /**
     * 根据 Token 验证并激活临时邮箱
     */
    public function verifyTempEmailToken($token) {
        $stmt = $this->pdo->prepare("SELECT username, temp_email, temp_email_expires, is_temp_email_verified FROM users WHERE temp_email_token = ?");
        $stmt->execute([$token]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            return ['success' => false, 'message' => '无效或已失效的验证链接'];
        }

        if (!empty($user['temp_email_expires']) && strtotime($user['temp_email_expires']) < time()) {
            return ['success' => false, 'message' => '激活链接已过期，请在客户端重新申请发送激活邮件'];
        }

        // 标记为已激活
        $updateStmt = $this->pdo->prepare("UPDATE users SET is_temp_email_verified = 1, temp_email_token = NULL, temp_email_expires = NULL WHERE temp_email_token = ?");
        $updateStmt->execute([$token]);

        return [
            'success' => true,
            'username' => $user['username'],
            'temp_email' => $user['temp_email'],
            'message' => '临时邮箱激活成功'
        ];
    }

    // ======================== 好友系统 / API Session ========================

    /** 创建 API 会话，返回 token */
    public function createApiSession($username, $source = 'launcher', $ttlHours = 168) {
        $username = trim($username);
        $token = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', time() + max(1, (int)$ttlHours) * 3600);
        $stmt = $this->pdo->prepare("INSERT INTO api_sessions (token, username, source, expires_at) VALUES (?, ?, ?, ?)");
        $stmt->execute([$token, $username, $source, $expires]);
        return ['token' => $token, 'expires_at' => $expires];
    }

    /** 校验 token，成功返回 username，失败返回 null */
    public function validateApiSession($token) {
        $token = trim((string)$token);
        if ($token === '' || strlen($token) < 32) {
            return null;
        }
        $stmt = $this->pdo->prepare("SELECT username, expires_at FROM api_sessions WHERE token = ? LIMIT 1");
        $stmt->execute([$token]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        if (strtotime($row['expires_at']) < time()) {
            $del = $this->pdo->prepare("DELETE FROM api_sessions WHERE token = ?");
            $del->execute([$token]);
            return null;
        }
        return $row['username'];
    }

    public function deleteApiSession($token) {
        $stmt = $this->pdo->prepare("DELETE FROM api_sessions WHERE token = ?");
        return $stmt->execute([trim((string)$token)]);
    }

    /** 好友列表（status=1），附带对方在线状态 */
    public function listFriends($username) {
        $sql = "SELECT f.friend_id, f.remark, u.nickname, u.avatar_url, u.status,
                       COALESCE(u.status, 0) AS user_status,
                       COALESCE(u.current_room, '') AS current_room,
                       COALESCE(u.current_host, '') AS current_host
                FROM friendships f
                LEFT JOIN users u ON u.username = f.friend_id
                WHERE f.user_id = ? AND f.status = 1
                ORDER BY (COALESCE(u.status, 0) > 0) DESC, f.friend_id ASC";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([$username]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $friends = [];
        foreach ($rows as $row) {
            $st = (int)($row['user_status'] ?? 0);
            // 超时兜底：status>0 但很久没活动可在后续加 heartbeat；此处仅按库值展示
            $friends[] = [
                'id' => $row['friend_id'],
                'name' => $row['friend_id'],
                'nickname' => $row['nickname'] ?? '',
                'avatar' => $row['avatar_url'] ?? '',
                'remark' => $row['remark'] ?? '',
                'online' => $st >= 1,
                'status' => $st,
                'room' => ($st >= 2 && $st !== 3) ? ($row['current_room'] ?? '') : '',
                'host' => ($st >= 2 && $st !== 3) ? ($row['current_host'] ?? '') : ''
            ];
        }
        return $friends;
    }

    public function createFriendInvite($inviter, $invitee, $roomName, $hostName = '', $ttlSec = 120) {
        $inviter = trim($inviter);
        $invitee = trim($invitee);
        $roomName = trim($roomName);
        $hostName = trim($hostName);
        if ($inviter === '' || $invitee === '' || $roomName === '') {
            return ['success' => false, 'error_code' => 'ERR_MISSING_FIELDS', 'message' => '邀请参数不完整'];
        }
        if (!$this->areFriends($inviter, $invitee)) {
            return ['success' => false, 'error_code' => 'ERR_NOT_FRIENDS', 'message' => '只能邀请好友'];
        }
        // 清理过期邀请
        $this->pdo->prepare("DELETE FROM friend_invites WHERE expires_at < NOW()")->execute();
        // 限制频率：同一对 30 秒内不重复
        $chk = $this->pdo->prepare(
            "SELECT COUNT(*) FROM friend_invites
             WHERE inviter = ? AND invitee = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 SECOND)"
        );
        $chk->execute([$inviter, $invitee]);
        if ((int)$chk->fetchColumn() > 0) {
            return ['success' => false, 'error_code' => 'ERR_TOO_MANY_REQUESTS', 'message' => '邀请发送过于频繁'];
        }
        $expires = date('Y-m-d H:i:s', time() + max(30, (int)$ttlSec));
        $ins = $this->pdo->prepare(
            "INSERT INTO friend_invites (inviter, invitee, room_name, host_name, expires_at)
             VALUES (?, ?, ?, ?, ?)"
        );
        $ins->execute([$inviter, $invitee, $roomName, $hostName, $expires]);
        return [
            'success' => true,
            'error_code' => 'SUCCESS',
            'message' => '邀请已发送',
            'data' => [
                'id' => (int)$this->pdo->lastInsertId(),
                'room' => $roomName,
                'host' => $hostName,
                'expires_at' => $expires
            ]
        ];
    }

    public function listFriendInvites($username) {
        $this->pdo->prepare("DELETE FROM friend_invites WHERE expires_at < NOW()")->execute();
        $stmt = $this->pdo->prepare(
            "SELECT id, inviter, room_name, host_name, created_at, expires_at
             FROM friend_invites
             WHERE invitee = ? AND expires_at >= NOW()
             ORDER BY created_at DESC LIMIT 20"
        );
        $stmt->execute([$username]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $list = [];
        foreach ($rows as $r) {
            $list[] = [
                'id' => (int)$r['id'],
                'from' => $r['inviter'],
                'name' => $r['inviter'],
                'room' => $r['room_name'],
                'host' => $r['host_name'] ?? '',
                'expires_at' => $r['expires_at']
            ];
        }
        return $list;
    }

    public function consumeFriendInvite($username, $inviteId) {
        $stmt = $this->pdo->prepare(
            "SELECT id, inviter, room_name, host_name FROM friend_invites
             WHERE id = ? AND invitee = ? AND expires_at >= NOW() LIMIT 1"
        );
        $stmt->execute([(int)$inviteId, $username]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return ['success' => false, 'error_code' => 'ERR_NO_INVITE', 'message' => '邀请不存在或已过期'];
        }
        $del = $this->pdo->prepare("DELETE FROM friend_invites WHERE id = ?");
        $del->execute([(int)$inviteId]);
        return [
            'success' => true,
            'data' => [
                'from' => $row['inviter'],
                'room' => $row['room_name'],
                'host' => $row['host_name'] ?? ''
            ]
        ];
    }

    public function countIncomingFriendRequests($username) {
        $stmt = $this->pdo->prepare(
            "SELECT COUNT(*) FROM friendships
             WHERE friend_id = ? AND status = 0 AND initiated_by <> ?"
        );
        $stmt->execute([$username, $username]);
        return (int)$stmt->fetchColumn();
    }

    public function listIncomingFriendRequests($username) {
        $sql = "SELECT f.user_id, f.initiated_by, f.created_at, u.nickname, u.avatar_url, u.status
                FROM friendships f
                LEFT JOIN users u ON u.username = f.user_id
                WHERE f.friend_id = ? AND f.status = 0 AND f.initiated_by <> ?
                ORDER BY f.created_at DESC";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([$username, $username]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $list = [];
        foreach ($rows as $row) {
            $st = (int)($row['status'] ?? 0);
            $list[] = [
                'id' => $row['user_id'],
                'name' => $row['user_id'],
                'nickname' => $row['nickname'] ?? '',
                'avatar' => $row['avatar_url'] ?? '',
                'online' => $st >= 1,
                'status' => $st,
                'created_at' => $row['created_at']
            ];
        }
        return $list;
    }

    /** 搜索用户（排除自己）；附带与自己的关系摘要 */
    public function searchUsersForFriend($username, $keyword, $limit = 20) {
        $keyword = trim($keyword);
        if ($keyword === '') {
            return [];
        }
        $limit = max(1, min(50, (int)$limit));
        $like = '%' . $keyword . '%';
        $sql = "SELECT u.username, u.nickname, u.avatar_url, u.status
                FROM users u
                WHERE LOWER(u.username) LIKE LOWER(?)
                  AND LOWER(u.username) <> LOWER(?)
                  AND (u.deleted_time IS NULL)
                ORDER BY u.username ASC
                LIMIT {$limit}";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([$like, $username]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $result = [];
        foreach ($rows as $row) {
            $other = $row['username'];
            $rel = $this->getFriendshipRelation($username, $other);
            // 被对方拉黑时不出现在搜索结果
            if ($rel['blocked_by_them']) {
                continue;
            }
            $st = (int)($row['status'] ?? 0);
            $result[] = [
                'id' => $other,
                'name' => $other,
                'nickname' => $row['nickname'] ?? '',
                'avatar' => $row['avatar_url'] ?? '',
                'online' => $st >= 1,
                'status' => $st,
                'relation' => $rel['label'], // none | pending_out | pending_in | friends | blocked
                'can_add' => ($rel['label'] === 'none')
            ];
        }
        return $result;
    }

    public function getFriendshipRelation($me, $other) {
        $stmt = $this->pdo->prepare(
            "SELECT user_id, friend_id, status, initiated_by FROM friendships
             WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)"
        );
        $stmt->execute([$me, $other, $other, $me]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $blockedByMe = false;
        $blockedByThem = false;
        $friends = false;
        $pendingOut = false;
        $pendingIn = false;

        foreach ($rows as $r) {
            $st = (int)$r['status'];
            if ($st === 2) {
                if (strcasecmp($r['user_id'], $me) === 0) $blockedByMe = true;
                if (strcasecmp($r['user_id'], $other) === 0) $blockedByThem = true;
            } elseif ($st === 1) {
                $friends = true;
            } elseif ($st === 0) {
                if (strcasecmp($r['initiated_by'], $me) === 0) $pendingOut = true;
                else $pendingIn = true;
            }
        }

        $label = 'none';
        if ($blockedByMe) $label = 'blocked';
        elseif ($friends) $label = 'friends';
        elseif ($pendingOut) $label = 'pending_out';
        elseif ($pendingIn) $label = 'pending_in';

        return [
            'label' => $label,
            'blocked_by_me' => $blockedByMe,
            'blocked_by_them' => $blockedByThem,
            'friends' => $friends,
            'pending_out' => $pendingOut,
            'pending_in' => $pendingIn
        ];
    }

    public function sendFriendRequest($from, $to) {
        $from = trim($from);
        $to = trim($to);
        if ($from === '' || $to === '' || strcasecmp($from, $to) === 0) {
            return ['success' => false, 'error_code' => 'ERR_INVALID_TARGET', 'message' => '无效的目标用户'];
        }
        // 解析为目标库中的规范用户名（大小写不敏感）
        $stmtCanon = $this->pdo->prepare("SELECT username FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1");
        $stmtCanon->execute([$to]);
        $canon = $stmtCanon->fetchColumn();
        if (!$canon) {
            return ['success' => false, 'error_code' => 'ERR_USER_NOT_FOUND', 'message' => '用户不存在'];
        }
        $to = $canon;

        $rel = $this->getFriendshipRelation($from, $to);
        if ($rel['blocked_by_them'] || $rel['blocked_by_me']) {
            return ['success' => false, 'error_code' => 'ERR_BLOCKED', 'message' => '无法添加该用户'];
        }
        if ($rel['friends']) {
            return ['success' => false, 'error_code' => 'ERR_ALREADY_FRIENDS', 'message' => '你们已经是好友'];
        }
        if ($rel['pending_out']) {
            return ['success' => false, 'error_code' => 'ERR_PENDING', 'message' => '已发送过申请，请等待对方处理'];
        }
        if ($rel['pending_in']) {
            // 对方已向我申请：直接同意
            return $this->respondFriendRequest($from, $to, true);
        }

        try {
            $stmt = $this->pdo->prepare(
                "INSERT INTO friendships (user_id, friend_id, status, initiated_by)
                 VALUES (?, ?, 0, ?)
                 ON DUPLICATE KEY UPDATE status = 0, initiated_by = VALUES(initiated_by), updated_at = CURRENT_TIMESTAMP"
            );
            $stmt->execute([$from, $to, $from]);
            return ['success' => true, 'error_code' => 'SUCCESS', 'message' => '好友申请已发送'];
        } catch (PDOException $e) {
            error_log('sendFriendRequest: ' . $e->getMessage());
            return ['success' => false, 'error_code' => 'ERR_SYSTEM_ERROR', 'message' => '发送申请失败'];
        }
    }

    public function respondFriendRequest($me, $fromUser, $accept) {
        $me = trim($me);
        $fromUser = trim($fromUser);

        $stmt = $this->pdo->prepare(
            "SELECT status, initiated_by FROM friendships
             WHERE user_id = ? AND friend_id = ? AND status = 0 LIMIT 1"
        );
        $stmt->execute([$fromUser, $me]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return ['success' => false, 'error_code' => 'ERR_NO_REQUEST', 'message' => '没有待处理的好友申请'];
        }

        try {
            $this->pdo->beginTransaction();
            if ($accept) {
                // 双向好友
                $up = $this->pdo->prepare(
                    "INSERT INTO friendships (user_id, friend_id, status, initiated_by)
                     VALUES (?, ?, 1, ?)
                     ON DUPLICATE KEY UPDATE status = 1, initiated_by = VALUES(initiated_by), updated_at = CURRENT_TIMESTAMP"
                );
                $up->execute([$fromUser, $me, $fromUser]);
                $up->execute([$me, $fromUser, $fromUser]);
                $this->pdo->commit();
                return ['success' => true, 'error_code' => 'SUCCESS', 'message' => '已添加好友'];
            } else {
                $up = $this->pdo->prepare(
                    "UPDATE friendships SET status = 3, updated_at = CURRENT_TIMESTAMP
                     WHERE user_id = ? AND friend_id = ? AND status = 0"
                );
                $up->execute([$fromUser, $me]);
                $this->pdo->commit();
                return ['success' => true, 'error_code' => 'SUCCESS', 'message' => '已拒绝申请'];
            }
        } catch (PDOException $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            error_log('respondFriendRequest: ' . $e->getMessage());
            return ['success' => false, 'error_code' => 'ERR_SYSTEM_ERROR', 'message' => '处理申请失败'];
        }
    }

    public function removeFriend($me, $other) {
        $me = trim($me);
        $other = trim($other);
        try {
            $stmt = $this->pdo->prepare(
                "DELETE FROM friendships
                 WHERE status = 1 AND (
                    (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
                 )"
            );
            $stmt->execute([$me, $other, $other, $me]);
            if ($stmt->rowCount() === 0) {
                return ['success' => false, 'error_code' => 'ERR_NOT_FRIENDS', 'message' => '对方不是你的好友'];
            }
            return ['success' => true, 'error_code' => 'SUCCESS', 'message' => '已删除好友'];
        } catch (PDOException $e) {
            error_log('removeFriend: ' . $e->getMessage());
            return ['success' => false, 'error_code' => 'ERR_SYSTEM_ERROR', 'message' => '删除失败'];
        }
    }

    public function blockUser($me, $other, $block = true) {
        $me = trim($me);
        $other = trim($other);
        if (!$this->userExists($other)) {
            return ['success' => false, 'error_code' => 'ERR_USER_NOT_FOUND', 'message' => '用户不存在'];
        }
        try {
            if ($block) {
                // 清除对方指向我的关系，并写黑名单
                $del = $this->pdo->prepare(
                    "DELETE FROM friendships WHERE
                     (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)"
                );
                $del->execute([$me, $other, $other, $me]);
                $ins = $this->pdo->prepare(
                    "INSERT INTO friendships (user_id, friend_id, status, initiated_by)
                     VALUES (?, ?, 2, ?)
                     ON DUPLICATE KEY UPDATE status = 2, updated_at = CURRENT_TIMESTAMP"
                );
                $ins->execute([$me, $other, $me]);
                return ['success' => true, 'error_code' => 'SUCCESS', 'message' => '已拉黑'];
            } else {
                $del = $this->pdo->prepare(
                    "DELETE FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 2"
                );
                $del->execute([$me, $other]);
                return ['success' => true, 'error_code' => 'SUCCESS', 'message' => '已取消拉黑'];
            }
        } catch (PDOException $e) {
            error_log('blockUser: ' . $e->getMessage());
            return ['success' => false, 'error_code' => 'ERR_SYSTEM_ERROR', 'message' => '操作失败'];
        }
    }

    public function areFriends($a, $b) {
        $stmt = $this->pdo->prepare(
            "SELECT COUNT(*) FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 1"
        );
        $stmt->execute([$a, $b]);
        return (int)$stmt->fetchColumn() > 0;
    }

    public function getFriendChatHistory($me, $other, $limit = 50, $beforeId = 0) {
        if (!$this->areFriends($me, $other)) {
            return ['success' => false, 'error_code' => 'ERR_NOT_FRIENDS', 'message' => '仅好友可查看私聊'];
        }
        $limit = max(1, min(100, (int)$limit));
        if ($beforeId > 0) {
            $stmt = $this->pdo->prepare(
                "SELECT id, sender, receiver, message, is_read, sent_at FROM friend_messages
                 WHERE ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?))
                   AND id < ?
                 ORDER BY id DESC LIMIT {$limit}"
            );
            $stmt->execute([$me, $other, $other, $me, $beforeId]);
        } else {
            $stmt = $this->pdo->prepare(
                "SELECT id, sender, receiver, message, is_read, sent_at FROM friend_messages
                 WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
                 ORDER BY id DESC LIMIT {$limit}"
            );
            $stmt->execute([$me, $other, $other, $me]);
        }
        $rows = array_reverse($stmt->fetchAll(PDO::FETCH_ASSOC));

        // 标记已读
        $mark = $this->pdo->prepare(
            "UPDATE friend_messages SET is_read = 1
             WHERE sender = ? AND receiver = ? AND is_read = 0"
        );
        $mark->execute([$other, $me]);

        $messages = [];
        foreach ($rows as $r) {
            $messages[] = [
                'id' => (int)$r['id'],
                'sender' => $r['sender'],
                'receiver' => $r['receiver'],
                'message' => $r['message'],
                'is_mine' => strcasecmp($r['sender'], $me) === 0,
                'sent_at' => $r['sent_at']
            ];
        }
        return ['success' => true, 'data' => ['messages' => $messages]];
    }

    public function sendFriendChatMessage($me, $other, $message) {
        $message = trim($message);
        if ($message === '') {
            return ['success' => false, 'error_code' => 'ERR_EMPTY_MESSAGE', 'message' => '消息不能为空'];
        }
        if (mb_strlen($message) > 1000) {
            return ['success' => false, 'error_code' => 'ERR_MESSAGE_TOO_LONG', 'message' => '消息过长'];
        }
        if (!$this->areFriends($me, $other)) {
            return ['success' => false, 'error_code' => 'ERR_NOT_FRIENDS', 'message' => '仅好友可私聊'];
        }
        $stmt = $this->pdo->prepare(
            "INSERT INTO friend_messages (sender, receiver, message) VALUES (?, ?, ?)"
        );
        $stmt->execute([$me, $other, $message]);
        $id = (int)$this->pdo->lastInsertId();
        return [
            'success' => true,
            'data' => [
                'id' => $id,
                'sender' => $me,
                'receiver' => $other,
                'message' => $message,
                'is_mine' => true,
                'sent_at' => date('Y-m-d H:i:s')
            ]
        ];
    }
}
