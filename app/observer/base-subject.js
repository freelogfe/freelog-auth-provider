/**
 * Created by yuliang on 2017/9/20.
 */

'use strict'


module.exports = class Subject {

    constructor() {
        this.observers = []
    }

    /**
     * 注册观察者
     */
    registerObserver(observer) {
        this.observers.push(observer);
    }

    /**
     * 移除观察者
     */
    removeObserver(observer) {
        let index = this.observers.indexOf(observer)
        index > -1 && this.observers.splice(index, 1)
    }

    /**
     * 通知观察者
     */
    notifyObservers(...args) {
        this.observers.forEach(observer => {
            observer.update(...args)
        })
    }
}