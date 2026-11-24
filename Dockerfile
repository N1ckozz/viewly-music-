# VIEWLY Music — source-based staging image. No zip extraction and no copied demo data.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json server.js mfa.js ./
COPY public ./public
COPY tests ./tests
RUN node --test tests/*.test.js
RUN mkdir -p /app/data /app/uploads && chown -R node:node /app
USER node
ENV NODE_ENV=production PORT=4179 VIEWLY_DATA_DIR=/app/data VIEWLY_UPLOAD_DIR=/app/uploads
EXPOSE 4179
HEALTHCHECK --interval=30s --timeout=6s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
