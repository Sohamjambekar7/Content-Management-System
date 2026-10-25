# Database setup and migrations

The backend uses Sequelize model names `Users`, `Posts`, `Categories`, `Tags`, `Comments`, `Tokens`, and `PostTags` by default. Table-name capitalization depends on the database and the Sequelize configuration used when the database was first created. **Back up the database first** and confirm table names with `SHOW TABLES;` before applying the migration.

## Repair the missing `Posts.categoryId` column

The original project error log records `Unknown column 'Post.categoryId' in 'field list'`. The model expects each post to belong to a category, but the existing database schema is missing that column. Run the following in a transaction after confirming your actual table names.

```sql
-- MySQL 8+. Back up the database before running.
START TRANSACTION;

ALTER TABLE `Posts` ADD COLUMN `categoryId` INT NULL AFTER `userId`;

-- Create one fallback category per user so existing posts can be assigned safely.
INSERT INTO `Categories` (`name`, `slug`, `userId`, `createdAt`, `updatedAt`)
SELECT 'Uncategorized', CONCAT('uncategorized-', u.`id`), u.`id`, NOW(), NOW()
FROM `Users` u
WHERE NOT EXISTS (SELECT 1 FROM `Categories` c WHERE c.`userId` = u.`id`);

UPDATE `Posts` p
JOIN `Categories` c ON c.`userId` = p.`userId`
SET p.`categoryId` = c.`id`
WHERE p.`categoryId` IS NULL;

ALTER TABLE `Posts` MODIFY COLUMN `categoryId` INT NOT NULL;
ALTER TABLE `Posts` ADD CONSTRAINT `fk_posts_categoryId`
  FOREIGN KEY (`categoryId`) REFERENCES `Categories` (`id`)
  ON UPDATE CASCADE ON DELETE RESTRICT;

COMMIT;
```

If the database already has a `categoryId` column, do not run the `ALTER TABLE ADD COLUMN` line again. If your table names are lowercase or have a different naming convention, adjust them. Review existing foreign keys before adding `fk_posts_categoryId` to avoid duplicate constraints.
