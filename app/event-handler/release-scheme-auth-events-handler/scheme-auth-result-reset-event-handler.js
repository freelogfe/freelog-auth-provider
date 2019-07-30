'use strict'

const lodash = require('lodash')
const contractStatusEnum = require('../../enum/contract-status-enum')
const {ReleaseSchemeAuthChangedEvent} = require('../../enum/rabbit-mq-publish-event')

/**
 * 某些情况可能需要对方案授权信息进行重新计算,用以矫正授权结果
 * @type {module.ReleaseSchemeAuthResultResetEventHandler}
 */
module.exports = class ReleaseSchemeAuthResultResetEventHandler {

    constructor(app) {
        this.app = app
        this.contractProvider = app.dal.contractProvider
        this.releaseAuthResultProvider = app.dal.releaseAuthResultProvider
        this.releaseSchemeAuthRelationProvider = app.dal.releaseSchemeAuthRelationProvider
    }

    /**
     * 重新计算方案的授权状态
     * @param schemeId
     * @param operation 1:只重置自身合约授权情况 2:只重置上游发行授权情况 3:前两种都重置
     */
    async handler({schemeId, operation}) {

        const releaseSchemeAuthResult = await this.releaseAuthResultProvider.findOne({schemeId})
        if (!releaseSchemeAuthResult) {
            return
        }

        let {status, contractIsInitialized, selfIsAuth, upstreamIsAuth} = releaseSchemeAuthResult
        const resolveReleases = await this.releaseSchemeAuthRelationProvider.find({schemeId})

        const tasks = []
        if ((operation & 1) == 1) {
            tasks.push(this.getSchemeSelfAuthStatus(schemeId, resolveReleases).then(selfAuthStatus => selfIsAuth = selfAuthStatus === 1))
        }
        if ((operation & 2) == 2) {
            tasks.push(this.getUpstreamReleaseAuthStatus(schemeId, resolveReleases).then(upstreamAuthStatus => upstreamIsAuth = upstreamAuthStatus === 4))
        }

        const resetAuthStatus = await Promise.all(tasks).then(() => (selfIsAuth ? 1 : contractIsInitialized ? 2 : 0) | (upstreamIsAuth ? 4 : 7))

        if (resetAuthStatus !== status) {
            await this.releaseSchemeAuthChangedHandle(releaseSchemeAuthResult, resetAuthStatus)
        }
    }

    /**
     * 方案的授权结果发生变化事件
     * @param schemeId
     * @param resetAuthStatus
     * @returns {Promise<void>}
     */
    async releaseSchemeAuthChangedHandle(releaseSchemeAuthResult, resetAuthStatus) {

        const {isAuth, schemeId} = releaseSchemeAuthResult
        const schemeIsAuth = resetAuthStatus === 5 ? 1 : 0

        await this.releaseAuthResultProvider.updateOne({schemeId}, {
            status: resetAuthStatus, isAuth: schemeIsAuth
        })

        if (isAuth === schemeIsAuth) {
            return
        }

        await this.app.rabbitClient.publish(Object.assign({}, ReleaseSchemeAuthChangedEvent, {
            body: {schemeId, status: resetAuthStatus}
        }))
    }

    /**
     * 获取方案自身的授权情况
     * @returns {Promise<int>}
     */
    async getSchemeSelfAuthStatus(schemeId, resolveReleases) {

        const updateDate = new Date()
        const allContractIds = lodash.chain(resolveReleases).map(x => x.associatedContracts).flatten().map(x => x.contractId).value()
        const contractMap = await this.contractProvider.find({_id: {$in: allContractIds}})
            .then(list => new Map(list.map(x => [x.contractId, x])))

        const changedResolveReleases = []
        resolveReleases.forEach(resolveRelease => {
            let isChanged = false
            resolveRelease.associatedContracts.forEach(contract => {
                let newContractStatus = this._convertContractStatus(contractMap.get(contract.contractId).status)
                if (contract.contractStatus !== newContractStatus) {
                    isChanged = true
                    contract.updateDate = updateDate
                    contract.contractStatus = newContractStatus
                }
            })
            if (!isChanged) {
                return
            }
            changedResolveReleases.push(resolveRelease)
            resolveRelease.contractIsAuth = resolveRelease.associatedContracts.length && resolveRelease.associatedContracts.some(x => (x.contractStatus & 8) === 8) ? 1 : 0
        })

        if (changedResolveReleases.length) {
            const bulkWrites = changedResolveReleases.map(({resolveReleaseId, associatedContracts, contractIsAuth}) => Object({
                updateOne: {
                    filter: {schemeId, resolveReleaseId},
                    update: {associatedContracts, contractIsAuth}
                }
            }))
            this.releaseSchemeAuthRelationProvider.model.bulkWrite(bulkWrites).catch(console.error)
        }

        //签约,但是实际未使用的合约,在授权的过程中不予校验,默认获得授权
        return resolveReleases.some(x => x.resolveReleaseVersionRanges.length && !x.contractIsAuth) ? 2 : 1
    }


    /**
     * 计算上游发行的授权情况
     * @returns {Promise<int>}
     */
    async getUpstreamReleaseAuthStatus(schemeId, resolveReleases) {

        const {app} = this
        const resolveReleaseIds = [], releaseResolveReleaseVersionRanges = []

        resolveReleases.forEach(({resolveReleaseId, resolveReleaseVersionRanges}) => {
            resolveReleaseVersionRanges.forEach(versionRange => {
                resolveReleaseIds.push(resolveReleaseId)
                releaseResolveReleaseVersionRanges.push(versionRange)
            })
        })

        const releaseVersions = await app.curlIntranetApi(`${app.webApi.releaseInfo}/maxSatisfyingVersion?releaseIds=${resolveReleaseIds.toString()}&versionRanges=${releaseResolveReleaseVersionRanges.toString()}`)
        const schemeAuthResults = await this.releaseAuthResultProvider.find({$or: releaseVersions})

        return releaseVersions.some(x => x.version === null) || !schemeAuthResults.length || schemeAuthResults.some(x => !x.isAuth) ? 7 : 4
    }

    /**
     * 把合约的状态转换成关系链中规定的状态值
     * @param contractStatus
     * @returns {number}
     * @private
     */
    _convertContractStatus(contractStatus) {
        return contractStatus === contractStatusEnum.uninitialized ? -1 : contractStatus === contractStatusEnum.active ? 8 : 2
    }
}


/** 后续实现
 * step1.重新拉去方案所绑定的合约
 * step2.重新计算所有合约的实时授权状态
 * step3.重新计算方案所解决的上游发行的授权状态
 */