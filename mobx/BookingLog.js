const { merge } = require('lodash');
// const Logit = require( 'logit');
// var logit = Logit(__filename);
const { observable, computed, action, decorate } = require('mobx');
const dateDisplay = require('./DateStore').dispDate;

const chargeFactor = {
  N: 0,
  B: 1,
  W: 0,
  WX: 0,
  WL: 0,
  BX: -1,
  BL: 0, // no credit
  // '+': -1,
  // P: -1,
  // T: -1,
  // '+X': 1,
  // PX: 1,
  // TX: 1,
  C: 0.5,
  CX: -0.5,
  CL: -0.5,
  A: 0,
};
class BookingLog {
  constructor(log, accessors) {
    merge(this, accessors);
    this.dat;
    this.req = '';
    this.who;
    this.machine = '';
    this.updateLog = this.updateLog.bind(this);
    this.updateLog(log);
  }

  //  get totalPaid(){
  //
  // }

  updateLog(log) {
    merge(this, log);
  }

  get mergeableLog() {
    const walk = this.getWalk();
    const member = this.getMember();
    let extra = {
      type: 'W',
      walkId: walk._id,
      memId: member.memId,
      dispDate: dateDisplay(this.dat),
      accId: member.accountId,
      name: `[${member.firstName}]`,
    };
    extra.text = (walk.venue || '').replace(/\(.*\)/, '');
    if (this.req === 'A') {
      extra.text = `(${extra.text}) ${this.note || ''}`;
    } else {
      extra.amount = (walk.fee || 8) * chargeFactor[this.req];
    }
    const log = { ...this, ...extra };
    return log;
  }
}

decorate(BookingLog, {
  req: observable,
  updateLog: action,
  mergeableLog: computed,
});
module.exports = BookingLog;
