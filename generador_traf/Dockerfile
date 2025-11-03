# Imagen base ligera con Python 3.11
FROM python:3.11-slim

# Establece la carpeta de trabajo
WORKDIR /usr/src/app

# Copiamos el archivo de dependencias primero (para aprovechar cache)
COPY requirements.txt ./requirements.txt

# Instalación de dependencias sin cache + paquete PostgreSQL binario
RUN set -eux; \
    pip install --no-cache-dir -r requirements.txt; \
    pip install --no-cache-dir "psycopg[binary]"

# Copiamos la aplicación al contenedor
COPY traffic_gen/app.py ./app.py

# Define el comando de inicio por defecto
ENTRYPOINT ["python", "app.py"]
