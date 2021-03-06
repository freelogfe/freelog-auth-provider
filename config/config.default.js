'use strict';

const fs = require('fs')

module.exports = appInfo => {

    const config = {

        cluster: {
            listen: {
                port: 7008
            }
        },

        keys: '20ab72d9397ff78c5058a106c635f008',

        i18n: {
            enable: true,
            defaultLocale: 'zh-CN'
        },

        /**
         * 关闭安全防护
         */
        security: {
            xframe: {
                enable: false,
            },
            csrf: {
                enable: false,
            }
        },

        ua: {
            enable: true
        },

        bodyParser: {
            enable: true,
        },

        middleware: ['errorHandler', 'identityAuthentication'],

        mongoose: {
            url: "mongodb://127.0.0.1:27017/auth"
        },

        multipart: {
            autoFields: true,
            defaultCharset: 'utf8',
            fieldNameSize: 100,
            fieldSize: '100kb',
            fields: 10,
            fileSize: '100mb',
            files: 10,
            fileExtensions: [],
            whitelist: (fileName) => true,
        },

        freelogBase: {
            retCodeEnum: {},
            errCodeEnum: {}
        },

        rabbitMq: {
            connOptions: {
                host: '192.168.164.165',
                port: 5672,
                login: 'guest',
                password: 'guest',
                authMechanism: 'AMQPLAIN',
                heartbeat: 120  //每2分钟保持一次连接
            },
            implOptions: {
                reconnect: true,
                reconnectBackoffTime: 20000  //10秒尝试连接一次
            },
            exchange: {
                name: 'freelog-contract-exchange',
            },
            queues: [
                {
                    name: 'auth#contract-event-receive-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-event-exchange',
                            routingKey: 'event.contract.trigger'
                        },
                        {
                            exchange: 'freelog-pay-exchange',
                            routingKey: 'event.payment.order'
                        }
                    ]
                },
                {
                    name: 'auth#event-register-completed-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-event-exchange',
                            routingKey: 'register.event.completed'
                        }
                    ]
                },
                {
                    name: 'auth#release-scheme-bind-contract-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-resource-exchange',
                            routingKey: 'release.scheme.bindContract'
                        }
                    ]
                },
                {
                    name: 'auth#release-scheme-created-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-resource-exchange',
                            routingKey: 'release.scheme.created'
                        }
                    ]
                },
                {
                    name: 'auth#release-scheme-auth-changed-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-contract-exchange',
                            routingKey: 'auth.releaseScheme.authStatus.changed'
                        }
                    ]
                },
                {
                    name: 'auth#release-scheme-auth-reset-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-contract-exchange',
                            routingKey: 'auth.releaseScheme.authStatus.reset'
                        }
                    ]
                },
                {
                    name: 'auth#release-contract-auth-changed-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-contract-exchange',
                            routingKey: 'contract.1.contractStatus.changed'
                        }
                    ]
                },
                {
                    name: 'auth#release-scheme-generate-auth-info-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-resource-exchange',
                            routingKey: 'release.scheme.generateAuthInfo'
                        }
                    ]
                },
                {
                    name: 'auth#node-contract-auth-changed-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-contract-exchange',
                            routingKey: 'contract.2.contractStatus.changed'
                        }
                    ]
                },
                {
                    name: 'auth#presentable-created-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-node-exchange',
                            routingKey: 'node.presentable.created'
                        }
                    ]
                },
                {
                    name: 'auth#presentable-bind-contract-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-node-exchange',
                            routingKey: 'node.presentable.bindContract'
                        }
                    ]
                },
                {
                    name: 'auth#presentable-auth-reset-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-contract-exchange',
                            routingKey: 'auth.presentable.authStatus.reset'
                        }
                    ]
                },
                {
                    name: 'auth#presentable-version-locked-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-node-exchange',
                            routingKey: 'node.presentable.versionLocked'
                        }
                    ]
                },
                {
                    name: 'auth#presentable-generate-auth-info-queue',
                    options: {autoDelete: false, durable: true},
                    routingKeys: [
                        {
                            exchange: 'freelog-node-exchange',
                            routingKey: 'node.presentable.generateAuthInfo'
                        }
                    ]
                },
            ]
        },

        rasSha256Key: {
            resourceAuth: {
                privateKey: fs.readFileSync('config/auth_key/private_key.pem').toString(),
                publicKey: fs.readFileSync('config/auth_key/public_key.pem').toString()
            }
        },

        clientCredentialInfo: {
            clientId: 1003,
            publicKey: 'a4fc45596a8ef4f6c65b0b6620811ead',
            privateKey: 'e394b36cd66c9c205f1e3304058ba4d4'
        },

        logger: {
            level: 'INFO'
        },

        customFileLoader: ['app/contract-service/contract-service.js', 'app/event-handler', 'app/mq-service']
    }

    return config;
};
