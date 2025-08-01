FROM node:lts-alpine3.22 AS builder
WORKDIR /app

ARG PUBLIC_API_BASE=http://localhost:8000
ENV PUBLIC_API_BASE=${PUBLIC_API_BASE}

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM nginx:1.29-alpine

COPY --from=builder /app/build /usr/share/nginx/html
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/site.conf

EXPOSE 80
CMD ["nginx","-g","daemon off;"]
