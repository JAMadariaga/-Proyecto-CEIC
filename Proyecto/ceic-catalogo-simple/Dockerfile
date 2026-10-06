FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN npm install
RUN cd client && npm install

# Copy source files
COPY server.js ./
COPY client/ ./client/

# Build React app
RUN cd client && npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
