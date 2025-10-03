import 'dotenv/config';
import axios from 'axios';
import { pool } from './db.js';

// ---------- Config ----------
const CACHE_SERVICE_URL = (process.env.CACHE_SERVICE_URL || 'http://localhost:8200').replace(/\/+$/, '');
const REQUESTS_PER_MINUTE = Number(process.env.REQUESTS_PER_MINUTE || 300);
const TICK_MS = Math.max(1, Math.floor(60000 / Math.max(1, REQUESTS_PER_MINUTE)));
const DIST = (process.env.DIST || 'poisson').toLowerCase(); // 'uniform' | 'gaussian' | 'poisson'


function gaussianRandom(mean = 0, stdDev = 1) {
  // Box-Muller
  let u1 = 1 - Math.random();
  let u2 = 1 - Math.random();
  let z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z0 * stdDev + mean;
}

function boundedGaussianIndex(n, mean, std) {
  let idx;
  do { idx = Math.round(gaussianRandom(mean, std)); } while (idx < 0 || idx >= n);
  return idx;
}

function poissonRandom(lambda) {
  // Knuth
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}


async function fetchCorpus() {
  // mismo query que tu versión: question_title -> question, best_answer -> answer
  const { rows } = await pool.query(
    'SELECT question_title AS question, best_answer AS answer FROM yahoo_data'
  );
  return rows;
}


async function pushToCacheService(question, answer) {
  try {
    const { data } = await axios.post(`${CACHE_SERVICE_URL}/cache`, { question, answer }, { timeout: 4000 });
    const fromCache = data?.fromCache ?? false;
    const llm = data?.answer_llm ?? 'N/A';
    console.log(`[CACHE] Q="${question.slice(0, 60)}..." | fromCache=${fromCache} | llm="${String(llm).slice(0, 60)}..."`);
  } catch (err) {
    console.warn(`[CACHE] fallo envío: ${err.message}`);
  }
}


async function emitOne(corpus) {
  const n = corpus.length;
  if (n === 0) return;

  switch (DIST) {
    case 'gaussian': {
      const idx = boundedGaussianIndex(n, Math.floor(n / 2), Math.max(1, Math.floor(n / 4)));
      const { question, answer } = corpus[idx];
      await pushToCacheService(question, answer);
      break;
    }
    case 'poisson': {
      // promedio de eventos por tick; puedes ajustar el lambda
      const lambda = Number(process.env.POISSON_LAMBDA || 2);
      const count = Math.min(poissonRandom(lambda), n);
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * n);
        const { question, answer } = corpus[idx];
        // secuencial para no saturar; si quieres paralelizar, puedes Promise.all con cuidado
        await pushToCacheService(question, answer);
      }
      break;
    }
    case 'uniform':
    default: {
      const idx = Math.floor(Math.random() * n);
      const { question, answer } = corpus[idx];
      await pushToCacheService(question, answer);
      break;
    }
  }
}

// ---------- Bucle principal ----------
async function main() {
  try {
    // sanity check DB
    await pool.query('SELECT 1');
    console.log('Conexión a la BDD OK');
  } catch (e) {
    console.error('Error conectando a la BDD:', e.message);
    process.exit(1);
  }

  const corpus = await fetchCorpus();
  console.log(`📚 Corpus cargado: ${corpus.length} filas`);
  console.log(`▶️  Emisión: dist=${DIST} | rpm=${REQUESTS_PER_MINUTE} | tick=${TICK_MS}ms | cache=${CACHE_SERVICE_URL}`);

  // bucle infinito controlado por ticks
  // usamos setInterval + una cola simple para evitar solapes si el tick anterior se demora
  let running = false;

  const timer = setInterval(async () => {
    if (running) return;        // evita reentradas
    running = true;
    try {
      await emitOne(corpus);
    } catch (e) {
      console.error('⚠️  Error en tick:', e.message);
    } finally {
      running = false;
    }
  }, TICK_MS);

  // manejo limpio de señales
  function shutdown(signal) {
    console.log(`\n${signal} recibido. Cerrando...`);
    clearInterval(timer);
    pool.end().finally(() => process.exit(0));
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error('❌ Fallo en generador:', e);
  process.exit(1);
});
 