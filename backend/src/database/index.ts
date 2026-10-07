import 'reflect-metadata';
import { connection } from './connection.js';

// Import all models so Sequelize knows about them
import '../models/User.js';
import '../models/Post.js';
import '../models/Category.js';

// Sync the database (creates/updates tables)
connection.sync({ alter: true })
  .then(() => {
    console.log('✅ Database synced successfully');
  })
  .catch((err) => {
    console.error('❌ Error syncing database:', err);
  });

export { connection };