'use strict'

const Patrun = require('patrun')
const {RegisterEventToEventCenter, UnregisterEventFromEventCenter} = require('../../../enum/rabbit-mq-publish-event')

module.exports = class RegisterFsmEventHelper {

    constructor(app) {
        this.app = app
        this.patrun = Patrun()
        this.registerEventHandler()
    }

    /**
     * 获取允许注册的事件
     * @param contractInfo
     * @param currentState
     */
    getAllowedRegisterEvents(contractInfo, currentState) {
        return contractInfo.fsmEvents.filter(event => event.currentState === currentState && this.eventCodeAndRegisterNameMap[event.code])
    }

    /**
     * 注册合同当前状态下的所有事件
     * @param contractInfo
     * @param currentState
     * @param prevState
     */
    registerAndUnregisterContractEvents({contractInfo, currentState, prevFsmState}) {

        const allRegisterEvents = contractInfo.fsmEvents.reduce((acc, event) => {
            if (!event || !this.eventCodeAndRegisterNameMap[event.code]) {
                return acc
            }
            if (event.currentState === currentState) {
                this.registerEvent(contractInfo, event)
                acc.push(event)
            }
            if (event.currentState === prevFsmState) {
                this.unregisterEvent(contractInfo, event)
            }
            return acc
        }, [])

        return allRegisterEvents
    }


    /**
     * 注册事件到事件中心
     */
    registerEvent(contractInfo, eventInfo) {
        const registerHandler = this.patrun.find({eventCode: eventInfo.code, type: 'register'})
        registerHandler && registerHandler(contractInfo, eventInfo)
    }

    /**
     * 取消注册事件
     */
    unregisterEvent(contractInfo, eventInfo) {

        this.app.rabbitClient.publish({
            routingKey: UnregisterEventFromEventCenter.routingKey,
            eventName: this.eventCodeAndRegisterNameMap[eventInfo.eventCode],
            body: {
                eventRegisterNo: `${contractInfo.contractId}_${eventInfo.eventId}`,
                initiatorType: 1
            }
        })
    }

    /**
     * 注册周期结束事件
     */
    endOfCycleEventRegister(contractInfo, eventInfo) {

        const {timeUnit} = eventInfo.params

        const eventParams = {
            applyRegisterDate: new Date(),
            cycleCount: eventInfo.params.cycleCount,
        }

        this.sendRegisterEventToMessageQueue(contractInfo, eventInfo, eventParams)
    }

    /**
     * 时间事件注册
     */
    timeEventRegister(contractInfo, eventInfo) {
        const eventParams = {
            triggerDate: new Date(eventInfo.params.time)
        }
        this.sendRegisterEventToMessageQueue(contractInfo, eventInfo, eventParams)
    }

    /**
     * 相对时间事件注册
     */
    relativeTimeEventRegister(contractInfo, eventInfo) {
        const eventParams = {
            triggerDate: null  //此处为当前时间 增加 ....时间
        }
        this.sendRegisterEventToMessageQueue(contractInfo, eventInfo, eventParams)
    }

    /**
     * 授权次数事件
     */
    accessCountEvent(contractInfo, eventInfo) {
        const eventParams = {
            comparisonValue: eventInfo.params.targetCount,  //此处为授权次数参数
            comparisonOperator: 1
        }
        this.sendRegisterEventToMessageQueue(contractInfo, eventInfo, eventParams)
    }

    /**
     * 发送注册事件到rabbitMq
     */
    sendRegisterEventToMessageQueue(contractInfo, eventInfo, eventParams) {

        const baseParams = this._buildRegisterBaseParams(contractInfo, eventInfo)

        Object.assign(baseParams.body, eventParams)

        this.app.rabbitClient.publish(baseParams)
    }

    /**
     * 构建rabbitMq  注册事件基础参数
     * @private
     */
    _buildRegisterBaseParams(contractInfo, eventInfo) {

        const {contractId} = contractInfo
        const {eventId, eventCode} = eventInfo

        return {
            routingKey: RegisterEventToEventCenter.routingKey,
            eventName: this.eventCodeAndRegisterNameMap[eventCode],
            body: {
                initiatorType: 1, subjectId: contractId,
                eventRegisterNo: `${contractId}_${eventId}`,
                callbackParams: {contractId, eventId}
            }
        }
    }

    /**
     * 根据事件编码获取注册事件名称
     */
    get eventCodeAndRegisterNameMap() {
        return {
            A101: "endOfCycle",
            A102: "dateArrived",
            A103: "dateArrived",
            S301: "presentableConsumptionCountTallyEvent"
        }
    }

    /**
     * 注册状态机状态变更主题观察者
     */
    registerEventHandler() {

        const {patrun} = this

        patrun.add({eventCode: 'A101', type: 'register'}, this.endOfCycleEventRegister.bind(this))
        patrun.add({eventCode: 'A102', type: 'register'}, this.timeEventRegister.bind(this))
        patrun.add({eventCode: 'A103', type: 'register'}, this.relativeTimeEventRegister.bind(this))
        patrun.add({eventCode: 'S301', type: 'register'}, this.accessCountEvent.bind(this))
    }
}