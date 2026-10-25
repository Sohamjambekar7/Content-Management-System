-- ContentDesk AI editor metadata tables (MySQL 8+).
-- Run after the existing CMS users table has been created. Back up production first.
-- The current Sequelize User model uses the default `Users` table name.
CREATE TABLE IF NOT EXISTS editor_projects (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  media_type ENUM('photo','video') NOT NULL,
  metadata JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_editor_projects_user_updated (user_id, updated_at),
  CONSTRAINT fk_editor_projects_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS export_history (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  project_id INT NULL,
  format VARCHAR(24) NOT NULL,
  width INT NULL,
  height INT NULL,
  duration_seconds DECIMAL(10,3) NULL,
  platform VARCHAR(40) NULL,
  metadata JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_export_history_user_created (user_id, created_at),
  KEY idx_export_history_project (project_id),
  CONSTRAINT fk_export_history_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  CONSTRAINT fk_export_history_project FOREIGN KEY (project_id) REFERENCES editor_projects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
