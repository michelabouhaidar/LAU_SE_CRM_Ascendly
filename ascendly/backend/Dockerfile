# ─────────────────────────────────────
#  Ascendly CRM — Backend (Node/Express)
# ─────────────────────────────────────
FROM node:20-alpine

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm install && npm cache clean --force

# Copy source
COPY . .

# Switch to non-root
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 5000

# In development, use nodemon for hot-reload
CMD ["./node_modules/.bin/nodemon", "--watch", "src", "src/index.js"]