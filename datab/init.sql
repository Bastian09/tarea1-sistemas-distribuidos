CREATE TABLE IF NOT EXISTS yahoo_data (
    id SERIAL PRIMARY KEY,
    class_index INT NOT NULL,
    question_title TEXT,
    question_content TEXT,
    best_answer TEXT
);

CREATE TABLE IF NOT EXISTS respuestas_llm (
    id_pregunta       TEXT UNIQUE,
    texto_pregunta    TEXT NOT NULL,
    respuesta_llm     TEXT,
    puntaje           DOUBLE PRECISION,
    fecha_creacion    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_pregunta)
);

-- Registro de las evaluaciones o puntuaciones de calidad del modelo
CREATE TABLE IF NOT EXISTS evaluaciones_llm (
    id_pregunta    TEXT REFERENCES respuestas_llm(id_pregunta),
    intentos       INTEGER,
    nota_calidad   REAL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Métricas de llamadas al modelo (latencia, reintentos, etc.)
CREATE TABLE IF NOT EXISTS metricas_llm (
    id_pregunta     TEXT UNIQUE,
    tiempo_respuesta_ms BIGINT NOT NULL,
    cantidad_reintentos  INTEGER NOT NULL,
    fecha_creacion       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_pregunta)
);
