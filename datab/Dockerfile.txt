# Usamos la imagen oficial de PostgreSQL
FROM postgres:latest

# Variables de entorno
ENV POSTGRES_USER=user
ENV POSTGRES_PASSWORD=1234
ENV POSTGRES_DB=yahoo_dataset

# Copiamos los scripts de inicialización dentro del contenedor
COPY init.sql /docker-entrypoint-initdb.d/
COPY test.csv /docker-entrypoint-initdb.d/

# Por defecto, el contenedor ya corre postgres, no es necesario CMD
