# Viewly Music staging build from the source archive uploaded by the owner.
# This file is intentionally in the repository root because GitHub currently
# contains the zip archive rather than the extracted source tree.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends unzip ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Viewly_Music_Railway_Staging.zip /tmp/viewly-music.zip
RUN mkdir -p /tmp/viewly-src \
    && unzip -q /tmp/viewly-music.zip -d /tmp/viewly-src \
    && cp -a /tmp/viewly-src/viewly-music/. /app/ \
    && rm -rf /tmp/viewly-src /tmp/viewly-music.zip \
    && mkdir -p /app/data /app/uploads \
    && chown -R node:node /app
USER node
ENV NODE_ENV=production PORT=4179 VIEWLY_DATA_DIR=/app/data VIEWLY_UPLOAD_DIR=/app/uploads
EXPOSE 4179
HEALTHCHECK --interval=30s --timeout=6s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
