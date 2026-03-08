FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build args → environment variables for Vite
ARG VITE_API_BASE=/api
ARG VITE_DEFAULT_PERIOD=last_month
ARG VITE_PAGE_SIZE=200
ARG VITE_BASE_CURRENCY=EUR

ENV DOCKER_BUILD=1 \
    VITE_API_BASE=$VITE_API_BASE \
    VITE_DEFAULT_PERIOD=$VITE_DEFAULT_PERIOD \
    VITE_PAGE_SIZE=$VITE_PAGE_SIZE \
    VITE_BASE_CURRENCY=$VITE_BASE_CURRENCY

RUN npm run build

# --- Production ---
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
