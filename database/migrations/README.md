# Editor schema migration

Apply `20261024_create_editor_projects_and_export_history.sql` after confirming the existing Sequelize `User` model's actual table name and primary-key type. This project uses Sequelize's default table naming for `User` (normally `Users`) and integer IDs. If your deployed database was created with a manually named `users` table or a different ID type, update the two user foreign-key references before applying. Back up the database and test against staging first. The migration is additive and does not alter CMS tables.
