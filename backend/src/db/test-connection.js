import db from './index.js';

async function testConnection() {
  console.log('🔍 Testing PostgreSQL Database Connection...');
  try {
    const health = await db.checkHealth();
    console.log('✅ Connection Status: Healthy');
    console.log(`⏱️ Latency: ${health.latencyMs}ms`);
    console.log(`🕒 Server Time: ${health.timestamp}`);
    console.log(`📦 Engine: ${health.version.split(' on ')[0]}`);

    const counts = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users_count,
        (SELECT COUNT(*) FROM rooms) as rooms_count,
        (SELECT COUNT(*) FROM room_members) as members_count,
        (SELECT COUNT(*) FROM drafts) as drafts_count,
        (SELECT COUNT(*) FROM spins) as spins_count,
        (SELECT COUNT(*) FROM spin_events) as events_count
    `);
    
    console.log('\n📊 Current Row Counts:');
    console.log(counts.rows[0]);

    console.log('\n✨ Database is fully ready for production & development use!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Database Connection Test Failed:', err);
    process.exit(1);
  }
}

testConnection();
