FROM node:21

# Install direnv
RUN apt-get update && \
    apt-get install -y direnv

WORKDIR /usr/src/app

COPY ./src .

RUN npm install

CMD ["node", "server.js"]
