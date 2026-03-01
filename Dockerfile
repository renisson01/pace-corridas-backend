FROM node:20-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate
COPY . .
EXPOSE 8080
CMD ["sh", "-c", "node seed-ranking-cbat.cjs && node src/index.js"]
