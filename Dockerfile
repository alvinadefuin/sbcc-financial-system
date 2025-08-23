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

# Create database directory
RUN mkdir -p /tmp

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]