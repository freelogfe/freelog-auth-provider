/**
 * Created by yuliang on 2017/8/16.
 */

'use strict'

const lodash = require('lodash')
const contractStatusEnum = require('../enum/contract-status-enum')

module.exports = app => {

    const mongoose = app.mongoose
    const toObjectOptions = {
        transform(doc, ret, options) {
            return Object.assign({contractId: doc.id}, lodash.omit(ret, ['_id', 'isTerminate']))
        }
    }

    const ContractSchema = new mongoose.Schema({
        contractName: {type: String, default: ''}, //合同名称
        partyOne: {type: String, required: true}, //甲方(发行ID)
        partyTwo: {type: String, required: true}, //乙方(发行ID或节点ID)
        partyOneUserId: {type: Number, required: true}, //甲方的用户主体ID
        partyTwoUserId: {type: Number, required: true}, //乙方的用户主体ID
        contractType: {type: Number, required: true}, //合约类型
        targetId: {type: String, required: true}, //策略的所属对象ID
        policyId: {type: String, required: true}, //策略ID
        nodeId: {type: Number, required: false, default: 0}, //节点ID,节点作为甲方或者乙方参与时,需要填
        remark: {type: String, default: ''}, //合同备注
        contractClause: { //合同条款
            authorizedObjects: {type: Array, required: true}, //授权对象
            isDynamicAuthentication: {type: Number, required: true}, //是否需要动态认证,例如是分组认证
            policyText: {type: String, required: true}, //策略原文
            fsmDeclarations: {}, //声明数据
            fsmStates: {},  //合同状态描述
            currentFsmState: {type: String, required: true, default: 'none'},
        },
        isDefault: {type: Number, default: 1, enum: [0, 1], required: true}, //是否是默认执行合同
        isTerminate: {type: Number, default: 0, enum: [0, 1], required: true},
        status: {type: Number, required: true, default: 1}, //默认未开始执行
    }, {
        versionKey: false,
        timestamps: {createdAt: 'createDate', updatedAt: 'updateDate'},
        toJSON: toObjectOptions,
        toObject: toObjectOptions
    })

    ContractSchema.virtual("contractId").get(function () {
        return this.id
    })

    ContractSchema.virtual("isActivated").get(function () {
        if (this.status === contractStatusEnum.active) {
            return true
        }
        const currentStateInfo = this.contractClause.fsmStates[this.contractClause.currentFsmState]
        return currentStateInfo && currentStateInfo.authorization.some(x => x.toLocaleLowerCase() === 'active')
    })

    ContractSchema.virtual("isActiveTestAuthorization").get(function () {
        const currentStateInfo = this.contractClause.fsmStates[this.contractClause.currentFsmState]
        return currentStateInfo && currentStateInfo.authorization.some(x => x.toLocaleLowerCase() === 'test-active')
    })

    ContractSchema.virtual("isLocked").get(function () {
        return this.status === contractStatusEnum.locked
    })

    /**
     * 获取合同状态机中的所有事件
     */
    ContractSchema.virtual("fsmEvents").get(function () {
        const events = []
        lodash.forIn(this.contractClause.fsmStates, (stateDescription, currentState) => lodash.forIn(stateDescription.transition, (eventInfo, nextState) => {
            if (!eventInfo) {
                return
            }
            eventInfo.nextState = nextState
            eventInfo.currentState = currentState
            events.push(eventInfo)
        }))
        return events
    })

    //同一个策略只有终止了才允许重签,此处唯一约束防止出现多分合同
    //ContractSchema.index({partyOne: 1, partyTwo: 1, policy: 1, isTerminate: 1}, {unique: true});

    return mongoose.model('contract', ContractSchema)
}
