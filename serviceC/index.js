import express from 'express';
import 'dotenv/config';
import cache from './cache.js';
import axios from 'axios';
import { pool } from './db.js'; // para persistencia de logs o métricas si lo deseas

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 8200);
const SCORE_SERVICE = process.env.SCORE_SERVICE_URL || null;

app.post('/update', async (req, res) => {
  const { question, answer_llm, quality_score, ttlSec } = req.body;
  if (!question || !answer_llm || quality_score == null) {
    return res.status(400).json({ error: 'Faltan campos: question, answer_llm, quality_score' });
  }

  const key = `q:${question}`; // clave simple basada en la pregunta
  const payload = { question, answer_llm, quality_score, storedAt: Date.now() };

  cache.put(key, payload, { ttlSec }); // ttlSec opcional
  // opcional: almacenar log en DB (si tienes tabla)
  try {
    // ejemplo: guardar métrica (tabla debe existir si se desea usar)
    // await pool.query('INSERT INTO cache_logs(key, action, ts) VALUES($1,$2,$3)', [key, 'update', Date.now()]);
  } catch (err) {
    // no fallar por error de métricas
    console.warn('db log skipped:', err.message);
  }

  return res.status(201).json({ ok: true, key });
});

app.get('/get/:question', async (req, res) => {
  const question = req.params.question;
  if (!question) return res.status(400).json({ error: 'Falta parametro question' });

  const key = `q:${question}`;
  const entry = cache.get(key);
  if (entry) {
    return res.json({ fromCache: true, value: entry });
  }

  // fallback al score service si está disponible
  if (!SCORE_SERVICE) {
    return res.status(404).json({ fromCache: false, error: 'No encontrado en cache y no hay SCORE_SERVICE configurado' });
  }

  try {
    // ejemplo de consulta: POST { question } al score service
    const r = await axios.post(`${SCORE_SERVICE}/query`, { question }, { timeout: 3000 });
    // guardar en cache con TTL corto
    cache.put(key, r.data, { ttlSec: 60 });
    return res.json({ fromCache: false, value: r.data });
  } catch (err) {
    return res.status(502).json({ error: 'Fallo al consultar score service', detail: err.message });
  }
});

app.delete('/delete/:question', (req, res) => {
  const question = req.params.question;
  const key = `q:${question}`;
  const removed = cache.del(key);
  return res.json({ removed });
});

app.get('/stats', (req, res) => res.json(cache.stats()));
app.get('/entries', (req, res) => res.json(cache.entries()));
app.post('/reset-stats', (req, res) => {
  cache.resetStats();
  return res.json({ message: 'Stats reiniciadas', stats: cache.stats() });
});


app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

app.listen(PORT, () => console.log(`Cache service (v2) listening on ${PORT}`));
