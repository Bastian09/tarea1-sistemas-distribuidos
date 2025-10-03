Generador de Tráfico (generador_traf)
====================================

Este servicio genera tráfico de consultas hacia el Cache Service a partir de un corpus
de preguntas y respuestas almacenado en una base de datos PostgreSQL. Permite simular
diferentes distribuciones de llegada de peticiones (uniforme, gaussiana y poisson) y
controlar el ritmo mediante una tasa de requests per minute (RPM).


Requisitos

- Node.js 18+
- PostgreSQL 12+ con la tabla `yahoo_data`:

  CREATE TABLE yahoo_data (
    id SERIAL PRIMARY KEY,
    question_title TEXT,
    best_answer   TEXT
  );

- Un Cache Service corriendo (por defecto en http://localhost:8200).

1. Instalar dependencias

   cd generador_traf
   npm install

2. Variables de entorno

   Crea un archivo `.env` en la raíz de `generador_traf/` con el siguiente contenido:

   CACHE_SERVICE_URL=http://localhost:8200
   REQUESTS_PER_MINUTE=300
   DIST=poisson
   POISSON_LAMBDA=2

   # Configuración de Postgres
   PGUSER=user
   PGHOST=localhost
   PGDATABASE=yahoo_dataset
   PGPASSWORD=1234
   PGPORT=5432

3. Nota sobre package-lock.json

   No copies manualmente el package-lock.json. Lo correcto es regenerarlo en tu entorno:

   rm -rf node_modules package-lock.json
   npm install

Ejecuta el servicio con:

   npm start

Por defecto se conecta a la base de datos, carga el corpus (question_title, best_answer),
y comienza a enviar tráfico al Cache Service en base a la distribución configurada.
