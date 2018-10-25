const WS = require('./WalksStore');
const { sprintf } = require('sprintf-js');

const nbsp = '\u00A0';

module.exports = class FundsManager {
  constructor() {
    this.owedForWalks = new Set();
    this.available = { P: 0, T: 0, '+': 0 };
    this.cashReceivedThisPeriod = 0;
    this.traceMe = false;
    this.addWalk = this.addWalk.bind(this);
    this.addCredit = this.addCredit.bind(this);
    this.addPayment = this.addPayment.bind(this);
    this.allDone = this.allDone.bind(this);
    this.applyFunds = this.applyFunds.bind(this);
    this.useFunds = this.useFunds.bind(this);
    this.showLog = this.showLog.bind(this);
    this.showPaid = this.showPaid.bind(this);
  }

  addWalk(i, log) {
    if (log.billable) {
      log.owing = log.amount;
      log.paid = { P: 0, T: 0, '+': 0 };
      this.owedForWalks.add(log);
      this.applyFunds(log.activeThisPeriod);
    }
    this.showLog(i, log);
  }

  addCredit(i, log) {
    if (!log.ignore) {
      this.available['+'] += Math.abs(log.amount);
      this.applyFunds(log.activeThisPeriod || false);
    }

    this.showLog(i, log);
  }

  addPayment(i, log) {
    let amount = Math.abs(log.amount) * (log.req.length > 1 ? -1 : 1);
    if (log.activeThisPeriod && log.req[0] === 'P') {
      this.cashReceivedThisPeriod += amount;
    }
    this.available[log.req] += amount;

    this.showLog(i, log, ' ', this.available);

    this.applyFunds(log.activeThisPeriod);

    // if this isn't a current payment then transfer all remaining amounts to credits
    if (!log.activeThisPeriod) {
      ['P', 'T'].forEach(key => {
        this.available['+'] += this.available[key];
        this.available[key] = 0;
      });
    }
  }

  allDone() {
    this.owedForWalks.forEach(log => (log.outstanding = true));
  }

  applyFunds(activeThisPeriod) {
    this.owedForWalks.forEach(oLog => {
      Object.keys(this.available).forEach(key => {
        this.available[key] = this.useFunds(
          oLog,
          this.available[key],
          key,
          activeThisPeriod,
        );
      });
    });
  }

  useFunds(log, amount, type, activeThisPeriod) {
    if (amount <= 0 || !log) return amount;
    const spend = Math.min(log.owing || 0, amount);
    log.owing -= spend;
    log.activeThisPeriod = activeThisPeriod;
    log.paid[type] += spend;
    if (log.owing === 0) this.owedForWalks.delete(log);
    amount -= spend;
    this.showLog(0, log, '*', this.available);
    return amount;
  }

  /*-------------------------------------------------*/
  /*         Routines to help with debugging         */
  /*-------------------------------------------------*/
  showLog(i, log, what = nbsp) {
    if (!this.traceMe) return;
    var color = log.type === 'A' ? 'blue' : log.owing === 0 ? 'green' : 'red';
    if (log.ignore) color = 'black';
    color = 'color: ' + color;
    const showBool = (name, show = name) => (log[name] ? show + ' ' : '');
    let walk = '';
    if (log.type === 'W') {
      if (WS.walks.get(log.walkId)) walk = WS.walks.get(log.walkId).names.code;
      else {
        walk = '?';
      }
    }
    var txt2 =
      showBool('hideable', 'hide') +
      showBool('activeThisPeriod', 'actv') +
      showBool('historic', 'hist') +
      showBool('ignore', 'ignr');
    var txt3 =
      log.type === 'W'
        ? sprintf('Owe:%3d %10s', log.owing || 0, this.showPaid(log.paid || 0))
        : '';
    var txt = sprintf(
      '%2s%.1s %.16s %-16s %2s A:%3d B:%3d, %-18s, %12s',
      i,
      what,
      log.dat,
      log.type === 'W' ? `${log.walkId} ${walk}` : 'Payment',
      log.req,
      log.amount || 0,
      log.balance || 0,
      txt3,
      txt2,
    );
    console.log(
      '%c%s %c%s',
      color,
      txt,
      'color: white; background: black',
      this.showPaid(this.available),
    );
    return (
      `${(i + what).padStart(3)} ${log.dat.substr(0, 16)} ` +
      (log.type === 'W' ? log.walkId : 'Payment'.padEnd(11, nbsp)) +
      ` ${log.req.padEnd(2, nbsp)} ${walk.padEnd(4, nbsp)} `
    );
  }

  showPaid(paid) {
    const xx = { P: '£', T: 'T', '+': 'Cr' };
    let txt = '';
    Object.keys(paid || {}).forEach(key => {
      if (paid[key] != 0) txt += xx[key] + ': ' + paid[key] + ' ';
    });
    return (txt.length > 0 ? ' ' : '') + txt;
  }
};
// export default new FundsManager();
