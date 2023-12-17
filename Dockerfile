FROM node:21

WORKDIR /usr/src/app

COPY ./src .

RUN npm install

CMD ["node", "server.js"]
