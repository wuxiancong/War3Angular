-- Dota1 天梯积分系统核心表 (与 War3Bot DbManager / 设计白皮书对齐)
-- 数据库建议: MySQL 8.0 / pvpgn

CREATE TABLE IF NOT EXISTS ladder_stats (
  userName VARCHAR(32) PRIMARY KEY,
  rank_level TINYINT DEFAULT 0 COMMENT '0:- 1:D 2:C 3:B 4:A 5:S 6:SS 7:SSS',
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
  total_play_time_mins INT DEFAULT 0 COMMENT '游戏总时长(分钟)',
  INDEX idx_score (score),
  INDEX idx_rank_level (rank_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS matches (
  match_id BIGINT PRIMARY KEY,
  map_name VARCHAR(128),
  game_mode VARCHAR(32) COMMENT '如: ap, rd, cm',
  winner_team TINYINT COMMENT '1: 近卫, 2: 天灾',
  start_time DATETIME,
  duration_seconds INT COMMENT '比赛时长(秒)',
  match_type TINYINT COMMENT '1: 天梯积分赛, 2: 普通练习赛',
  INDEX idx_start_time (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS match_results (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  match_id BIGINT NOT NULL,
  userName VARCHAR(32) NOT NULL,
  team_id TINYINT COMMENT '1:近卫, 2:天灾',
  is_winner BOOLEAN,
  hero_name VARCHAR(64),
  hero_level TINYINT DEFAULT 1,
  kills INT DEFAULT 0,
  deaths INT DEFAULT 0,
  assists INT DEFAULT 0,
  last_hits INT DEFAULT 0 COMMENT '正补',
  denies INT DEFAULT 0 COMMENT '反补',
  gold_earned INT DEFAULT 0,
  xp_earned INT DEFAULT 0,
  hero_damage INT DEFAULT 0,
  tower_damage INT DEFAULT 0,
  damage_taken INT DEFAULT 0,
  hero_healing INT DEFAULT 0,
  wards_placed INT DEFAULT 0,
  courier_kills INT DEFAULT 0,
  apm INT DEFAULT 0,
  is_mvp BOOLEAN DEFAULT FALSE,
  score_point DECIMAL(5,2) DEFAULT 0.00 COMMENT '系统表现分',
  UNIQUE KEY uk_match_user (match_id, userName),
  INDEX idx_user (userName),
  CONSTRAINT fk_match_results_match FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
