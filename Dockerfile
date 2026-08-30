FROM node:20-alpine AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
# OPTIONAL (UI defaults only):
ARG VITE_ENTRA_CLIENT_ID=
ARG VITE_ENTRA_TENANT_ID=
ARG VITE_FOUNDRY_SCOPE=https://ai.azure.com/.default
RUN npm run build
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN npm --prefix server install --omit=dev
COPY server/ ./server/
COPY --from=web-build /app/web/dist ./web/dist
ENV PORT=8080
ENV SERVE_STATIC=true
ENV AUTH_ENABLED=false
EXPOSE 8080
CMD ["node", "server/index.js"]
