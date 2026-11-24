# VIEWLY Music — source-based staging image. No zip extraction and no copied demo data.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates gosu \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json server.js mfa.js admin-core.js auth-mail.js billing-core.js sandbox-campaigns.js social-oauth.js creator-campaigns.js cpm-watchdog.js ./
COPY public ./public
COPY tests ./tests
COPY scripts ./scripts
RUN node --test --test-concurrency=2 tests/*.test.js
RUN mkdir -p /app/data /app/uploads && chown -R node:node /app && chmod 755 /app/scripts/entrypoint.sh
USER root
ENV NODE_ENV=production PORT=4179 VIEWLY_DATA_DIR=/app/data VIEWLY_UPLOAD_DIR=/app/uploads
EXPOSE 4179
HEALTHCHECK --interval=30s --timeout=6s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
