// index.js (reescrito)
import "dotenv/config";
import { Kafka, logLevel } from "kafkajs";
import pg from "pg";
import { getLLMResponse } from './llm.js';
// ================== Configuración ==================
const {
  DB_HOST = "postgres",
  DB_USER = "user",
  DB_PASS = "1234",
  DB_NAME = "yahoo_dataset",
  DB_PORT = "5432",
  BOOTSTRAP_SERVERS = "kafka:9092",
} = process.env;

// Tópicos
const TOPICS = {
  PENDING: "questions.pending",
  VALIDATED: "answers.validated",
  SUCCESS: "answers.success",
  RETRY: "answers.retry",
};

// ================== Kafka ==================
const kafka = new Kafka({
  clientId: "llm-app",
  brokers: BOOTSTRAP_SERVERS.split(","),
  logLevel: logLevel.INFO,
});

const consumerWorker = kafka.consumer({ groupId: "grp-llm-worker" });
const producerWorker = kafka.producer();

const consumerPersister = kafka.consumer({ groupId: "grp-answers-persister" });
const consumerRetry = kafka.consumer({ groupId: "grp-retry-persister" });

// ================== Postgres ==================
const { Pool } = pg;
const pool = new Pool({
  host: DB_HOST,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASS,
  port: parseInt(DB_PORT, 10),
});

// ================== Utilidades ==================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseMsg(message) {
  try {
    return JSON.parse(message.value?.toString("utf8") || "{}");
  } catch {
    return {};
  }
}

async function upsertAnswer(question_id, answer_text) {
  // Mantiene el esquema original (tabla llm_answers)
  await pool.query(
    `INSERT INTO llm_answers (question_id, answer_llm)
     VALUES ($1, $2)
     ON CONFLICT (question_id)
     DO UPDATE SET answer_llm = EXCLUDED.answer_llm`,
    [question_id, answer_text]
  );
}

async function saveLLMMetrics(question_id, llm_latency_ms, llm_retries) {
  await pool.query(
    `INSERT INTO llm_call_metrics (question_id, llm_latency_ms, llm_retries)
     VALUES ($1, $2, $3)
     ON CONFLICT (question_id)
     DO UPDATE SET
       llm_latency_ms = EXCLUDED.llm_latency_ms,
       llm_retries    = EXCLUDED.llm_retries`,
    [question_id, llm_latency_ms, llm_retries]
  );
}

// ================== Lógica Worker ==================
async function startWorker() {
  await producerWorker.connect();
  await consumerWorker.connect();
  await consumerWorker.subscribe({ topic: TOPICS.PENDING, fromBeginning: true });

  console.log("Worker escuchando:", TOPICS.PENDING, "→", TOPICS.VALIDATED);
  console.log(`DB: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);

  await consumerWorker.run({
    eachMessage: async ({ message, partition }) => {
      const payload = parseMsg(message);
      const { question_id, question_text, trace_id, retry_count } = payload;

      if (!question_id || !question_text) {
        console.warn("[Worker] Mensaje inválido:", payload);
        return;
      }

      try {
        const t0 = Date.now();
        // usar la función del nuevo llm.js
        const { texto: answer_llm, reintentos: llm_retries } =
          await solicitarRespuestaLLM(question_text);
        const llm_latency_ms = Date.now() - t0;

        await saveLLMMetrics(question_id, llm_latency_ms, llm_retries);

        const out = {
          question_id,
          answer_llm,
          ts: Date.now(),
          trace_id: trace_id || null,
          retry_count, // conserva el retry_count entrante
        };

        await producerWorker.send({
          topic: TOPICS.VALIDATED,
          messages: [{ value: JSON.stringify(out) }],
        });

        console.log(
          `✔️ [Worker] ${question_id} (p${partition}) ` +
            `lat=${llm_latency_ms}ms retries=${llm_retries}`
        );
      } catch (err) {
        console.error("❌ [Worker] Error procesando:", err.message);
      }
    },
  });
}

// ================== Lógica Persister ==================
async function startPersister() {
  await consumerPersister.connect();
  await consumerPersister.subscribe({
    topic: TOPICS.SUCCESS,
    fromBeginning: false,
  });

  console.log("Persister escuchando:", TOPICS.SUCCESS, "→ DB");

  await consumerPersister.run({
    eachMessage: async ({ message, partition }) => {
      const payload = parseMsg(message);
      const { question_id, answer_llm } = payload;

      if (!question_id || typeof answer_llm !== "string") {
        console.warn("⚠️ [Persister] Mensaje inválido:", payload);
        return;
      }

      try {
        await upsertAnswer(question_id, answer_llm);
        console.log(`💾 [Persister] Guardado ${question_id} (p${partition})`);
      } catch (err) {
        console.error("❌ [Persister] Error:", err.message);
      }
    },
  });
}

// ================== Lógica Retry Persister ==================
async function startRetryPersister() {
  await consumerRetry.connect();
  await consumerRetry.subscribe({ topic: TOPICS.RETRY, fromBeginning: false });

  console.log("RetryPersister escuchando:", TOPICS.RETRY, "→ llm_scores");

  await consumerRetry.run({
    eachMessage: async ({ message, partition }) => {
      const payload = parseMsg(message);
      const { question_id, retry_count, quality_score } = payload;

      if (
        !question_id ||
        typeof retry_count !== "number" ||
        typeof quality_score !== "number"
      ) {
        console.warn("⚠️ [RetryPersister] Mensaje inválido:", payload);
        return;
      }

      try {
        await pool.query(
          `INSERT INTO llm_scores (question_id, retry_count, quality_score)
           VALUES ($1, $2, $3)`,
          [question_id, retry_count, quality_score]
        );

        console.log(
          `💾 [RetryPersister] Guardado ${question_id} ` +
            `retry=${retry_count} score=${quality_score} (p${partition})`
        );
      } catch (err) {
        console.error("❌ [RetryPersister] Error:", err.message);
      }
    },
  });
}

// ================== Orquestación / Shutdown ==================
async function run() {
  await Promise.all([
    startWorker(),
    startPersister(),
    startRetryPersister(),
  ]);
}

async function shutdown() {
  console.log("Apagando servicios...");
  await Promise.allSettled([
    consumerWorker.disconnect(),
    producerWorker.disconnect(),
    consumerPersister.disconnect(),
    consumerRetry.disconnect(),
    pool.end(),
  ]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
