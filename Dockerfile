# Use official Node.js runtime
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy backend package files and install dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install

# Copy all backend source code
COPY backend/ ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Create data directory within backend for database storage
RUN mkdir -p /app/backend/data && chmod 755 /app/backend/data

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]