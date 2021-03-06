/**
 * Created by yuliang on 2017/10/30.
 * 针对node授权,主要检测节点是否有权限使用resource
 */

'use strict'

const authCodeEnum = require('../../enum/auth-code')
const commonAuthResult = require('.././common-auth-result')
const {terminate} = require('../../enum/contract-status-enum')
const PolicyIdentityAuthHandler = require('../identity-authentication/index')

module.exports = class NodeContractAuthHandler {

    constructor(app) {
        this.app = app
        this.policyIdentityAuthHandler = new PolicyIdentityAuthHandler(app)
    }

    /**
     * 节点合同授权处理
     * @param contract
     * @param partyTwoInfo
     * @param partyTwoUserInfo
     * @returns {module.CommonAuthResult|*}
     */
    async handle({contract, partyTwoInfo, partyTwoUserInfo}) {

        const authResult = new commonAuthResult(authCodeEnum.Default, {contract})

        if (contract.status === terminate) {
            authResult.authCode = authCodeEnum.NodeContractTerminated
            return authResult
        }

        if (this._getContractAuth(contract, 'active')) {
            authResult.authCode = authCodeEnum.BasedOnNodeContract
        } else {
            authResult.authCode = authCodeEnum.NodeContractNotActive
            return authResult
        }

        //如果身份认证为非动态认证,则直接通过(签约时已经确定)
        if (!contract.contractClause.isDynamicAuthentication) {
            return authResult
        }

        const identityAuthResult = await this._contractIdentityAuthentication(ctx, contract, partyTwoInfo, partyTwoUserInfo)
        if (identityAuthResult.authCode === authCodeEnum.PolicyIdentityAuthenticationFailed) {
            identityAuthResult.authCode = authCodeEnum.NodeContractIdentityAuthenticationFailed
        }
        if (!identityAuthResult.isAuth) {
            authResult.authCode = identityAuthResult.authCode
        }

        return authResult
    }

    /**
     * 节点合同测试授权
     * @param contract
     * @param partyTwoInfo
     * @param partyTwoUserInfo
     * @returns {Promise<*>}
     */
    async contractTestAuthHandle({contract, partyTwoInfo, partyTwoUserInfo}) {

        const authResult = new commonAuthResult(authCodeEnum.Default, {contract})

        if (contract.status === terminate) {
            authResult.authCode = authCodeEnum.NodeContractTerminated
            return authResult
        }

        if (this._getContractAuth(contract, 'test-active')) {
            authResult.testAuthCode = authCodeEnum.BasedOnNodeContractTestAuth
        } else {
            authResult.testAuthCode = authCodeEnum.NodeContractNotActiveTestAuthorization
        }

        if (this._getContractAuth(contract, 'active')) {
            authResult.authCode = authCodeEnum.BasedOnNodeContract
        } else {
            authResult.authCode = authCodeEnum.NodeContractNotActive
        }

        //如果正式授权和测试授权均不通过,则代表不通过
        if (!authResult.isAuth && !authResult.isTestAuth) {
            return authResult
        }

        //如果身份认证为非动态认证,则直接通过(签约时已经确定)
        if (!contract.contractClause.isDynamicAuthentication) {
            return authResult
        }

        const identityAuthResult = await this._contractIdentityAuthentication({
            contract,
            partyTwoInfo,
            partyTwoUserInfo
        })
        if (identityAuthResult.authCode === authCodeEnum.PolicyIdentityAuthenticationFailed) {
            identityAuthResult.authCode = authCodeEnum.NodeContractIdentityAuthenticationFailed
        }
        if (!identityAuthResult.isAuth) {
            authResult.authCode = identityAuthResult.authCode
        }

        return authResult
    }

    /**
     * 获取授权情况
     * @param contract
     * @param authName
     * @returns {*}
     * @private
     */
    _getContractAuth(contract, authName) {
        const contractClause = contract.contractClause || {}
        const currentStateInfo = contractClause.fsmStates[contractClause.currentFsmState]
        return currentStateInfo && Array.isArray(currentStateInfo.authorization) && currentStateInfo.authorization.some(x => x.toLocaleLowerCase() === authName)
    }

    /**
     * 合同身份授权
     * @param ctx
     * @param contract
     * @param partyTwoInfo
     * @param partyTwoUserInfo
     * @returns {Promise<*>}
     * @private
     */
    async _contractIdentityAuthentication({contract, partyTwoInfo, partyTwoUserInfo}) {

        const {contractClause, partyOneUserId} = contract

        return this.policyIdentityAuthHandler.handle({
            policySegment: contractClause, partyOneUserId, partyTwoInfo, partyTwoUserInfo
        })
    }
}