/**
 * Created by yuliang on 2017/8/30.
 */

'use strict'

const moment = require('moment')
const resourceAuth = require('../../authorization-service/resource-auth')
const presentableAuth = require('../../authorization-service/presentable-auth')


module.exports = app => {
    return class HomeController extends app.Controller {

        /**
         * presentable授权检测
         * @returns {Promise.<void>}
         */
        async presentableAuthorization() {

            let presentable = ctx.request.body

            let presentableAuthResult = await presentableAuth.authorization(presentable, ctx.request.userId)
            let contractInfo = await ctx.service.contractService.getContract({_id: presentable.contractId})
            let resourceAuthResult = await resourceAuth.authorization(contractInfo)

            if ((presentableAuthResult.authCode === 1 || presentableAuthResult.authCode === 2) &&
                (resourceAuthResult.authCode === 1 || resourceAuthResult.authCode === 2)) {

                ctx.success({authCode: presentableAuthResult.authCode})

                ctx.cookies.set('authToken', '', {
                    httpOnly: true,
                    expires: moment().add(7, 'days').toDate()
                })
                return
            }

            ctx.success({
                authCode: 3,
                presentableAuthResult,
                resourceAuthResult
            })
        }
    }
}