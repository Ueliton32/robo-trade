FROM node:20-slim

WORKDIR /app

# openssl é exigido pelo engine do Prisma em runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

# O comando real é definido por serviço no docker-compose.yml
# (o app roda "npm start", o agendador roda "npm run scheduler")
CMD ["npm", "start"]
