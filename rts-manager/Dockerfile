# RTS Manager Dockerfile
# Multi-stage build for production deployment

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source files
COPY . .

# Build frontend (Vite outputs to dist/)
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/dist ./dist

# Copy server files
COPY server ./server
COPY tsconfig.json ./

# Build server TypeScript (fail build if compilation errors)
RUN npx tsc --project server/tsconfig.json

# Create non-root user
RUN addgroup -g 1001 -S rts && \
    adduser -S -u 1001 -G rts rts

# Change ownership
RUN chown -R rts:rts /app

USER rts

# Expose port
EXPOSE 9091

# Environment variables
ENV NODE_ENV=production
ENV PORT=9091

# Health check (using node instead of wget for reliability)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:9091/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the server
CMD ["node", "dist/server/index.js"]
