'use strict'

const lodash = require('lodash')
const Service = require('egg').Service
const authCodeEnum = require('../enum/auth-code')
const {ApplicationError} = require('egg-freelog-base/error')
const commonAuthResult = require('../authorization-service/common-auth-result')

module.exports = class PresentableAuthService extends Service {

    constructor({app}) {
        super(...arguments)
        this.contractProvider = app.dal.contractProvider
    }

    /**
     * presentable全部链路(用户,节点,发行)授权
     * @param presentableInfo
     * @param subReleaseInfo 子依赖(如果对子依赖授权,才需要传递该参数)
     * @param subReleaseVersion 子依赖版本号
     * @returns {Promise<*>}
     */
    async presentableAllChainAuth(presentableInfo) {

        const {ctx} = this
        const {userInfo} = ctx.request.identityInfo
        const {presentableId, isOnline, nodeId, userId} = presentableInfo

        if (!isOnline) {
            return new commonAuthResult(authCodeEnum.PresentableNotOnline)
        }

        const userContractAuthResult = await ctx.service.userContractAuthService.userContractAuth(presentableInfo, userInfo)
        if (!userContractAuthResult.isAuth) {
            return userContractAuthResult
        }

        const nodeInfoTask = ctx.curlIntranetApi(`${ctx.webApi.nodeInfo}/${nodeId}`)
        const presentableAuthTreeTask = ctx.curlIntranetApi(`${ctx.webApi.presentableInfo}/${presentableId}/authTree`)
        const nodeUserInfoTask = ctx.curlIntranetApi(`${ctx.webApi.userInfo}/${userId}`)
        const [nodeInfo, presentableAuthTree, nodeUserInfo] = await Promise.all([nodeInfoTask, presentableAuthTreeTask, nodeUserInfoTask])

        return this.presentableNodeAndReleaseSideAuth(presentableInfo, presentableAuthTree, nodeInfo, nodeUserInfo)
    }

    /**
     * 批量获取presentable发行和节点侧授权结果
     * @param presentableInfos
     * @param nodeInfo 目前需要多个presentable所属当前用的同一个节点,如果业务有调整,去掉限制即可
     * @returns {Promise<void>}
     */
    async batchPresentableNodeAndReleaseSideAuth(presentableInfos, nodeInfo) {

        const {ctx} = this
        const {userInfo} = ctx.request.identityInfo
        const presentableIds = presentableInfos.map(x => x.presentableId).toString()
        const presentableAuthTrees = await ctx.curlIntranetApi(`${ctx.webApi.presentableInfo}/authTrees?presentableIds=${presentableIds}`)
            .then(list => new Map(list.map(x => [x.presentableId, x])))

        const authTasks = presentableInfos.map(presentableInfo =>
            this.presentableNodeAndReleaseSideAuth(presentableInfo, presentableAuthTrees.get(presentableInfo.presentableId), nodeInfo, userInfo)
                .then(authResult => presentableInfo.authResult = authResult))

        return Promise.all(authTasks).then(() => presentableInfos.map(presentableInfo => lodash.pick(presentableInfo, ['presentableId', 'authResult'])))
    }

    /**
     * presentable发行和节点侧授权
     * @param presentableInfo
     * @param nodeInfo
     * @returns {Promise<void>}
     */
    async presentableNodeAndReleaseSideAuth(presentableInfo, presentableAuthTree, nodeInfo, nodeUserInfo) {

        const {ctx} = this

        if ([presentableInfo, presentableAuthTree, nodeInfo, nodeUserInfo].some(x => !x)) {
            throw new ApplicationError('参数错误', {presentableInfo, presentableAuthTree, nodeInfo, nodeUserInfo})
        }

        const releaseSideAuthTask = ctx.service.releaseContractAuthService.presentableReleaseSideAuth(presentableAuthTree)
        const nodeSideAuthTask = ctx.service.nodeContractAuthService.presentableNodeSideAuth(presentableInfo, presentableAuthTree, nodeInfo, nodeUserInfo)

        const [nodeSideAuthResult, releaseSideAuthResult] = await Promise.all([nodeSideAuthTask, releaseSideAuthTask])

        return nodeSideAuthResult.isAuth ? releaseSideAuthResult : nodeSideAuthResult
    }

    /**
     * presentable节点和发行侧授权概况信息
     * @param presentableInfo
     * @returns {Promise<void>}
     */
    async presentableNodeAndReleaseSideAuthSketch(presentableInfo) {

        const {ctx} = this
        //目前业务逻辑是presentable与登录用户一致
        const {userInfo} = ctx.request.identityInfo
        const {presentableId, nodeId} = presentableInfo

        const nodeInfoTask = ctx.curlIntranetApi(`${ctx.webApi.nodeInfo}/${nodeId}`)
        const presentableAuthTreeTask = ctx.curlIntranetApi(`${ctx.webApi.presentableInfo}/${presentableId}/authTree`)
        const [nodeInfo, presentableAuthTree] = await Promise.all([nodeInfoTask, presentableAuthTreeTask])

        const releaseSideAuthTask = ctx.service.releaseContractAuthService.presentableReleaseSideAuth(presentableAuthTree)
        const nodeSideAuthTask = ctx.service.nodeContractAuthService.nodeResolveReleaseContractSketch(presentableInfo, presentableAuthTree, nodeInfo, userInfo)

        //节点侧直接返回每个合同的授权结果,发行的方案侧直接返回方案的授权结果(不具体到每个合约)
        const {authTree} = presentableAuthTree
        const [nodeResolveReleasesSketch, releaseSideAuthResult] = await Promise.all([nodeSideAuthTask, releaseSideAuthTask])

        const recursion = (parentSchemeId = '', deep = 1) => {
            return lodash.chain(authTree).filter(x => x['parentReleaseSchemeId'] === parentSchemeId && x.deep === deep)
                .groupBy(x => x.releaseId).values().map(getReleaseVersionAuthInfo).value()
        }

        const getReleaseVersionAuthInfo = (releaseVersions) => {
            let releaseInfo = lodash.chain(releaseVersions).first().pick(['releaseId', 'releaseName']).value()
            let authFailedReleaseSchemes = releaseSideAuthResult.data.authFailedReleaseSchemes || []
            releaseInfo.versions = releaseVersions.map(releaseVersion => {
                let {releaseId, version, releaseSchemeId, deep} = releaseVersion
                return {
                    version, isAuth: deep === 1 ?
                        nodeResolveReleasesSketch.find(x => x.releaseId === releaseId).contracts.some(x => x.isAuth)
                        : !authFailedReleaseSchemes.some(x => x.schemeId === releaseSchemeId),
                    children: recursion(releaseSchemeId, deep + 1),
                }
            })
            return releaseInfo
        }

        return recursion()
    }

    /**
     * 获取presentable依赖树
     * @param testResourceId
     * @param entityNid
     * @param isContainRootNode
     * @param maxDeep
     * @returns {Promise<*>}
     */
    async getPresentableDependencies(presentableId, entityNid, isContainRootNode = true, maxDeep = 100) {
        const {ctx} = this
        return ctx.curlIntranetApi(`${ctx.webApi.presentableInfo}/${presentableId}/dependencyTree?isContainRootNode=${isContainRootNode}&maxDeep=${maxDeep}&entityNid=${entityNid}`)
    }

    /**
     * 获取真实响应的实体(依赖可能被替换了,此时需要响应被替换过的,但是参数传入还是原始的ID或名称)
     * @param dependencies
     * @param subEntityId
     * @param subEntityName
     */
    async getRealResponseReleaseInfo(presentableId, parentEntityNid, subReleaseId, subReleaseName) {

        const dependencies = await this.getPresentableDependencies(presentableId, parentEntityNid, true, 3)
        if (!dependencies.length) {
            return null
        }

        const rootNodeInfo = dependencies[0]
        if (!subReleaseId && !subReleaseName) {
            return rootNodeInfo
        }

        var subDependencyChain = lodash.chain(rootNodeInfo.dependencies)
        if (subReleaseId) {
            subDependencyChain = subDependencyChain.filter(x => x.releaseId === subReleaseId)
        }
        if (subReleaseName) {
            subDependencyChain = subDependencyChain.filter(x => x.releaseName.toUpperCase() === subReleaseName.toUpperCase())
        }
        return subDependencyChain.first().value()
    }
}