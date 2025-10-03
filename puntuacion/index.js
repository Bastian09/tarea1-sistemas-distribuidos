import express from 'express';
import 'dotenv/config';
import axios from 'axios';
import { pool } from './db.js';
import { getLLMResponse } from './llm.js';
import { calculateQuality } from './score.js';

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 8100);
const CACHE_SERVICE_URL =
  process.env.CACHE_SERVICE_URL?.replace(/\/+$/, '') || 'http://localhost:8200';

// Verificación simple de DB al inicio
async function assertDB() {
  await pool.query('SELECT 1');
  console.log('DB OK');
}

// POST /evaluate
app.post('/evaluate', async (req, res) => {
  const { question, answer } = req.body || {};
  if (!question || !answer) {
    return res.status(400).json({ error: 'Faltan campos: question y answer' });
  }

  try {
    // 1) Preguntar al LLM 
    const llmAnswer = await getLLMResponse(question);

    // 2) Calcular calidad 
    const qualityScore = await calculateQuality(llmAnswer, answer);

    // 3) Guardar en la BDD 
    await pool.query(
      `INSERT INTO score_results
       (question, answer_yahoo, answer_llm, quality_score, times_querried)
       VALUES ($1,$2,$3,$4,1)`,
      [question, answer, llmAnswer, qualityScore]
    );

    // 4) Enviar al Cache Service (endpoint /update)
    try {
      await axios.post(`${CACHE_SERVICE_URL}/update`, {
        question,
        answer_llm: llmAnswer,
        quality_score: qualityScore
      }, { timeout: 4000 });
      console.log('🗃️ Cache actualizado');
    } catch (cacheErr) {
      console.warn('Cache Service fallo:', cacheErr?.message);
    }

    // 5) Respuesta
    return res.json({ question, answer_llm: llmAnswer, quality_score: qualityScore });
  } catch (err) {
    console.error('ScoreService error:', err?.message || err);
    return res.status(500).json({ error: 'Error en Score Service' });
  }
});

// POST /llm
app.post('/llm', async (req, res) => {
  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Falta question en el body' });
  try {
    const answer_llm = await getLLMResponse(question);
    return res.json({ question, answer_llm });
  } catch (err) {
    console.error('LLM endpoint error:', err?.message || err);
    return res.status(500).json({ error: 'Error llamando al LLM' });
  }
});

// healthcheck
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// Arranque
assertDB()
  .then(() => app.listen(PORT, () => console.log(`Score service listening on ${PORT}`)))
  .catch((e) => {
    console.error('No se pudo iniciar: DB no disponible', e?.message || e);
    process.exit(1);
  });
