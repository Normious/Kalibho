FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && npm ci --omit=dev

COPY . .

RUN mkdir -p /app/data

EXPOSE 4010

CMD ["node", "src/server.js"]
