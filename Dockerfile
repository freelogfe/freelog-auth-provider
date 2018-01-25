FROM daocloud.io/node:8.5

MAINTAINER yuliang <yu.liang@freelog.com>

RUN mkdir -p /data/freelog-auth-provider

WORKDIR /data/freelog-auth-provider

COPY . /data/freelog-auth-provider

RUN npm install

#ENV
#VOLUME ['/opt/logs','/opt/logs/db','/opt/logs/koa','/opt/logs/track']

ENV NODE_ENV test
ENV EGG_SERVER_ENV test
ENV PORT 7008

EXPOSE 7008

CMD [ "npm", "start" ]
