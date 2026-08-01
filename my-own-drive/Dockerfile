FROM node:22-alpine

WORKDIR /app

# ponytail: npm install (not ci) — host/container npm versions differ on transitive resolution (yaml), ci fails the sync check
COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 3000

# CHOKIDAR_USEPOLLING is set via docker-compose for Linux hot reload
CMD ["npm", "start"]