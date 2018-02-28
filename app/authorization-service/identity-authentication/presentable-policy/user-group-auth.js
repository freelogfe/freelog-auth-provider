/**
 * 用户分组策略认证检查
 */
'use strict'

const AuthResult = require('../../common-auth-result')
const authCodeEnum = require('../../../enum/auth_code')
const authErrorCodeEnum = require('../../../enum/auth_err_code')
const commonRegex = require('egg-freelog-base/app/extend/helper/common_regex')
const globalInfo = require('egg-freelog-base/globalInfo')

module.exports.auth = async ({policyAuthUsers, userInfo}) => {

    let authResult = new AuthResult(authCodeEnum.Default)
    let groupUserPolicy = policyAuthUsers.find(t => t.userType.toUpperCase() === 'GROUP')

    //如果没有分组认证的策略,则默认返回
    if (!groupUserPolicy) {
        return authResult
    }

    //如果存在所有访问者分组,则通过
    if (groupUserPolicy.users.some(item => item.toUpperCase() === 'PUBLIC')) {
        authResult.authCode = authCodeEnum.BasedOnGroup
        return authResult
    }

    //非全部访问者.又没有登录,则拒绝
    if (!userInfo) {
        authResult.authCode = authCodeEnum.UserObjectUngratified
        authResult.authErrCode = authErrorCodeEnum.notFoundUser
        authResult.data.groupUserPolicy = groupUserPolicy
        authResult.addError('未登陆的用户')
        return authResult
    }

    //所有登录用户都可以访问,则通过
    if (groupUserPolicy.users.some(item => item.toUpperCase() === 'REGISTERED_USERS')) {
        authResult.authCode = authCodeEnum.BasedOnGroup
        return authResult
    }

    let app = globalInfo.app
    let customGroups = groupUserPolicy.users.filter(item => commonRegex.userGroupId.test(item))
    // let existMemberGroups = await app.curl(`${app.config.gatewayUrl}/api/v1/groups/isExistMember?memberId=${userInfo.userId}&groupIds=${customGroups.toString()}`)
    //
    // if (existMemberGroups.length) {
    //
    // }

    authResult.authCode = authCodeEnum.UserObjectUngratified
    authResult.authErrCode = authErrorCodeEnum.identityAuthenticationRefuse
    authResult.data.groupUserPolicy = groupUserPolicy

    return authResult
}

