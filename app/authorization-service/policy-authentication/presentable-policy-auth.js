'use strict'

const AuthResult = require('../common-auth-result')
const authCodeEnum = require('../../enum/auth_code')
const authErrorCodeEnum = require('../../enum/auth_err_code')

/**
 * 基于资源分享策略授权
 * @param app
 * @returns {{}}
 */
module.exports.auth = ({policySegment}) => {

    let isInitialTerminatMode = policySegment.fsmDescription.length === 1
        && policySegment.activatedStates.some(m => m === policySegment.initialState)

    let authResult = new AuthResult(authCodeEnum.BasedOnResourcePolicy)
    if (!isInitialTerminatMode) {
        authResult.authCode = authCodeEnum.ResourcePolicyUngratified
        authResult.authErrCode = authErrorCodeEnum.resourcePolicyRefuse
        authResult.addError('资源策略不满足initial-terminat模式')
    }

    return authResult
}