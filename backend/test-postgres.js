// Test PostgreSQL/Supabase connection
require('dotenv').config();

// Set the DATABASE_URL for testing (you'll replace this with your actual Supabase URL)
// process.env.DATABASE_URL = 'postgresql://postgres:[PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres';
process.env.USE_POSTGRESQL = 'true';

if (!process.env.DATABASE_URL) {
  console.log('❌ DATABASE_URL not set!');
  console.log('Please add your Supabase connection string to .env file:');
  console.log('DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres');
  process.exit(1);
}

console.log('Testing PostgreSQL connection...');
console.log('Database URL:', process.env.DATABASE_URL.replace(/:[^:@]*@/, ':****@')); // Hide password

const db = require('./config/database');

async function testConnection() {
  try {
    // Test basic connection
    const testQuery = await db.getDatabase().get(
      "SELECT NOW() as current_time, version() as pg_version",
      [],
      (err, row) => {
        if (err) {
          console.error('❌ Connection failed:', err.message);
          process.exit(1);
        }
        console.log('✅ Connected to PostgreSQL!');
        console.log('Current time:', row?.current_time);
        console.log('PostgreSQL version:', row?.pg_version);
      }
    );

    // Test tables exist
    setTimeout(() => {
      db.getDatabase().all(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
        [],
        (err, tables) => {
          if (err) {
            console.error('❌ Error checking tables:', err.message);
            process.exit(1);
          }
          console.log('\n✅ Tables in database:');
          tables.forEach(table => {
            console.log('  -', table.table_name);
          });
          
          console.log('\n🎉 PostgreSQL setup successful!');
          console.log('Your database is ready to use with persistent storage.');
          process.exit(0);
        }
      );
    }, 1000);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testConnection();