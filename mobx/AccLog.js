const _ = require('lodash');
const { observable, action, computed, decorate } = require('mobx');
const Logit = require('logit');
var logit = Logit(__filename);
const DS = require('./DateStore');
const dateDisplay = require('./DateStore').dispDate;

logit('dateStore', DS);

const chargeFactor = {
  N: 0,
  // B: 1,
  // W: 0,
  // WX: 0,
  // WL: 0,
  // BX: -1,
  // BL: 0, // no credit
  _: 1,
  '+': -1,
  P: -1,
  T: -1,
  '+X': 1,
  PX: 1,
  TX: 1,
  // C: 0.5,
  // CX: -0.5,
  // CL: -0.5,
  // A: 0,
};
const requiredLogProperties = [
  'req',
  'machine',
  'dat',
  'who',
  'type',
  'dispDate',
  'accId',
  'note',
  'amount',
  'toCredit',
  'logsFrom',
  'oldLogs',
  'restartPoint',
];
class AccLog {
  constructor(log) {
    this.dat;
    this.who;
    this.machine;
    this.req = '';
    this.amount = 0;
    this.note = '';
    this.updateLog = this.updateLog.bind(this);
    this.updateLog(log);
    // merge(this, log)
  }
  get mergeableLog() {
    let amount = this.amount * chargeFactor[this.req];
    return {
      ...this,
      amount,
      dispDate: dateDisplay(this.dat),
      text: this.note,
      type: 'A',
    };
  }

  get basicLog() {
    return _.pick(this, requiredLogProperties);
  }

  updateLog(data) {
    _.merge(this, data);
  }
}

decorate(AccLog, {
  req: observable,
  mergeableLog: computed,
  updateLog: action,
});
module.exports = AccLog;
