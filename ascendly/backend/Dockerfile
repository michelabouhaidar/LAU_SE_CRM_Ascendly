FROM node:20-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json ./
RUN npm install && npm cache clean --force

COPY . .

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 5000

CMD ["sh", "-c", "npm install && ./node_modules/.bin/nodemon --watch src src/index.js"]
