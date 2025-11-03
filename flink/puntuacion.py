import json
import re
from pyflink.datastream import StreamExecutionEnvironment

# Compatibilidad de import según versión de PyFlink
try:
    from pyflink.datastream import WatermarkStrategy
except ImportError:
    from pyflink.common import WatermarkStrategy

from pyflink.datastream.connectors.kafka import (
    KafkaSource, KafkaSink, KafkaRecordSerializationSchema, KafkaOffsetsInitializer
)
from pyflink.common.serialization import SimpleStringSchema
from pyflink.common import Types

# ================= CONFIGURACIÓN =================
SERVIDOR_KAFKA = "kafka:9092"

TOPICO_VALIDADO = "answers.validated"
TOPICO_REINTENTOS = "answers.retry"
TOPICO_PENDIENTE = "questions.pending"
TOPICO_ACEPTADO = "answers.success"
TOPICO_RECHAZADO = "answers.rejected.lowquality"

UMBRAL_CALIDAD = 0.5
LIMITE_REINTENTOS = 3


# ================= FUNCIONES AUXILIARES =================
def dividir_texto(texto: str):
    """Separa una cadena en tokens alfanuméricos en minúsculas."""
    return re.findall(r"\w+", texto.lower())


def similitud_rouge(ref: str, pred: str) -> float:
    """Calcula una versión simplificada de ROUGE-L basada en subsecuencia común más larga."""
    a = dividir_texto(ref)
    b = dividir_texto(pred)
    if not a or not b:
        return 0.0

    m, n = len(a), len(b)
    matriz = [[0] * (n + 1) for _ in range(m + 1)]

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                matriz[i][j] = matriz[i - 1][j - 1] + 1
            else:
                matriz[i][j] = max(matriz[i - 1][j], matriz[i][j - 1])

    subseq = matriz[m][n]
    return subseq / ((m + n) / 2)  # normalización promedio


def evaluar_respuesta(msg: str):
    """Evalúa la calidad de una respuesta y genera las salidas según el resultado."""
    data = json.loads(msg)
    qid = data.get("question_id")
    ref = data.get("answer_ref", "")
    llm = data.get("answer_llm", "")
    reintentos = data.get("retry_count", 0)

    puntaje = similitud_rouge(ref, llm)
    print(f"Puntaje calculado para {qid}: {puntaje:.3f}")

    # Caso A: Respuesta suficientemente buena → exitosa
    if puntaje >= UMBRAL_CALIDAD:
        salida = {
            "question_id": qid,
            "answer_ref": ref,
            "answer_llm": llm,
            "quality_score": puntaje,
            "retry_count": reintentos,
        }
        yield ("aceptado", json.dumps(salida))

    # Caso B: No cumple calidad pero aún puede reintentarse
    elif reintentos < LIMITE_REINTENTOS:
        nueva_tarea = {
            "question_id": qid,
            "question_text": data.get("question_text", ""),
            "answer_ref": ref,
            "retry_count": reintentos + 1,
        }
        yield ("pendiente", json.dumps(nueva_tarea))
        yield ("reintento", json.dumps(nueva_tarea))

    # Caso C: Sin calidad y sin más reintentos → rechazo
    else:
        rechazo = {
            "question_id": qid,
            "reason": "low_quality",
            "score": puntaje,
            "retry_count": reintentos,
        }
        yield ("rechazado", json.dumps(rechazo))


# ================= JOB PRINCIPAL =================
def main():
    entorno = StreamExecutionEnvironment.get_execution_environment()
    entorno.set_parallelism(1)

    # ---- Fuente Kafka ----
    fuente = (
        KafkaSource.builder()
        .set_bootstrap_servers(SERVIDOR_KAFKA)
        .set_topics(TOPICO_VALIDADO)
        .set_group_id("flink-evaluador")
        .set_value_only_deserializer(SimpleStringSchema())
        .set_starting_offsets(KafkaOffsetsInitializer.earliest())
        .build()
    )

    sin_marcas = WatermarkStrategy.no_watermarks()
    flujo = entorno.from_source(fuente, sin_marcas, "Flujo de respuestas validadas")

    # ---- Sinks ----
    def crear_sink(topico):
        return (
            KafkaSink.builder()
            .set_bootstrap_servers(SERVIDOR_KAFKA)
            .set_record_serializer(
                KafkaRecordSerializationSchema.builder()
                .set_topic(topico)
                .set_value_serialization_schema(SimpleStringSchema())
                .build()
            )
            .build()
        )

    sink_aceptado = crear_sink(TOPICO_ACEPTADO)
    sink_pendiente = crear_sink(TOPICO_PENDIENTE)
    sink_rechazado = crear_sink(TOPICO_RECHAZADO)
    sink_reintento = crear_sink(TOPICO_REINTENTOS)

    # ---- Lógica de procesamiento ----
    def transformador(valor):
        for tipo, mensaje in evaluar_respuesta(valor):
            yield tipo, mensaje

    procesado = flujo.flat_map(
        transformador,
        output_type=Types.TUPLE([Types.STRING(), Types.STRING()])
    )

    # Enrutamiento según tipo de salida
    procesado.filter(lambda t: t[0] == "aceptado") \
        .map(lambda t: t[1], output_type=Types.STRING()) \
        .sink_to(sink_aceptado)

    procesado.filter(lambda t: t[0] == "pendiente") \
        .map(lambda t: t[1], output_type=Types.STRING()) \
        .sink_to(sink_pendiente)

    procesado.filter(lambda t: t[0] == "rechazado") \
        .map(lambda t: t[1], output_type=Types.STRING()) \
        .sink_to(sink_rechazado)

    procesado.filter(lambda t: t[0] == "reintento") \
        .map(lambda t: t[1], output_type=Types.STRING()) \
        .sink_to(sink_reintento)

    entorno.execute("Evaluador de Respuestas LLM - PyFlink")


if __name__ == "__main__":
    main()
