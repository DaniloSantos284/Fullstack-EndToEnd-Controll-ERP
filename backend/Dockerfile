FROM node:20-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

# Compilar TypeScript
RUN npm run build

EXPOSE 4000

# Usar arquivo compilado para execução
CMD ["node", "dist/server.js"]