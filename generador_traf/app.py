import os
import asyncio
import orjson
import time
import uuid
import psycopg
import random
from psycopg_pool import ConnectionPool
from aiokafka import AIOKafkaProducer

# ==================== Configuración ====================
KAFKA_SERVIDOR = os.getenv("BOOTSTRAP_SERVERS", "kafka:9092")
TOPICO_PENDIENTE = os.getenv("PENDING_TOPIC", "questions.pending")

DB_HOST = os.getenv("DB_HOST", "postgres")
DB_NAME = os.getenv("DB_NAME", "yahoo_dataset")
DB_USER = os.getenv("DB_USER", "user")
DB_PASS = os.getenv("DB_PASS", "1234")

# ==================== Conexión a la base de datos ====================
pool = ConnectionPool(
    f"host={DB_HOST} dbname={DB_NAME} user={DB_USER} password={DB_PASS}"
)


def obtener_pregunta_aleatoria():
    """
    Devuelve una pregunta aleatoria de la tabla yahoo_data.
    Retorna (id, texto, mejor_respuesta) o (None, None, None) si no hay resultados.
    """
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, question_title, question_content, best_answer
            FROM yahoo_data
            ORDER BY RANDOM()
            LIMIT 1;
            """
        )
        fila = cur.fetchone()

    if not fila:
        return None, None, None

    pregunta_id = str(fila[0])
    texto = f"{fila[1] or ''} {fila[2] or ''}".strip()
    respuesta = (fila[3] or "").strip()

    return pregunta_id, texto, respuesta


def ya_existe_en_llm_answers(pregunta_id: str) -> bool:
    """Verifica si la pregunta ya fue respondida (existe en llm_answers)."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM llm_answers WHERE question_id = %s LIMIT 1;", (pregunta_id,)
        )
        return cur.fetchone() is not None


# ==================== Lógica principal ====================
async def main():
    productor = AIOKafkaProducer(
        bootstrap_servers=KAFKA_SERVIDOR,
        value_serializer=lambda v: orjson.dumps(v),
    )

    await productor.start()
    print("🟡 Esperando que Kafka esté disponible...")
    await asyncio.sleep(5)
    await productor.client.force_metadata_update()

    try:
        while True:
            pregunta_id, texto, mejor_respuesta = obtener_pregunta_aleatoria()

            if not pregunta_id or not texto:
                print("⚠️ No se obtuvo ninguna pregunta, esperando 2s...")
                await asyncio.sleep(2)
                continue

            if ya_existe_en_llm_answers(pregunta_id):
                print(f"✅ Pregunta {pregunta_id} ya existe en llm_answers → omitida")
                await asyncio.sleep(1)
                continue

            mensaje = {
                "question_id": pregunta_id,
                "question_text": texto,
                "answer_ref": mejor_respuesta,
                "attempt": 0,
                "retry_count": 0,
                "trace_id": str(uuid.uuid4()),
                "ts": time.time(),
            }

            try:
                print(f"🚀 Enviando pregunta {pregunta_id} → {TOPICO_PENDIENTE}")
                await productor.send_and_wait(TOPICO_PENDIENTE, mensaje)
            except Exception as error:
                print(f"⚠️ Error al enviar {pregunta_id}: {error}, reintentando...")
                await asyncio.sleep(3)
                continue

            # Pequeña pausa entre envíos
            await asyncio.sleep(2)

    except asyncio.CancelledError:
        print("⛔ Tarea cancelada, cerrando productor y conexiones...")
    finally:
        await productor.stop()
        pool.close()
        print("🧹 Conexiones cerradas correctamente.")


# ==================== Punto de entrada ====================
if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("🛑 Interrumpido por el usuario.")

 
