# path: Dockerfile
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install production dependencies
COPY package*.json ./
RUN npm ci --production

# Copy source
COPY . .

# Build step if needed (none for now)
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
