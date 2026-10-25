import 'dotenv/config';
import { connection } from './connection';

async function initializeDatabase() {
  try {
    await connection.authenticate();
    // Creates missing tables only; it does not alter or drop existing tables.
    await connection.sync();
    console.log('Database tables are ready. Review migrations before using existing production data.');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exitCode = 1;
  } finally {
    await connection.close();
  }
}
void initializeDatabase();
