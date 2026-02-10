-- BrokenPromise MySQL Database Schema
-- Serves the soul: Learning data for misdiagnosis prevention, patterns, compliance tracking

-- Use existing database (from .env)
-- CREATE DATABASE IF NOT EXISTS brokenpromise;
-- USE brokenpromise;

-- 1. Core State Table
CREATE TABLE IF NOT EXISTS `state` (
    `path` VARCHAR(500) PRIMARY KEY,
    `value` TEXT NOT NULL,
    `updated_at` BIGINT NOT NULL,
    INDEX `idx_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Learning: Fix Attempts (Serves the Soul)
CREATE TABLE IF NOT EXISTS `learning_fix_attempts` (
    `id` VARCHAR(255) PRIMARY KEY,
    `issue_id` VARCHAR(255),
    `issue_type` VARCHAR(255),
    `fix_method` VARCHAR(255),
    `result` VARCHAR(50),
    `time_spent` INT,
    `misdiagnosis` TEXT,
    `correct_approach` TEXT,
    `wrong_approach` TEXT,
    `actual_root_cause` TEXT,
    `timestamp` BIGINT NOT NULL,
    `component` VARCHAR(255),
    `details` TEXT,
    INDEX `idx_issue_type` (`issue_type`),
    INDEX `idx_fix_method` (`fix_method`),
    INDEX `idx_result` (`result`),
    INDEX `idx_timestamp` (`timestamp`),
    INDEX `idx_component` (`component`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Learning: Misdiagnosis Patterns (Serves the Soul - CORE)
CREATE TABLE IF NOT EXISTS `learning_misdiagnosis_patterns` (
    `pattern_key` VARCHAR(255) PRIMARY KEY,
    `symptom` VARCHAR(500),
    `common_misdiagnosis` TEXT,
    `actual_root_cause` TEXT,
    `correct_approach` TEXT,
    `frequency` INT DEFAULT 0,
    `time_wasted` BIGINT DEFAULT 0,
    `success_rate` DECIMAL(5,4) DEFAULT 0,
    `successes` INT DEFAULT 0,
    `failures` INT DEFAULT 0,
    `component` VARCHAR(255),
    `issue_type` VARCHAR(255),
    `last_updated` BIGINT,
    INDEX `idx_symptom` (`symptom`(255)),
    INDEX `idx_issue_type` (`issue_type`),
    INDEX `idx_component` (`component`),
    INDEX `idx_frequency` (`frequency`),
    INDEX `idx_time_wasted` (`time_wasted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Learning: Solution Patterns (Serves the Soul - Enhanced for Misdiagnosis Prevention)
CREATE TABLE IF NOT EXISTS `learning_patterns` (
    `pattern_key` VARCHAR(255) PRIMARY KEY,
    `issue_type` VARCHAR(255),
    `solution_method` VARCHAR(255),
    `misdiagnosis_method` VARCHAR(255),
    `success_rate` DECIMAL(5,4) DEFAULT 0,
    `frequency` INT DEFAULT 0,
    `time_saved` BIGINT DEFAULT 0,
    `time_wasted` BIGINT DEFAULT 0,
    `contexts` TEXT,
    `solutions` TEXT,
    `details` TEXT,
    `last_updated` BIGINT,
    INDEX `idx_issue_type` (`issue_type`),
    INDEX `idx_solution_method` (`solution_method`),
    INDEX `idx_misdiagnosis_method` (`misdiagnosis_method`),
    INDEX `idx_success_rate` (`success_rate`),
    INDEX `idx_frequency` (`frequency`),
    INDEX `idx_time_wasted` (`time_wasted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Learning: Compliance Tracking (Serves the Soul)
CREATE TABLE IF NOT EXISTS `learning_compliance` (
    `id` VARCHAR(255) PRIMARY KEY,
    `prompt_id` VARCHAR(255),
    `compliant` TINYINT(1) DEFAULT 0,
    `compliance_result` VARCHAR(50),
    `parts_worked` TEXT,
    `parts_skipped` TEXT,
    `timestamp` BIGINT NOT NULL,
    `details` TEXT,
    INDEX `idx_prompt_id` (`prompt_id`),
    INDEX `idx_compliant` (`compliant`),
    INDEX `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. State Changes (Replaces EventLog - On-Demand Generation)
CREATE TABLE IF NOT EXISTS `state_changes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `path` VARCHAR(500),
    `old_value_hash` VARCHAR(64),
    `new_value_hash` VARCHAR(64),
    `timestamp` BIGINT NOT NULL,
    `correlated_issue_id` VARCHAR(255),
    `metadata` TEXT,
    INDEX `idx_path` (`path`(255)),
    INDEX `idx_timestamp` (`timestamp`),
    INDEX `idx_correlated_issue` (`correlated_issue_id`),
    INDEX `idx_path_timestamp` (`path`(255), `timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Learning: Failed Methods (What NOT to Do)
CREATE TABLE IF NOT EXISTS `learning_failed_methods` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `issue_type` VARCHAR(255),
    `method` VARCHAR(255),
    `frequency` INT DEFAULT 0,
    `time_wasted` BIGINT DEFAULT 0,
    `last_attempt` BIGINT,
    UNIQUE KEY `unique_issue_method` (`issue_type`, `method`),
    INDEX `idx_issue_type` (`issue_type`),
    INDEX `idx_method` (`method`),
    INDEX `idx_frequency` (`frequency`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Learning: Knowledge Base (Web Search Findings, etc.)
CREATE TABLE IF NOT EXISTS `learning_knowledge` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `type` VARCHAR(50),
    `topic` VARCHAR(255),
    `content` TEXT,
    `source` VARCHAR(255),
    `timestamp` BIGINT NOT NULL,
    `useful` TINYINT(1) DEFAULT 1,
    INDEX `idx_type` (`type`),
    INDEX `idx_topic` (`topic`),
    INDEX `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Learning: Solution Templates
CREATE TABLE IF NOT EXISTS `learning_solution_templates` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `template_key` VARCHAR(255),
    `issue_type` VARCHAR(255),
    `template_code` TEXT,
    `success_rate` DECIMAL(5,4) DEFAULT 0,
    `usage_count` INT DEFAULT 0,
    `last_used` BIGINT,
    UNIQUE KEY `unique_template` (`template_key`),
    INDEX `idx_issue_type` (`issue_type`),
    INDEX `idx_success_rate` (`success_rate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. Log Processing: Processed Logs
CREATE TABLE IF NOT EXISTS `log_processed` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `source` VARCHAR(50),
    `level` VARCHAR(20),
    `message` TEXT,
    `timestamp` BIGINT NOT NULL,
    `file_path` VARCHAR(500),
    `line_number` INT,
    `metadata` TEXT,
    INDEX `idx_source` (`source`),
    INDEX `idx_timestamp` (`timestamp`),
    INDEX `idx_level` (`level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. Log Processing: Patterns
CREATE TABLE IF NOT EXISTS `log_patterns` (
    `pattern_key` VARCHAR(255) PRIMARY KEY,
    `pattern` VARCHAR(500),
    `source` VARCHAR(50),
    `frequency` INT DEFAULT 0,
    `last_seen` BIGINT,
    `details` TEXT,
    INDEX `idx_source` (`source`),
    INDEX `idx_frequency` (`frequency`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. Log Processing: Stats
CREATE TABLE IF NOT EXISTS `log_processing_stats` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `stat_key` VARCHAR(255) UNIQUE,
    `stat_value` BIGINT DEFAULT 0,
    `last_updated` BIGINT,
    INDEX `idx_stat_key` (`stat_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. AI Actions: Action History
CREATE TABLE IF NOT EXISTS `ai_actions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `action_type` VARCHAR(100),
    `issue_type` VARCHAR(255),
    `component` VARCHAR(255),
    `file` VARCHAR(500),
    `details` TEXT,
    `timestamp` BIGINT NOT NULL,
    INDEX `idx_action_type` (`action_type`),
    INDEX `idx_issue_type` (`issue_type`),
    INDEX `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. AI Collaboration: Decisions
CREATE TABLE IF NOT EXISTS `ai_decisions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `decision_type` VARCHAR(100),
    `decision_data` TEXT,
    `outcome` VARCHAR(50),
    `timestamp` BIGINT NOT NULL,
    INDEX `idx_decision_type` (`decision_type`),
    INDEX `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15. AI Collaboration: Shared Knowledge
CREATE TABLE IF NOT EXISTS `ai_shared_knowledge` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `knowledge_type` VARCHAR(50),
    `content` TEXT,
    `source` VARCHAR(50),
    `useful` TINYINT(1) DEFAULT 1,
    `timestamp` BIGINT NOT NULL,
    INDEX `idx_knowledge_type` (`knowledge_type`),
    INDEX `idx_source` (`source`),
    INDEX `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 16. Anomaly Detection: Metrics
CREATE TABLE IF NOT EXISTS `anomaly_metrics` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `metric_name` VARCHAR(100),
    `metric_value` DECIMAL(10,2),
    `timestamp` BIGINT NOT NULL,
    INDEX `idx_metric_name` (`metric_name`),
    INDEX `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17. Anomaly Detection: Anomalies
CREATE TABLE IF NOT EXISTS `anomaly_detections` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `metric_name` VARCHAR(100),
    `anomaly_type` VARCHAR(50),
    `severity` VARCHAR(20),
    `details` TEXT,
    `timestamp` BIGINT NOT NULL,
    INDEX `idx_metric_name` (`metric_name`),
    INDEX `idx_timestamp` (`timestamp`),
    INDEX `idx_severity` (`severity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
