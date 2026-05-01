FROM postgres:16-alpine

# Execution order (alphabetical):
#   01_init.sql  — schema + demo data (remove demo section to start clean)
#   02_seed.sh   — runtime admin user from .env (env vars, not in image)

COPY init.sql /docker-entrypoint-initdb.d/01_init.sql
COPY seed.sh  /docker-entrypoint-initdb.d/02_seed.sh
RUN chmod +x  /docker-entrypoint-initdb.d/02_seed.sh

EXPOSE 5432
