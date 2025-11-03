# Imagen base con Node.js 20 (ligera)
FROM node:20-slim

# Directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiamos solo los archivos de dependencias primero (para cache eficiente)
COPY package.json package-lock.json ./

# Instalación de dependencias en modo producción
RUN npm ci --omit=dev

# Copiamos el resto del código fuente
COPY . .

# Puerto opcional (si tu servicio lo expone)
EXPOSE 3000

# Comando de inicio del servicio
ENTRYPOINT ["node", "index.js"]
