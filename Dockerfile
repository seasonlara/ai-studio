FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.js app.js index.html styles.css ./

ENV NODE_ENV=production
ENV PORT=8790

EXPOSE 8790

CMD ["node", "server.js"]
