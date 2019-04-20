const { observable, computed, action, autorun, decorate } = require('mobx');
let db;
const XDate = require('xdate');
const Logit = require('logit');
var logit = Logit(__filename);

class PaymentsSummaryStore {
  constructor() {
    this.loaded = false;
    this.lastPaymentsBanked = '';
    this.openingCredit = 0;
    this.openingDebt = 0;
    this.paymentsLogsLimit;
    this.currentPeriodStart;
    this.id;
    // this.previousUnclearedBookings;
    this.bankMoney = this.bankMoney.bind(this);
    this.changeBPdoc = this.changeBPdoc.bind(this);
    this.changeDoc = this.changeDoc.bind(this);

    autorun(() => {
      logit('activeAccountId set:', this.activeAccountId);
      // if (this.activeAccountId === null)debugger;
    });
    autorun(() => logit('autorun loaded', this.loaded));
  }

  get periodStartDate() {
    logit('periodStartDate', this.lastPaymentsBanked, this);
    return new XDate(this.lastPaymentsBanked).toString('ddd dd MMM');
  }

  changeBPdoc(doc) {
    if (doc.doc) doc = doc.doc;
    this.lastPaymentsBanked = doc.endDate;
    this.openingCredit = doc.closingCredit;
    this.openingDebt = doc.closingDebt;
    this.currentPeriodStart = doc.currentPeriodStart;
    // this.previousUnclearedBookings = doc.unclearedBookings;
    this.id = doc._id;
    logit('changeBPdoc', doc, this.lastPaymentsBanked, this.currentPeriodStart);
  }

  /*------------------------------------------------------------------------*/
  /* replication has a new or changed account document                      */
  /*------------------------------------------------------------------------*/

  changeDoc({ deleted, doc, id, ...rest }) {
    logit('changeDoc', {
      deleted,
      doc,
      id,
      rest,
    });
    if (deleted) return;
    if (id <= this.id) return;
    this.changeBPdoc(doc);
  }

  async bankMoney(doc) {
    delete doc.accounts;
    delete doc.cLogs;
    doc.payments = doc.payments.map(pymnt => {
      const { accId, accName, paymentsMade } = pymnt;
      return { accId, accName, paymentsMade };
    });
    logit('bankMoney', doc);
    await db.put(doc);
    this.changeBPdoc(doc);
  }

  async init(dbset) {
    db = dbset;
    const opts = {
      descending: true,
      limit: 1,
      include_docs: true,
      startkey: 'BP9999999',
      endkey: 'BP00000000',
    };
    // const data = await db.allDocs({include_docs: true, conflicts: true, startkey: 'W', endkey: 'W9999999' });
    let dataBP = await db.allDocs(opts);
    if (!dataBP.ok) dataBP = await db.allDocs(opts);
    logit('load datasummaries', dataBP);
    if (dataBP.rows.length > 0) this.changeBPdoc(dataBP.rows[0].doc);
    this.loaded = true;

    // runInAction('update state after fetching data', () => {
    // });
  }
}
decorate(PaymentsSummaryStore, {
  loaded: observable,
  lastPaymentsBanked: observable,
  openingCredit: observable,
  openingDebt: observable,
  paymentsLogsLimit: observable,
  currentPeriodStart: observable,
  id: observable,
  periodStartDate: computed,
  changeBPdoc: action,
  changeDoc: action,
  bankMoney: action,
  init: action,
});
const paymentsSummaryStore = new PaymentsSummaryStore();

module.exports = paymentsSummaryStore;
