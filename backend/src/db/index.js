import pg from 'pg';
import dns from 'dns/promises';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import memoryDb from './memoryDb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback to cwd

const { Pool } = pg;

let pool = null;
let useMemoryFallback = false;

export async function getPool() {
  if (useMemoryFallback) {
    return memoryDb.getPool();
  }

  if (pool && !pool.ended) return pool;

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    console.log('ℹ️ DATABASE_URL not specified in .env. Using fast In-Memory Database Engine (Zero Setup).');
    useMemoryFallback = true;
    return memoryDb.getPool();
  }

  try {
    const parsedUrl = new URL(rawUrl);
    const hostname = parsedUrl.hostname;
    const port = parseInt(parsedUrl.port || '5432', 10);
    const user = decodeURIComponent(parsedUrl.username);
    const password = decodeURIComponent(parsedUrl.password);
    const database = parsedUrl.pathname.replace(/^\//, '');

    let hostToConnect = hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      try {
        const ipv4List = await dns.resolve4(hostname);
        if (ipv4List && ipv4List.length > 0) {
          hostToConnect = ipv4List[0];
        }
      } catch {
        hostToConnect = hostname;
      }
    }

    const isSsl = rawUrl.includes('sslmode=require') || !['localhost', '127.0.0.1'].includes(hostname);

    pool = new Pool({
      host: hostToConnect,
      port,
      user,
      password,
      database,
      ssl: isSsl
        ? {
            rejectUnauthorized: false,
            servername: hostname,
          }
        : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL client error on idle pool:', err);
    });

    return pool;
  } catch (err) {
    console.warn('⚠️ Could not establish connection to PostgreSQL:', err.message);
    console.log('🔄 Falling back to In-Memory Database Engine.');
    useMemoryFallback = true;
    return memoryDb.getPool();
  }
}

export const query = async (text, params) => {
  if (useMemoryFallback) return memoryDb.query(text, params);
  try {
    const p = await getPool();
    if (useMemoryFallback) return memoryDb.query(text, params);
    return await p.query(text, params);
  } catch (err) {
    if (!useMemoryFallback && err.code === 'ECONNREFUSED') {
      console.warn('⚠️ PostgreSQL connection failed. Switching to In-Memory Engine.');
      useMemoryFallback = true;
      return memoryDb.query(text, params);
    }
    throw err;
  }
};

export const getClient = async () => {
  if (useMemoryFallback) return memoryDb.getClient();
  try {
    const p = await getPool();
    if (useMemoryFallback) return memoryDb.getClient();
    return await p.connect();
  } catch (err) {
    console.warn('⚠️ PostgreSQL client connection failed. Switching to In-Memory Engine.');
    useMemoryFallback = true;
    return memoryDb.getClient();
  }
};

export const checkHealth = async () => {
  if (useMemoryFallback) return memoryDb.checkHealth();
  try {
    const start = Date.now();
    const res = await query('SELECT NOW() as current_time, version() as version');
    const duration = Date.now() - start;
    return {
      status: 'connected',
      latencyMs: duration,
      timestamp: res.rows[0].current_time,
      version: res.rows[0].version,
    };
  } catch {
    useMemoryFallback = true;
    return memoryDb.checkHealth();
  }
};

export default {
  getPool,
  query,
  getClient,
  checkHealth,
};
