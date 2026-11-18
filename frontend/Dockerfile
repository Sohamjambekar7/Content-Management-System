# syntax=docker/dockerfile:1.7

# ---- Stage 1: Build Angular application ----
FROM node:20-alpine AS builder
WORKDIR /app

ENV npm_config_onnxruntime_node_install_cuda=skip \
    ONNXRUNTIME_NODE_INSTALL_CUDA=skip

COPY package.json package-lock.json .npmrc ./
RUN npm ci --onnxruntime-node-install-cuda=skip

COPY . .

# Empty default uses same-origin Nginx /api proxy; pass full HTTPS URL if hosting API on another domain.
ARG BACKEND_API_URL=""
RUN node -e "const fs=require('fs');const url=process.argv[1]||'';fs.writeFileSync('src/environments/environment.ts','export const environment = { production: true, BACKEND_API_URL: '+JSON.stringify(url)+' };\n');" "${BACKEND_API_URL}"

RUN npm run build

# ---- Stage 2: Serve static assets with Nginx ----
FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache curl

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
