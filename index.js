/**
 * Created by yuliang on 2017/8/17.
 */

global.Promise = require('bluebird')

require('egg').startCluster({
    baseDir: __dirname,
    port: process.env.PORT || 7008,
    workers: 2
});