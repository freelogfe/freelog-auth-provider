/**
 * Created by yuliang on 2017/10/10.
 */

'use strict'

const _ = require('lodash')
const contractFsmHelper = require('./contract-fsm')
const contractFsmEvents = require('./contract-fsm-events')
const globalInfo = require('egg-freelog-base/globalInfo')

module.exports = {

    /**
     * 合同组合事件子事件处理
     * @param contractInfo
     * @param compoundEvents
     * @param subEventId
     * @param otherArgs
     * @returns {Promise.<void>}
     */
    async EventGroupHandler(contractInfo, compoundEvent, subEventId, ...otherArgs) {

        let condition = {
            contractId: contractInfo.contractId,
            groupEventId: compoundEvent.eventId
        }

        if (compoundEvent.eventId === subEventId) {
            errHandler(contractInfo, compoundEvent)
            return Promise.reject('复合事件不能直接触发执行')
        }

        let envetGroup = await globalInfo.app.dataProvider.contractEventGroupProvider.getEventGroup(condition)

        if (!envetGroup) {
            return Promise.reject("未找到有效的事件分组")
        }

        let awaitExecuteEvents = _.difference(envetGroup.taskEvents, envetGroup.executedEvents)

        if (!envetGroup.taskEvents.some(t => t === subEventId)) {
            return Promise.reject("未找到子事件信息")
        }



        //如果差集中没有当前事件,则该事件已经执行
        if (!awaitExecuteEvents.some(event => event === subEventId)) {

            let contractFsm = contractFsmHelper.getContractFsm(contractInfo, contractFsmEvents)

            console.log('开始执行组合事件:', compoundEvent.eventId, contractInfo.contractId)

            if (!contractFsm.can(compoundEvent.eventId)) {
                console.log(`合同不能执行${compoundEvent.eventId}事件`)
                console.log(contractFsm.state, contractFsm.transitions())
                return Promise.reject(`合同不能执行${compoundEvent.eventId}事件`)
            }

            return contractFsm.execEvent(compoundEvent, ...otherArgs)

            return Promise.reject("事件不能重复执行")
        }

        console.log('awaitExecuteEvents:' + awaitExecuteEvents.length)
        console.log('awaitExecuteEvents', envetGroup.taskEvents, envetGroup.executedEvents)

        await globalInfo.app.dataProvider.contractChangedHistoryProvider.addHistory(contractInfo.contractId, {
            fromState: contractInfo.fsmState,
            toState: contractInfo.fsmState,
            eventId: subEventId,
            triggerDate: globalInfo.app.moment().toDate()
        }).catch(console.log)

        //如果只有这一个待执行,则当前事件执行完毕.整个事件组即执行完毕
        if (awaitExecuteEvents.length === 1) {
            //如果事件分组中的所有子事件都执行完毕,则直接执行主事件
            let contractFsm = contractFsmHelper.getContractFsm(contractInfo, contractFsmEvents)

            console.log('开始执行组合事件:', compoundEvent.eventId, contractInfo.contractId)

            if (!contractFsm.can(compoundEvent.eventId)) {
                console.log(`合同不能执行${compoundEvent.eventId}事件`)
                console.log(contractFsm.state, contractFsm.transitions())
                return Promise.reject(`合同不能执行${compoundEvent.eventId}事件`)
            }

            return contractFsm.execEvent(compoundEvent, ...otherArgs)
        }

        return globalInfo.app.dataProvider.contractEventGroupProvider.updateEventGroup(condition, {
            $addToSet: {executedEvents: subEventId},
            status: envetGroup.status
        }).then(data => true)
    },

    async errHandler(contractInfo, compoundEvent) {
        let contractFsm = contractFsmHelper.getContractFsm(contractInfo, contractFsmEvents)

        if (!contractFsm.can(compoundEvent.eventId)) {
            console.log(`合同不能执行${compoundEvent.eventId}事件`)
            console.log(contractFsm.state, contractFsm.transitions())
            return Promise.reject(`合同不能执行${compoundEvent.eventId}事件`)
        }

        return contractFsm.execEvent(compoundEvent, ...otherArgs)
    }
}