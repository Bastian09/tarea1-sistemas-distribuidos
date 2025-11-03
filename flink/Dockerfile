FROM apache/flink:1.18.1-scala_2.12-java11

# ——— Versionado centralizado ———
ENV FLINK_PY_VERSION=1.18.1 \
    FLINK_KAFKA_CONNECTOR_VER=3.1.0-1.18 \
    KAFKA_CLIENTS_VER=3.6.0

USER root

# ——— Python 3 + pip, alias "python" y utilidades ———
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends python3 python3-pip ca-certificates wget; \
    update-alternatives --install /usr/bin/python python /usr/bin/python3 1; \
    python -m pip install --no-cache-dir "apache-flink==${FLINK_PY_VERSION}"; \
    rm -rf /var/lib/apt/lists/*

# ——— Conector Kafka y dependencias de compresión ———
RUN set -eux; \
    wget -qO /opt/flink/lib/flink-connector-kafka-${FLINK_KAFKA_CONNECTOR_VER}.jar \
      "https://repo1.maven.org/maven2/org/apache/flink/flink-connector-kafka/${FLINK_KAFKA_CONNECTOR_VER}/flink-connector-kafka-${FLINK_KAFKA_CONNECTOR_VER}.jar"; \
    wget -qO /opt/flink/lib/kafka-clients-${KAFKA_CLIENTS_VER}.jar \
      "https://repo1.maven.org/maven2/org/apache/kafka/kafka-clients/${KAFKA_CLIENTS_VER}/kafka-clients-${KAFKA_CLIENTS_VER}.jar"; \
    wget -qO /opt/flink/lib/lz4-java-1.8.0.jar \
      "https://repo1.maven.org/maven2/org/lz4/lz4-java/1.8.0/lz4-java-1.8.0.jar"; \
    wget -qO /opt/flink/lib/snappy-java-1.1.10.5.jar \
      "https://repo1.maven.org/maven2/org/xerial/snappy/snappy-java/1.1.10.5/snappy-java-1.1.10.5.jar"

# ——— App ———
WORKDIR /app
COPY score.py /app/score.py
RUN chown -R flink:flink /app

# Vuelve al usuario por defecto del contenedor base
USER flink

# ——— Arranque de cluster + job PyFlink ———
# Nota: se mantiene el comportamiento (cluster, espera corta, envío del job y tail logs)
CMD ["/bin/bash","-lc","/opt/flink/bin/start-cluster.sh && sleep 5 && /opt/flink/bin/flink run -py /app/score.py -pyexec python3 && tail -f /opt/flink/log/*"]

