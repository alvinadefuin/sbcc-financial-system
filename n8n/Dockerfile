FROM n8nio/n8n:latest

# Set working directory
WORKDIR /home/node

# Set environment variables
ENV NODE_ENV=production
ENV N8N_PORT=5678
ENV DB_TYPE=sqlite

# Copy workflow templates (optional - for initial setup)
COPY workflows /workflows

# Expose port
EXPOSE 5678

# Use the default n8n entrypoint
CMD ["n8n", "start"]
