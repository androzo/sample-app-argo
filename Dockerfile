FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js ./

ENV PORT=3000
EXPOSE 3000

USER node

CMD ["node", "index.js"]
