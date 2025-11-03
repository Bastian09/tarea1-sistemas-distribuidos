Tarea 2 – Sistemas Distribuidos
===============================

Plataforma mínima de procesamiento de preguntas y respuestas con cola de mensajes.
Incluye: Apache Kafka (KRaft 1 nodo), PostgreSQL, generador de tráfico, servicio LLM
(Node.js) y un job de calidad (Flink/PyFlink). Dashboard Kafdrop y (opcional)
Schema Registry para integraciones.

Índice
------
1) Arquitectura
2) Requisitos
3) Estructura del repositorio
4) Puesta en marcha rápida
5) Servicios y variables
6) Tópicos Kafka
7) Esquema de base de datos
8) Flujos de datos
9) Pruebas rápidas
10) Solución de problemas

1) Arquitectura
---------------
- "generador_traf": lee preguntas aleatorias de PostgreSQL (tabla yahoo_data) y envía
  mensajes al tópico Kafka "questions.pending".
- "llm": consume "questions.pending", invoca un modelo LLM, publica en
  "answers.validated" y persiste métricas/respuestas finales.
- "flink": job PyFlink que evalúa calidad (p. ej. ROUGE-L), enruta:
    * aceptables → "answers.success"
    * para reintentar → "answers.retry" y reencola en "questions.pending"
    * rechazadas → "answers.rejected.lowquality"
- "postgres": base de datos para datos fuente (yahoo_data) y resultados (llm_*).
- "kafka": broker de mensajería (KRaft 1 nodo).
- "kafdrop": UI para inspeccionar tópicos.
- "schema-registry": opcional; útil si luego se usan esquemas Avro/JSON-Schema/Protobuf.

2) Requisitos
-------------
- Docker 24+ y Docker Compose v2
- Puertos libres: 5432 (Postgres), 9092 (Kafka), 9000 (Kafdrop), 8081 (Schema Registry)
- RAM sugerida: 4 GB+

3) Estructura del repositorio
-----------------------------
- docker-compose.yml             → Orquestación de todos los servicios
- topics.sh                      → Creador idempotente de tópicos Kafka
- requirements.txt               → Dependencias Python (servicios que lo requieran)
- database/                      → Build de Postgres + init (si aplica)
- generador_traf/                → Código del generador de tráfico (Python)
- llm/                           → Servicio Node.js (consumo LLM y persistencia)
- flink/                         → Job PyFlink que evalúa y enruta calidad
- README.md                      → (antiguo) Documento original del repo

4) Puesta en marcha rápida
--------------------------
1. Clonar el repositorio:
   git clone https://github.com/Bastian09/tarea1-sistemas-distribuidos
   cd tarea1-sistemas-distribuidos

2. Crear tópicos (lo hace automáticamente el servicio "init-topics"):
   - El compose monta topics.sh y lo ejecuta contra kafka:9092.

3. Levantar la plataforma:
   docker compose up -d --build

4. Verificar salud:
   - Kafdrop: http://localhost:9000
   - Schema Registry (opcional): http://localhost:8081
   - Postgres: psql -h localhost -U user -d yahoo_dataset

5) Servicios y variables
------------------------
Kafka (kafka)
- Imagen: confluentinc/cp-kafka:8.1.0
- Puerto: 9092
- KRaft de 1 nodo (factors = 1)

Schema Registry (schema-registry) [opcional]
- Imagen: confluentinc/cp-schema-registry:8.1.0
- Puerto: 8081
- BOOTSTRAP: PLAINTEXT://kafka:9092

Kafdrop (kafdrop)
- Imagen: obsidiandynamics/kafdrop
- Puerto: 9000
- Env: KAFKA_BROKERCONNECT=kafka:9092

PostgreSQL (postgres)
- Build local (./database)
- Puerto: 5432
- Env:
  POSTGRES_USER=user
  POSTGRES_PASSWORD=1234
  POSTGRES_DB=yahoo_dataset
- Volumen: pgdata:/var/lib/postgresql/data

Init Topics (init-topics)
- Imagen: confluentinc/cp-kafka:8.1.0
- Monta ./topics.sh y lo ejecuta tras healthy de kafka

Generador de tráfico (generador_traf)
- Build: generador_traf/Dockerfile
- Env:
  BOOTSTRAP_SERVERS=kafka:9092
  PENDING_TOPIC=questions.pending
  DB_HOST=postgres
  DB_NAME=yahoo_dataset
  DB_USER=user
  DB_PASS=1234

App LLM (llm_app)
- Build: ./llm (Node.js)
- Depende de kafka, postgres e init-topics
- Expone puerto 3000 (si su API lo requiere)
- Consume de "questions.pending", produce "answers.validated",
  persiste métricas y respuestas.

Flink Quality (flink)
- Build: ./flink
- Job PyFlink que evalúa el campo answer_llm vs answer_ref, enruta a success/retry/rejected.

6) Tópicos Kafka
----------------
El script topics.sh crea los siguientes tópicos (1 partición, rf=1):
- questions.pending
- answers.validated
- answers.success
- answers.retry
- answers.rejected.lowquality

7) Esquema de base de datos
---------------------------
Tablas habituales para persistencia (pueden variar si el repo cambia):
- yahoo_data(id SERIAL PRIMARY KEY, question_title TEXT, question_content TEXT?, best_answer TEXT)
- llm_answers(question_id TEXT PRIMARY KEY, question_text TEXT?, answer_llm TEXT, score DOUBLE PRECISION?, created_at TIMESTAMP DEFAULT now())
- llm_scores(question_id TEXT, retry_count INT, quality_score FLOAT, created_t TIMESTAMP DEFAULT now())
- llm_call_metrics(question_id TEXT PRIMARY KEY, llm_latency_ms BIGINT NOT NULL, llm_retries INT NOT NULL, created_at TIMESTAMP DEFAULT now())

8) Flujos de datos
------------------
1. generador_traf → (Kafka: questions.pending)
2. llm_app consume "questions.pending" → invoca LLM → produce "answers.validated" y registra métricas en DB.
3. flink consume "answers.validated":
   - Si calidad ≥ umbral: produce a "answers.success".
   - Si < umbral y hay reintentos: reencola a "questions.pending" y registra en "answers.retry".
   - Si < umbral y sin reintentos: produce a "answers.rejected.lowquality".
4. Persistencias:
   - "answers.success" → upsert en llm_answers.
   - "answers.retry"   → inserciones en llm_scores (historial de calidad/reintentos).

9) Pruebas rápidas
------------------
- Ver tópicos en Kafdrop: http://localhost:9000
- Publicar un mensaje de prueba (desde contenedor kafka):
  docker compose exec kafka bash -lc 'kafka-console-producer --bootstrap-server kafka:9092 --topic questions.pending'
  (pegar JSON de prueba y Enter)

- Consumir un tópico:
  docker compose exec kafka bash -lc 'kafka-console-consumer --bootstrap-server kafka:9092 --topic answers.validated --from-beginning'

- Ver filas en Postgres:
  psql "host=localhost dbname=yahoo_dataset user=user password=1234" -c "SELECT * FROM llm_answers LIMIT 10;"

10) Solución de problemas
-------------------------
- Kafka no arranca:
  * Asegúrate de que el puerto 9092 esté libre.
  * En Mac/Windows, reinicia Docker Desktop si hay residuos de redes.

- Postgres no accesible:
  * Revisa logs: docker compose logs -f postgres
  * Comprueba que el volumen pgdata no tenga permisos inválidos.

- No se crean los tópicos:
  * Verifica logs de init-topics: docker compose logs -f init-topics
  * Prueba manualmente: docker compose exec kafka kafka-topics --bootstrap-server kafka:9092 --list

- No ves mensajes en Kafdrop:
  * Asegúrate de que generador_traf está enviando (revisa logs).
  * Comprueba que llm_app/flink estén healthy y suscriptores a sus tópicos.
