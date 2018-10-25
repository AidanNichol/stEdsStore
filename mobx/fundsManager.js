const WS = require('./WalksStore');
const { sprintf } = require('sprintf-js');
const nbsp = '\u00A0';

module.exports = class FundsManager {
  constructor(trace) {
    this.owedForWalks = new Set();
    this.available = { '+': 0, T: 0, P: 0 };
    this.balance = 0;
    this.cashReceivedThisPeriod = 0;
    this.traceMe = Boolean(trace);
    // this.traceMe = true;
    this.activeThisPeriod = false;
    this.newFunds = 0;
    this.prevBalance = 0;
    this.payType = '?';
    this.realActivity = false;
    // this.addCredit = this.addCredit.bind(this);
    // this.addPayment = this.addPayment.bind(this);
    // this.allDone = this.allDone.bind(this);
    // this.useFunds = this.useFunds.bind(this);
    // this.showLog = this.showLog.bind(this);
    // this.showPaid = this.showPaid.bind(this);
  }
  get okToAddDummyPayments() {
    return (
      this.newFunds === this.balance && this.realActivity
      // this.newFunds === this.available['P'] + this.available['T'] && this.realActivity
    );
  }
  applyToThisWalk(logs, outstanding) {
    // let text = [logs[0].walkId, logs[0].text, ...logs.map(log => log.req)].join(' ');
    // const sum = logs.reduce((sum, log) => sum + (log.amount || 0), 0);
    // console.log('check ', sum, text);
    let booking;
    logs.forEach(log => {
      this.realActivity = this.realActivity || log.amount !== 0;
      if (/^[BC]$/.test(log.req)) {
        booking = booking || log;
      } else if (booking && log.req === booking.req + 'X') {
        booking.ignore = true;
        log.ignore = true;
        this.showLog(booking);
        this.showLog(log);
        booking = undefined;
      } else if (/^[BC]X$/.test(log.req)) {
        this.addCredit(log);
      }
    });
    if (booking && booking.amount > 0) {
      booking.chargable = true;
      if (this.balance - booking.amount >= 0) {
        this.useFunds(booking);
        return true;
      } else {
        this.showLog(booking, '💰👎🏼');
        // console.log( booking.dat, booking.text, booking.amount, this.balance, 'not enough funds', );
      }
      outstanding && (booking.outstanding = true);
      return false;
    }
    return true;
  }

  addCredit(log) {
    if (!log.ignore) {
      this.available['+'] += Math.abs(log.amount);
      this.balance = Object.values(this.available).reduce((sum, it) => sum + it, 0);
      // this.applyFunds(log.activeThisPeriod || false);
    }

    this.showLog(log);
  }

  addPayment(log) {
    this.realActivity = false;
    let amount = Math.abs(log.amount) * (log.req[1] === 'X' ? -1 : 1);
    if (log.activeThisPeriod && log.req[0] === 'P') {
      this.cashReceivedThisPeriod += amount;
    }
    if (!this.activeThisPeriod && log.activeThisPeriod) {
      this.transferSurplusToCredit();
      this.activeThisPeriod = log.activeThisPeriod;
    }
    if (amount !== 0) this.available[log.req[0]] += amount;
    this.prevBalance = this.balance;
    this.prevFunds = this.available['P'] + this.available['T'];
    this.payType = log.req[0];
    this.balance += amount;
    this.newFunds = amount;
    this.showLog(log, ' ', this.available);

    // this.applyFunds(log.activeThisPeriod);
  }
  transferSurplusToCredit() {
    if (this.activeThisPeriod || this.available.P + this.available.T === 0) return;
    this.available['+'] += this.available.P + this.available.T;
    this.available.P = 0;
    this.available.T = 0;
    // this.showLog();
  }

  useFunds(log) {
    let owing = log.amount;
    Object.entries(this.available).forEach(([key, val]) => {
      if (!owing) return;
      const spend = Math.min(owing, val);
      log.paid[key] += spend;
      this.available[key] -= spend;
      owing -= spend;
      this.balance -= spend;
      if (key === 'P')
        log.activeThisPeriod = log.activeThisPeriod || this.activeThisPeriod;
    });
    this.showLog(log, '👍🏽');
    return;
  }

  /*-------------------------------------------------*/
  /*         Routines to help with debugging         */
  /*-------------------------------------------------*/
  showLog(log, what = nbsp) {
    if (!this.traceMe) return;
    if (!log) {
      console.log(sprintf('%-86s %s', ' ', this.showPaid(this.available)));
      return;
    }
    const showBool = (bool, label = bool) => (log[bool] ? label + ' ' : '');
    let walk = '';
    if (log.type === 'W') {
      if (WS.walks.get(log.walkId)) walk = WS.walks.get(log.walkId).names.code;
      else {
        walk = '?';
      }
    }
    if (log.name) walk += ' ' + log.name.substr(1, 4);
    var txt2 =
      showBool('hideable', 'hide') +
      showBool('activeThisPeriod', 'actv') +
      showBool('historic', 'hist') +
      showBool('ignore', 'ignr');
    // var txt3 = log.type === 'W' ? this.showPaid(log.paid || 0) : '';
    var txt3 = this.showPaid(log.paid || {});
    var txt = sprintf(
      '%s %.16s %-21s %2s Am:%3d Bal:%3d, Pd: %-6s, Av: %-7s%s %s',
      log.type === 'A' ? '\n' : '',
      log.dat,
      log.type === 'W' ? `${log.walkId} ${walk}` : 'Payment',
      log.req,
      log.amount || 0,
      this.balance,
      txt3,
      this.showPaid(this.available),
      txt2,
      what,
    );
    console.log(txt);
    // const resetColor = 'color: white; background: black';
    // if (log.type === 'A') console.log(' ');
    // console.log('%c%s %c%s', color, txt, resetColor, this.showPaid(this.available));
    return (
      sprintf('%-5s %.16s', '-' + what, log.dat) +
      (log.type === 'W'
        ? log.walkId
        : sprintf(`$' 11 $' 2 $' 4`, 'Payment', log.req, walk)) // eslint-disable-line no-irregular-whitespace
    );
  }

  showPaid(paid) {
    const xx = { P: '£', T: '₸', '+': '₢' };
    return Object.entries(paid)
      .filter(([, val]) => val !== 0)
      .map(([key, val]) => `${xx[key]}${val}`)
      .join(' ');
  }
};
// export default new FundsManager();
