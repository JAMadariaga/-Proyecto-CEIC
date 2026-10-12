FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN cd backend && npm install
RUN cd frontend && npm install

# Copy source files
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Build React app
RUN cd frontend && npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "backend/server.js"]
