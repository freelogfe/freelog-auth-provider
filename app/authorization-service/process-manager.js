'use strict'

const authCodeEnum = require('../enum/auth_code')
const errAuthCodeEnum = require('../enum/auth_err_code')
const commonAuthResult = require('./common-auth-result')
const globalInfo = require('egg-freelog-base/globalInfo')
const identityAuthentication = require('./identity-authentication/index')
const userContractAuthorization = require('./contract-authorization/user-contract-auth')
const nodeContractAuthorization = require('./contract-authorization/node-contract-auth')
const resourcePolicyAuthorization = require('./policy-authentication/resource-policy-auth')
const presentablePolicyAuthorization = require('./policy-authentication/presentable-policy-auth')
const JsonWebToken = require('egg-freelog-base/app/extend/helper/jwt_helper')
const resourceAuthJwt = new JsonWebToken()

const AuthProcessManager = class AuthProcessManager {

    constructor() {
        this.app = globalInfo.app
        this.dataProvider = globalInfo.app.dataProvider
        resourceAuthJwt.publicKey = globalInfo.app.config.rasSha256Key.resourceAuth.publicKey
        resourceAuthJwt.privateKey = globalInfo.app.config.rasSha256Key.resourceAuth.privateKey
    }

    /**
     * presentable授权
     * @param presentableInfo
     * @param userInfo
     * @param nodeInfo
     * @param userContractInfo
     * @returns {Promise<void>}
     */
    async presentableAuthorization({presentableInfo, userInfo, nodeInfo, userContract}) {

        try {
            if (!presentableInfo || !nodeInfo) {
                throw new Error('授权服务接口presentable接收到的参数错误')
            }
            //如果有登陆用户,则使用用户的合同,否则尝试使用虚拟合同授权
            let userContractAuthorizationResult = !userInfo
                ? this.virtualContractAuthorization({presentableInfo})
                : this.userContractAuthorization({userContract, userInfo})

            userContractAuthorizationResult.data.presentableId = presentableInfo.presentableId

            if (userInfo && userContractAuthorizationResult.authErrCode === errAuthCodeEnum.notFoundUserContract) {
                presentableInfo.policy.forEach(policySegment => {
                    policySegment.identityAuthenticationResult = this.presentablePolicyIdentityAuthentication({
                        policySegment, userInfo
                    }).isAuth
                })
                userContractAuthorizationResult.data.presentableInfo = presentableInfo
            }

            if (!userContractAuthorizationResult.isAuth) {
                return userContractAuthorizationResult
            }

            let nodeContract = await this.dataProvider.contractProvider.getContractById(presentableInfo.contractId)
            let nodeContractAuthorizationResult = this.nodeContractAuthorization({nodeContract, nodeInfo})
            if (!nodeContractAuthorizationResult.isAuth) {
                return nodeContractAuthorizationResult
            }

            userContractAuthorizationResult.data.authToken = {
                userId: userInfo ? userInfo.userId : 0,
                nodeId: nodeInfo.nodeId,
                presentableId: presentableInfo.presentableId,
                nodeContractId: presentableInfo.contractId,
                userContractId: userContract ? userContract.contractId : null,
                resourceId: presentableInfo.resourceId
            }

            userContractAuthorizationResult.data.authToken.signature = resourceAuthJwt.createJwt(userContractAuthorizationResult.data.authToken, 1296000)

            return userContractAuthorizationResult
        } catch (e) {
            let result = new commonAuthResult(authCodeEnum.Exception)
            result.authErrCode = errAuthCodeEnum.exception
            e.data && Object.assign(result.data, e.data)
            result.addError(e.toString())
            return result
        }
    }

    /**
     * 用户合同身份认证与授权
     * @param policy
     * @param userInfo
     */
    userContractAuthorization({userContract, userInfo}) {

        let userContractAuthorizationResult = userContractAuthorization.auth({userContract})

        if (!userContractAuthorizationResult.isAuth) {
            return userContractAuthorizationResult
        }

        if (!userInfo || userContract.partyTwo !== userInfo.userId || userContract.contractType !== this.app.contractType.PresentableToUer) {
            throw new Error('参数错误,数据不匹配')
        }

        let identityAuthenticationResult = identityAuthentication.presentablePolicyIdentityAuth({
            userInfo,
            policy: userContract.policySegment
        })

        if (!identityAuthenticationResult.isAuth) {
            return identityAuthenticationResult
        }

        return userContractAuthorizationResult
    }

    /**
     * 节点合同身份认证与授权
     * @param nodeContract
     * @param nodeInfo
     */
    nodeContractAuthorization({nodeContract, nodeInfo}) {

        let nodeContractAuthorizationResult = nodeContractAuthorization.auth({nodeContract})

        if (!nodeContractAuthorizationResult.isAuth) {
            return nodeContractAuthorizationResult
        }

        if (!nodeInfo || nodeContract.partyTwo !== nodeInfo.nodeId || nodeContract.contractType !== this.app.contractType.ResourceToNode) {
            throw new Error('参数错误,数据不匹配')
        }

        let nodeIdentityAuthenticationResult = identityAuthentication.resourcePolicyIdentityAuth({
            nodeInfo,
            policy: nodeContract.policySegment
        })

        if (!nodeIdentityAuthenticationResult.isAuth) {
            return nodeIdentityAuthenticationResult
        }

        return nodeContractAuthorizationResult
    }

    /**
     * 基于虚拟合同授权,即满足initial-terminate模式
     * @param presentableInfo
     * @param userInfo
     * @param nodeInfo
     */
    virtualContractAuthorization({presentableInfo, userInfo}) {

        let result = new commonAuthResult(authCodeEnum.BasedOnNodePolicy)

        let authPolicySegment = presentableInfo.policy.find(policySegment => {

            let presentablePolicyAuthorizationResult = presentablePolicyAuthorization.auth({policySegment})
            if (!presentablePolicyAuthorizationResult.isAuth) {
                return false
            }

            let identityAuthenticationResult = identityAuthentication.presentablePolicyIdentityAuth({
                userInfo: userInfo, policy: policySegment
            })
            if (!identityAuthenticationResult.isAuth) {
                return false
            }

            result.data.policySegment = policySegment
            return true
        })

        if (!authPolicySegment) {
            result.authCode = authCodeEnum.NodePolicyUngratified
            result.authErrCode = result.authErrCode || errAuthCodeEnum.presentablePolicyRefuse
            result.addError('未能通过presentable策略授权')
        }

        return result
    }

    /**
     * 基于资源策略对资源进行直接授权(非presentable模式)
     * 用户资源预览或者类似于license的资源
     * @param presentableInfo
     * @param userInfo
     */
    resourcePolicyAuthorization({resourcePolicy, nodeInfo, userInfo}) {

        let result = new commonAuthResult(authCodeEnum.BasedOnResourcePolicy)

        let authPolicySegment = resourcePolicy.policy.find(policySegment => {

            let resourcePolicyAuthorizationResult = resourcePolicyAuthorization.auth({policySegment})
            if (!resourcePolicyAuthorizationResult.isAuth) {
                return false
            }

            let identityAuthenticationResult = identityAuthentication.resourcePolicyIdentityAuth({
                nodeInfo: nodeInfo, policy: policySegment
            })
            if (!identityAuthenticationResult.isAuth) {
                return false
            }

            result.data.policySegment = policySegment
            return true
        })

        if (!authPolicySegment) {
            result.authCode = authCodeEnum.ResourcePolicyUngratified
            result.authErrCode = result.authErrCode || errAuthCodeEnum.resourcePolicyRefuse
            result.addError('未能通过资源策略授权')
            return result
        }

        result.data.authToken = {
            userId: userInfo ? userInfo.userId : 0,
            nodeId: nodeInfo ? nodeInfo.nodeId : 0,
            resourceId: resourcePolicy.resourceId,
            segmentId: result.data.policySegment.segmentId
        }

        result.data.authToken.signature = resourceAuthJwt.createJwt(result.data.authToken, 1296000)

        return result
    }

    /**
     * 资源策略身份认证
     * @param policySegment
     * @param userInfo
     * @param nodeInfo
     */
    resourcePolicyIdentityAuthentication({policySegment, nodeInfo}) {
        return identityAuthentication.resourcePolicyIdentityAuth({
            nodeInfo: nodeInfo, policy: policySegment
        })
    }

    /**
     * presentable策略身份认证
     * @param policySegment
     * @param userInfo
     */
    presentablePolicyIdentityAuthentication({policySegment, userInfo}) {
        return identityAuthentication.presentablePolicyIdentityAuth({
            userInfo, policy: policySegment
        })
    }
}

module.exports = new AuthProcessManager()