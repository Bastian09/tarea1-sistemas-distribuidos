#!/usr/bin/env bash
# =========================================================
# Inicializador de tópicos Kafka (1 partición, sin réplica)
# =========================================================
set -Eeuo pipefail

BROKER_ADDR="kafka:9092"

TOPICOS=(
  "questions.pending"
  "answers.success"
  "answers.retry"
  "answers.validated"
  "answers.rejected.lowquality"
)

echo "🔧 Iniciando creación de tópicos en $BROKER_ADDR ..."

for TOPICO in "${TOPICOS[@]}"; do
  echo "Verificando o creando tópico: ${TOPICO}"
  kafka-topics \
    --bootstrap-server "${BROKER_ADDR}" \
    --create \
    --if-not-exists \
    --topic "${TOPICO}" \
    --partitions 1 \
    --replication-factor 1
done

echo "✅ Todos los tópicos han sido verificados o creados correctamente."
