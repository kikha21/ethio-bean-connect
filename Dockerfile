# Use Node.js 22 (matches your package.json requirement)
FROM node:22-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy application code
COPY . .

# Set environment variable for data directory (persistent volume)
ENV EBC_DATA_DIR=/data

# Expose port
EXPOSE 8080

# Start the server
CMD ["node", "platform/server.js"]
