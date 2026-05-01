# ──────────────────────────────────────
#  Ascendly CRM — Frontend (React/Vite)
# ──────────────────────────────────────
FROM node:20-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json ./
RUN npm install && npm cache clean --force

COPY . .

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 5173

# Vite dev server — bind to 0.0.0.0 so nginx can reach it
CMD ["./node_modules/.bin/vite", "--host", "0.0.0.0", "--port", "5173"]