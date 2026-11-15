-- Dota1 反外挂系统数据库扩展与审计表 (MySQL 8.0+)
-- 依赖基础表：ladder_schema.sql (ladder_stats, matches, match_results)

-- 1. 扩展天梯基础表：增加反作弊状态、单局分值变动与信誉分
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS ac_status ENUM('PENDING','CLEAN','SUSPECT','CHEAT','FROZEN') NOT NULL DEFAULT 'PENDING' COMMENT '反作弊审计状态';

ALTER TABLE match_results
  ADD COLUMN IF NOT EXISTS delta_score INT NOT NULL DEFAULT 0 COMMENT '本局积分变动(用于判挂精准回滚与受害者补偿)';

ALTER TABLE ladder_stats
  ADD COLUMN IF NOT EXISTS trust_score TINYINT NOT NULL DEFAULT 60 COMMENT '匹配信誉分(0~100)';

-- 2. 设备指纹表（仅存加盐哈希，不存原始硬件信息）
CREATE TABLE IF NOT EXISTS ac_devices (
  hwid_hash  CHAR(64) PRIMARY KEY,
  first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  banned     TINYINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 账号-设备关联图谱表
CREATE TABLE IF NOT EXISTS ac_account_devices (
  user_name VARCHAR(32) NOT NULL,
  hwid_hash CHAR(64) NOT NULL,
  last_ip   VARBINARY(16) NULL,
  last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_name, hwid_hash),
  INDEX idx_hwid (hwid_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. 实时/离线检测命中表（L1~L5 证据沉淀）
CREATE TABLE IF NOT EXISTS ac_detections (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  match_id     BIGINT NOT NULL,
  user_name    VARCHAR(32) NOT NULL,
  layer        TINYINT NOT NULL COMMENT '1:客户端 2:主机实时 3:回放审计 4:统计风控 5:关联图谱',
  rule_code    VARCHAR(32) NOT NULL,
  severity     TINYINT NOT NULL DEFAULT 0 COMMENT '0:弱 1:中 2:强',
  score        FLOAT NOT NULL DEFAULT 0,
  game_time_ms INT NOT NULL DEFAULT 0,
  hit_count    INT NOT NULL DEFAULT 1,
  evidence     JSON NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ac_det_user (user_name),
  INDEX idx_ac_det_match (match_id),
  INDEX idx_ac_det_rule (rule_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. 人工复核案件表
CREATE TABLE IF NOT EXISTS ac_cases (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  match_id   BIGINT NOT NULL,
  user_name  VARCHAR(32) NOT NULL,
  risk_score FLOAT NOT NULL DEFAULT 0,
  status     ENUM('OPEN','REVIEWING','CHEAT','CLEAN','APPEALED') NOT NULL DEFAULT 'OPEN',
  verdict_by VARCHAR(32) NULL,
  verdict_at DATETIME NULL,
  note       VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_case_match_user (match_id, user_name),
  INDEX idx_case_status (status, risk_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. 判决幂等流水表（防止 /api/ac/verdict 重复执行导致多次回滚/补偿）
CREATE TABLE IF NOT EXISTS ac_verdicts (
  verdict_id VARCHAR(64) PRIMARY KEY,
  match_id   BIGINT NOT NULL,
  status     ENUM('CHEAT','CLEAN') NOT NULL,
  operator   VARCHAR(32) NOT NULL,
  reason     VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_verdict_match (match_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. 封禁记录表（支持账号/HWID/关联簇三个粒度）
CREATE TABLE IF NOT EXISTS ac_bans (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  target_type ENUM('ACCOUNT','HWID','CLUSTER') NOT NULL,
  target      VARCHAR(64) NOT NULL,
  reason      VARCHAR(128) NOT NULL,
  expires_at  DATETIME NULL COMMENT 'NULL 表示永久封禁',
  case_id     BIGINT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ban_target (target_type, target)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

