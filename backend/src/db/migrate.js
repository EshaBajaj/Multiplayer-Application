import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  console.log('🔄 Connecting to PostgreSQL database...');
  
  try {
    const health = await db.checkHealth();
    console.log(`✅ Database connected! Server Version: ${health.version.split(' ')[0]} (${health.latencyMs}ms latency)`);
   
    let migrationPath = path.resolve(__dirname, '../../../database/migrations/001_initial_schema.sql');
    if (!fs.existsSync(migrationPath)) {
      migrationPath = path.resolve(__dirname, '../../database/migrations/001_initial_schema.sql');
    }
    if (!fs.existsSync(migrationPath)) {
      migrationPath = path.resolve(process.cwd(), 'database/migrations/001_initial_schema.sql');
    }
    if (!fs.existsSync(migrationPath)) {
      migrationPath = path.resolve(process.cwd(), '../database/migrations/001_initial_schema.sql');
    }
    console.log(`📜 Reading migration file: ${migrationPath}`);
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('🚀 Executing migration...');
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log('✅ Migration 001_initial_schema.sql executed successfully!');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Verify created tables
    const tableRes = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('\n📊 Database Tables in "public" schema:');
    tableRes.rows.forEach(r => console.log(`   - ${r.table_name}`));

    console.log('\n🎉 Phase 1 Database Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
