FROM postgres:16-alpine

COPY init.sql /docker-entrypoint-initdb.d/01_init.sql
COPY seed.sh  /docker-entrypoint-initdb.d/02_seed.sh
RUN chmod +x  /docker-entrypoint-initdb.d/02_seed.sh

EXPOSE 5432
