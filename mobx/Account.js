// const mobx = require('mobx');
const { ipcRenderer } = require('electron');
let db;
const emitter = require('./eventBus');
const R = require('ramda');
const _ = require('lodash');

// const {sprintf} = require( 'sprintf-js');
const Logit = require('logit');
var logit = Logit(__filename);
const { observable, computed, toJS, reaction, action, decorate } = require('mobx');
const FundsManager = require('./fundsManager');
const FundsManager0 = require('./fundsManager0');
const MS = require('./MembersStore');
const WS = require('./WalksStore');
const DS = require('./DateStore');
const PS = require('./PaymentsSummaryStore');
let { useFullHistory } = require('StEdsSettings');
const { logger } = require('StEdsLogger');

const AccLog = require('./AccLog');
let limit;
logit('dateStore', DS);
const requiredLogProperties = [
  'req',
  'machine',
  'dat',
  'who',
  'type',
  'walkId',
  'memId',
  'dispDate',
  'accId',
  'name',
  'text',
  'amount',
  'toCredit',
  'logsFrom',
  'oldLogs',
  'restartPoint',
  'outstanding',
];

class Account {
  constructor(accountDoc, accessors, dbset) {
    db = dbset;
    this._id = 0;
    this.type = 'account';
    this._conflicts = [];
    this.members = accountDoc.members || [];
    this.logs = observable.map(
      {},
      {
        deep: false,
      },
    );
    // this.accountId;
    this.latePaymentLogs = [];

    this.logger;
    this.deleteMemberFromAccount = this.deleteMemberFromAccount.bind(this);
    this.mergeInAccount = this.mergeInAccount.bind(this);
    this.addMemberToAccount = this.addMemberToAccount.bind(this);
    this.updateDocument = this.updateDocument.bind(this);
    this.dbUpdate = this.dbUpdate.bind(this);
    _.merge(this, accessors);

    reaction(() => this.logs.size, () => logit('autorun', this.report, this.isLoading()));
    (accountDoc.logs || []).forEach(log => this.logs.set(log.dat, new AccLog(log)));
    delete accountDoc.logs;
    delete accountDoc.members;
    _.merge(this, accountDoc);
    // this.updateDocument(accountDoc);
    this.logger = logger.child({
      accId: `${this._id} - ${this.name}`,
    });
  }

  get accountStore() {
    return this.getAccountStore()();
  }

  // generate name for account based on members names in the account

  get name() {
    let nameMap = this.members.reduce((value, memId) => {
      let mem = MS.members.get(memId) || {
        firstName: '????',
        lastName: memId,
      };
      let lName = mem.lastName;
      value[lName] = [...(value[lName] || []), mem.firstName];
      return value;
    }, {});
    return Object.entries(nameMap)
      .map(([lName, fName]) => `${fName.join(' & ')} ${lName}`)
      .join(' & ');
  }

  get memberNames() {
    return this.members.map(memId => {
      let mem = MS.members.get(memId) || {
        firstName: '????',
        lastName: memId,
      };
      return mem.firstName + ' ' + mem.lastName;
    });
  }

  get sortname() {
    let nameMap = this.members.reduce((value, memId) => {
      let mem = MS.members.get(memId) || {
        firstName: '????',
        lastName: memId,
      };
      let lName = mem.lastName;
      value[lName] = [...(value[lName] || []), mem.firstName];
      return value;
    }, {});
    return Object.entries(nameMap)
      .map(([lName, fName]) => `${lName}, ${fName.join(' & ')}`)
      .join(' & ');
  }

  get report() {
    return `Account: ${this._id} ${this.name} ${this.logs.size} ${this.logs.get(
      Array.from(this.logs.keys()).pop(),
    )}`;
  }

  getConflictingDocs() {
    return `Account: ${this._id} ${this.venue}`;
  }

  /*------------------------------------------------------------------------*/
  /* modify the store with an updated account from the changes feed.        */
  /* - update the log record indiviually                                    */
  /* - delete from the store any log record that have been removed          */
  /* - mergeany other field changes ito the store                           */
  /*------------------------------------------------------------------------*/

  updateDocument(accountDoc) {
    // const added = R.difference(accountDoc.logs.map(log=>log.dat), this.logs.keys());

    (accountDoc.logs || []).forEach(log => {
      if (this.logs.has(log.dat)) this.logs.get(log.dat).updateLog(log);
      else this.logs.set(log.dat, new AccLog(log));
    });
    const deleted = R.difference(this.logs.keys(), accountDoc.logs.map(log => log.dat));
    deleted.forEach(dat => this.logs.delete(dat));
    delete accountDoc.logs;
    _.merge(this, accountDoc);
    return;
  }

  deleteMemberFromAccount(memId) {
    this.members.remove(memId);
    logit('deleteMemberFromAccount', `removing ${memId} from ${this._id}`);
    if (this.members.length === 0) {
      this._deleted = true;
      logit('deleteMemberFromAccount', 'deleting account: ${this._id}');
    }
    this.dbUpdate();
  }

  addMemberToAccount(memId) {
    this.members.push(memId);
    this.dbUpdate();
  }

  async mergeInAccount(otherAccount) {
    logit('mergeInAccount', otherAccount, this._id);
    otherAccount.logs.forEach(log => this.logs.set(log.dat, log));
    otherAccount.members.forEach(mem => {
      this.members.push(mem);
      MS.members.get(mem).updateAccount(this._id);
    });

    this.dbUpdate();
    otherAccount.members = [];
    otherAccount.logs.clear();
    otherAccount.dbUpdate();
  }

  async dbUpdate() {
    logit('DB Update start', this);
    const props = ['_id', '_rev', '_deleted', 'type', 'logs', 'members'];
    let newDoc = _.pick(toJS(this), props);
    newDoc.logs = Object.values(newDoc.logs)
      .sort(cmpDate)
      .map(basicLog);
    // .map(log => _.pick(log, requiredLogProperties));
    logit('DB Update', newDoc, newDoc._deleted, this);
    try {
      const res = await db.put(newDoc);
      if (!res.ok || res.error) {
        logit('db.put error', res);
        alert(
          'a problem occured trying to update the user account.\nError: ' +
            JSON.stringify(res) +
            '\nYour last change was not applied.\n' +
            'In order to ensure the consistency of the data the application will be reloaded once you click OK',
        );
        ipcRenderer.send('reload-main', {});
      }
      this._rev = res.rev;
    } catch (error) {
      logit('**** error ****', error);
    }
    // const info = await db.info();
    // logit('info', info);
    await emitter.emit('dbChanged', 'account changed');
  }

  async deleteConflictingDocs(conflicts) {
    let docs = conflicts.map(rev => {
      return {
        _id: this._id,
        _rev: rev,
        _deleted: true,
      };
    });
    let res = await db.bulkDocs(docs);
    logit('deleteConflicts', this, docs, conflicts, res);
    this._conflicts = [];
  }

  makePaymentToAccount({ paymentType: req, amount, note, inFull }) {
    // doer = yield select((state)=>state.signin.memberId);
    const who = 'M1180';
    var logRec = {
      dat: DS.logTime,
      who,
      req,
      type: 'A',
      amount,
      note,
      inFull,
    };
    this.logs.set(logRec.dat, new AccLog(logRec));
    const loggerData = {
      req,
      amount,
      inFull,
    };
    if (note && note !== '') loggerData.note = note;
    this.logger.info(loggerData, 'Payment');
    this.fixupAccLogs();
    this.dbUpdate();
  }

  insertPaymentsFromConflictingDoc(added) {
    let conflicts = this._conflicts;
    if (!_.isEmpty(added)) {
      Object.values(added).forEach(log => {
        var logRec = { ...log, note: (log.note || '') + ' (?)' };
        this.logs.set(logRec.dat, new AccLog(logRec));
      });
      // doer = yield select((state)=>state.signin.memberId);
      this.dbUpdate();
    }
    this.deleteConflictingDocs(conflicts);
  }
  deletePayment(dat) {
    this.logs.delete(dat);
    this.dbUpdate();
  }
  get dummyLogs() {
    return Array.from(this.logs.values()).filter(log => log.req[0] === '_');
  }
  get accountLogs() {
    // logit('accountLogs', this)
    return Array.from(this.logs.values())
      .filter(log => log.req !== 'A' && log.req !== 'S')
      .filter(log => !limit || log.dat < limit)
      .map(log => log.mergeableLog);
  }

  get accountFrame() {
    const members = new Map(
      this.members
        .map(memId => {
          return [
            memId,
            {
              memId,
              name: MS.members.get(memId).firstName,
            },
          ];
        })
        .sort(cmpName),
    );
    return {
      accId: this._id,
      members,
      sortname: this.sortname,
    };
  }

  get accountMembers() {
    return toJS(
      this.members.map(memId => {
        let mem = MS.members.get(memId);
        if (!mem) return {};
        return {
          memId: memId,
          firstName: mem.firstName,
          lastName: mem.lastName,
          suspended: mem.suspended,
          deleteState: mem.deleteState,
          showState: mem.showState,
          subs: mem.subsStatus.status,
          email: mem.email,
          roles: mem.roles,
        };
      }),
    );
  }

  trimOldAccountLogs(logs, currentPeriodStart) {
    logit('account:unclearedBookings', logs);
    for (var i = logs.length - 1; i >= 0; i--) {
      let log = logs[i];
      if (log.dat > currentPeriodStart) continue;
      if (log.inFull) {
        return logs.slice(i + 1);
      }
    }
    return logs;
  }

  get accountStatusNew() {
    logit('accountStore', this.getAccountStore());
    let traceMe = this._id === this.getAccountStore().activeAccountId;
    // traceMe = true;
    traceMe = false;
    var paymentPeriodStart = PS.lastPaymentsBanked;
    const historyStarts = WS.historyStarts;
    const prehistoryStarts = WS.prehistoryStarts;
    const darkAgesStarts = WS.darkAgesStarts;
    let walksAfter = WS.availableWalksStart;
    let useFullHistory = this.getAccountStore().useFullHistory;

    const setOldLogs = (aLog, clearedLogs) => {
      const oldLogs = _.filter(clearedLogs, 'prehistoric').map(basicLog);
      if (_.isEmpty(oldLogs)) return;
      aLog.oldLogs = oldLogs;
    };
    const setLogsFrom = (aLog, clearedLogs, unclearedLogs) => {
      const logs = _.reject(clearedLogs, 'prehistoric').map(basicLog);
      aLog.logsFrom = getOldestDate(logs, unclearedLogs);
    };
    const walkAndMember = log => log.walkId + log.memId;
    const dummyPayment = (cLogs, uLogs, final = false) => {
      let aLog = {
        type: 'A',
        amount: 0,
        text: '',
        machine: 'auto',
        balance: 0,
      };
      aLog.req = final ? '__' : '_';
      if (!final) aLog.restartPoint = true;
      aLog.dat = DS.datetimePlus1(getNewestDate(cLogs));
      aLog.dispDate = DS.dispDate(aLog.dat);
      setLogsFrom(aLog, cLogs, uLogs);
      setOldLogs(aLog, cLogs);
      return aLog;
    };
    const funds = new FundsManager(traceMe);
    let balance = 0;

    let bAllLogs = WS.allWalkLogsByAccount;
    let bLogs = bAllLogs[this._id] || [].sort(cmpDate);
    let aLogs = [...this.accountLogs].sort(cmpDate);
    if (!useFullHistory) {
      [aLogs, bLogs] = adjustToRestartPoint(aLogs, bLogs, darkAgesStarts);
    }
    // if (!useFullHistory) {
    //   let firstOKacc = findRestartPoint(aLogs, darkAgesStarts);

    //   if (firstOKacc >= 0) {
    //     aLogs = aLogs.slice(firstOKacc);
    //     const logsFrom = getOldestDate(_.map(aLogs, 'logsFrom'));
    //     const paymentsMade = aLogs.length > 0;
    //     bLogs = _.unionBy(
    //       bLogs.filter(log => !paymentsMade || log.dat >= logsFrom),
    //       _.map(aLogs, l => l.oldLogs || []),
    //       'dat',
    //     );
    //   }
    // }
    aLogs = aLogs.filter(log => log.req[0] !== '_');
    if (this.members.length <= 1) bLogs.forEach(log => (log.name = ''));
    if (traceMe) {
      logit('accountUpdateNew traceMe', this._id, walksAfter);
    }
    let activeThisPeriod = false;
    let historic = true;
    let hideable = true;
    const setSomeFlags = log => {
      log.activeThisPeriod = activeThisPeriod = log.dat > paymentPeriodStart;
      if ((log.walkId || '') > 'W' + historyStarts) {
        historic = false;
      }
      if ((log.walkId || '') > WS.lastClosed) hideable = false;
      if (!historic && log.walkId < 'W' + prehistoryStarts) log.prehistoric = true;
      if (log.dat < darkAgesStarts) log.darkage = true;
      return log;
    };
    const isRestartPoint = (balance, cleared, uncleared) => {
      const walks = logs => _.filter(logs, log => /[BC]X?/.test(log.type));
      return (
        balance === 0 && getNewestDate(walks(cleared)) < getOldestDate(walks(uncleared))
      );
    };
    let mergedlogs = [];

    while (aLogs.length > 0) {
      let clearedLogs = [];
      let prevBalance = balance;
      let aLog = aLogs.shift();
      setSomeFlags(aLog);
      funds.addPayment(aLog);
      // let restartPt = isRestartPoint(balance, mergedlogs, bLogs);

      // if (restartPt) (_.last(mergedlogs) || {}).restartPoint = true;

      let availBlogs = bLogs.filter(log => log.dat < aLog.dat);
      availBlogs = _.values(_.groupBy(walkSort(availBlogs), walkAndMember));
      bLogs = bLogs.filter(log => log.dat >= aLog.dat);
      /*
      ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      ┃   check all uncleared bookings logs                      ┃
      ┃   at the time of the payment and clear what we can       ┃
      ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ */
      while (availBlogs.length > 0) {
        let wLogs = availBlogs.shift(); // all current log records for a walk
        wLogs = wLogs.map(log => setSomeFlags(log));
        let paid = funds.applyToThisWalk(wLogs);

        if (!paid) {
          // not enough funds to clear this walk
          availBlogs.unshift(wLogs); // haven't used so put it back
          break;
        }
        clearedLogs.push(...wLogs);
        if (_.isEmpty(availBlogs) || !funds.okToAddDummyPayments) continue;
        if (!isRestartPoint(0, [mergedlogs, clearedLogs], [availBlogs, bLogs])) continue;
        //┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
        //┃   zero balance point reach using credits or the like     ┃
        //┃   Add dummy payment so we can record the restartPoint    ┃
        //┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
        prevBalance = resortAndAdjustBalance(
          clearedLogs,
          prevBalance,
          historic,
          hideable,
        );
        (_.last(clearedLogs) || {}).restartPoint = true;
        clearedLogs.push(dummyPayment(clearedLogs, availBlogs));
        funds.realActivity = false;
        // restartPt = true;
        mergedlogs.push(...clearedLogs.sort(cmpDate));
        clearedLogs = [];
      }
      //┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      //┃   re-sort the cleared logs into date order and recalulate balance ┃
      //┃   Return all unused booking logs to be available for next payment ┃
      //┃   Add the cleared logs to the output                              ┃
      //┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      const outOfSequence = availBlogs.length > 0;
      resortAndAdjustBalance(clearedLogs, prevBalance, historic, hideable);
      bLogs.unshift(
        ..._.flatten(availBlogs)
          .map(log => ({ ...log, outOfSequence }))
          .sort(cmpDate),
      );
      mergedlogs.push(...clearedLogs);
      // clearedLogs = [];
      //┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      //┃   Add in the payment record suitably ajdusted            ┃
      //┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      balance = funds.balance;
      aLog = { ...aLog, balance, toCredit: -balance, historic, hideable };
      setLogsFrom(aLog, clearedLogs, bLogs);
      setOldLogs(aLog, clearedLogs);
      let restartPt = isRestartPoint(balance, mergedlogs, bLogs);
      if (restartPt) aLog.restartPoint = true;

      if (balance !== 0) funds.transferSurplusToCredit();
      mergedlogs.push(aLog);
    }
    /*
    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    ┃               uncleared Bookings                         ┃
    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ */
    const newestClearedLog = getNewestDate(mergedlogs);
    let unclearedLogs = [];
    let holdBalance = funds.balance;
    bLogs = _.values(_.groupBy(walkSort(bLogs), walkAndMember));
    bLogs.forEach(wLogs => {
      funds.applyToThisWalk(wLogs, true);
    });
    bLogs = _.flattenDeep(bLogs);
    bLogs.sort(cmpDate);
    balance = holdBalance;

    while (bLogs.length > 0) {
      const bLog = bLogs.shift();
      if (isBooking(bLog) && balance !== 0) historic = false;
      // if (/^[BC]/.test(bLog.req)) historic = false;
      setSomeFlags(bLog);
      balance -= bLog.amount || 0;
      // bLog.hideable = hideable && balance === 0;
      // bLog.historic = historic;
      unclearedLogs.push({ ...bLog, balance });
      if (_.isEmpty(bLogs)) continue;
      if (!isRestartPoint(balance, [newestClearedLog, unclearedLogs], bLogs)) continue;
      if (!isBooking(bLog)) continue;
      _.last(unclearedLogs).restartPoint = true;
      setHistoricFlags(unclearedLogs, historic, hideable);

      unclearedLogs.push(dummyPayment(unclearedLogs, bLogs));
      mergedlogs.push(...unclearedLogs);
      unclearedLogs = [];
    }
    setHistoricFlags(unclearedLogs, historic, hideable);
    //┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    //┃   If we have prehistoric logs uncleared then add a       ┃
    //┃   special dummy payment to hold them                     ┃
    //┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    const aLog = dummyPayment(unclearedLogs, bLogs, balance !== 0);
    aLog.balance = balance;
    if (!_.isEmpty(unclearedLogs) && aLog.oldLogs) {
      unclearedLogs.push(aLog);
    }

    mergedlogs.push(...unclearedLogs);

    if (traceMe) {
      this.logTableToConsole(mergedlogs, 'accountUpdateNew mergedlogs');
    }
    let debt = [];

    if (balance !== 0) debt = mergedlogs.filter(log => log.outstanding);
    return {
      accId: this._id,
      balance,
      activeThisPeriod: activeThisPeriod || funds.activeThisPeriod,
      available: funds.available,
      paymentsMade: funds.cashReceivedThisPeriod,
      debt,
      logs: mergedlogs,
      accName: this.name,
      sortname: this.sortname,
    }; // lastHistory,
  }

  get accountStatus() {
    logit('accountStore', this.getAccountStore());
    let traceMe = this._id === this.getAccountStore().activeAccountId;
    // traceMe = true;
    var paymentPeriodStart = PS.lastPaymentsBanked;
    var currentPeriodStart = PS.currentPeriodStart;
    // var previousUnclearedBookings = PS.previousUnclearedBookings || {};
    let bookingLogs = WS.allWalkLogsByAccount[this._id] || [];
    let fullLogs = this.accountLogs
      .filter(l => l.req[0] !== '_')
      .concat(bookingLogs)
      .sort(cmpDate);
    let logs;
    if (useFullHistory) currentPeriodStart = null;
    if (currentPeriodStart) {
      bookingLogs = bookingLogs.filter(log => log.walkId > 'W' + currentPeriodStart);
      // .concat(previousUnclearedBookings[this._id] || []);
      // only 1 member in the account => no need to show member name in transaction
      if (this.members.length === 1) {
        bookingLogs.forEach(log => {
          delete log.name;
        });
      }
      logs = this.accountLogs
        .filter(l => l.req[0] !== '_')
        .concat(bookingLogs)
        .sort(cmpDate);
      logs = this.trimOldAccountLogs(logs, currentPeriodStart);
    } else {
      logs = fullLogs;
    }
    if (traceMe) {
      logit('accountStatus traceMe', this._id, currentPeriodStart);
      this.logTableToConsole(fullLogs, 'fullLogs');
      this.logTableToConsole(logs, 'logs');
    }
    // logit('accountStatus:logs', bookingLogs,logs)
    let balance = 0;
    let activeThisPeriod = false;
    let lastOK = -1;
    let lastHideable = -1;
    let walkPast = 'W' + DS.now.substr(0, 10);
    let currentFound = false;
    let oldBalancePoints = []; // Ids of past walks when we had a zero balance
    // const nbsp = "\u00A0";

    /*------------------------------------------------------------------------*/
    /*    first pass over the data to calculate the running balance and ...   */
    /*        hideable: account in balanced and no open walks involved        */
    /*        historic: account in balanced and all walks in the past         */
    /*        resolved: account in balanced and before start of current period*/
    /*------------------------------------------------------------------------*/
    let mostRecentWalk = '';
    let lastHistory = -1;
    let lastResolved = -1;
    logs = logs.sort(cmpDate).map((olog, i) => {
      const log = R.clone(olog);
      if (i > 0 && logs[i - 1].dat === log.dat && log.type === 'W') {
        log.duplicate = true;
        return log;
      }
      // pass annotation and subscription logs through un altered
      if (log.req === 'A') return log;
      if (log.req === 'S') return log;

      balance -= log.amount;
      log.balance = balance;
      if (log.dat > paymentPeriodStart) log.activeThisPeriod = true;
      if (log.dat > paymentPeriodStart) activeThisPeriod = true;
      if (log.type === 'W') {
        if (log.walkId > mostRecentWalk) mostRecentWalk = log.walkId;
        if (log.walkId > walkPast) currentFound = true;
      }
      if (balance === 0) {
        if (mostRecentWalk <= WS.lastClosed) {
          lastHideable = i;
          oldBalancePoints.push(mostRecentWalk);
        }
        if (!log.activeThisPeriod) lastResolved = i;
        if (!currentFound) lastHistory = i;
      }

      return log;
    });

    logs = logs.map((log, i) => ({
      ...log,
      historic: i <= lastHistory,
      hideable: i <= lastHideable,
    }));

    /*------------------------------------------------------------------------*/
    /*    second pass over the data to work out which walks were paid for     */
    /*    in this banking period.                                             */
    /*                                                                        */
    /*    Look at all records in this banking period back through to the last */
    /*    point were were in balance prior to the the last time we banked the */
    /*    money. If we have instance of a booking being made and cancelled    */
    /*    in this period then flag both entries so they can be ignored        */
    /*------------------------------------------------------------------------*/
    for (let i = logs.length - 1; i > lastResolved; i--) {
      let log = logs[i];
      if (log.req !== 'BX') continue;
      for (let j = i - 1; j > lastResolved; j--) {
        if (logs[j].req !== 'B') continue;
        if (logs[j].walkId !== log.walkId || logs[j].memId !== log.memId) continue;
        log.ignore = true;
        logs[j].billable = false;
        logs[j].ignore = true;
      }
    }
    traceMe && this.logTableToConsole(logs);
    traceMe &&
      logit('second pass', logs, {
        lastHistory,
        lastHideable,
        lastResolved,
      });

    /*------------------------------------------------------------------------*/
    /*    third pass over the data to work out whick walks were paid for      */
    /*    in this banking period and which walks still need to be paid for.   */
    /*                                                                        */
    /*    Work forward from the last resolved point gather up billable records*/
    /*    and then when funds become available either via a payment or a      */
    /*    cancellation allocate them to the walks. Once the walk is fully     */
    /*    paid it is removed from the list. Those left in the list at the end */
    /*    will still need to be paid for.                                     */
    /*                                                                        */
    /*    Note: activeThisPeriod is any log record recorded since the last    */
    /*          banking or any record affected by one of these.               */
    /*          e.g. a walk booked a while ago being paid for by new funds    */
    /*------------------------------------------------------------------------*/
    const fundsManager = new FundsManager0();
    // fundsManager.traceMe = this._id === 'A1180' || this._id === 'A2032';

    for (let i = lastResolved + 1; i < logs.length; i++) {
      let log = logs[i];
      // pass annotation and subscription logs through un altered
      if (log.req === 'A' || log.req === 'S' || log.duplicate) continue;

      if (log.type === 'W') {
        fundsManager.addWalk(i, log);
        if (log.req === 'BX' && !log.ignore) {
          fundsManager.addCredit(i, log);
        }
        continue;
      }
      // received funds so use on previous outstanding bookings
      if (log.type === 'A') {
        fundsManager.addPayment(i, log);
      }
    }
    fundsManager.allDone(); // anything still unpaid for will flagged as outstanding

    logs = logs
      // .map((log, i)=>({...log, historic: (i <= lastHistory), hideable: (i <= lastHideable), cloneable: (i>lastHistory && log.type === 'W' && log.walkId < walkPast && !log.clone) }))
      .filter(log => !log.duplicate);
    traceMe && this.logTableToConsole(logs);
    traceMe &&
      logit(
        'cashReceivedThisPeriod',
        fundsManager.cashReceivedThisPeriod,
        lastOK,
        paymentPeriodStart,
        this._id,
        this.name,
        logs,
      );
    let debt = [];

    if (balance !== 0) debt = logs.filter(log => log.outstanding);
    // logit('logs final', {accId: this._id, balance, debt, logs, lastHistory, accName: this.name, sortname});
    return {
      accId: this._id,
      balance,
      activeThisPeriod,
      available: fundsManager.available,
      paymentsMade: fundsManager.cashReceivedThisPeriod,
      debt,
      logs,
      lastHistory,
      accName: this.name,
      sortname: this.sortname,
    };
  }

  logTableToConsole(logs, text) {
    logit(text);
    logit.table(
      logs.map(log =>
        R.omit(
          ['note', 'accId', 'machine', 'who', 'dispDate', 'paid'],
          _.omitBy(log, _.isFunction),
        ),
      ),
    );
  }

  async fixupAccLogs(save = false) {
    // check current state against the account document and update the latter
    let changed = false;
    const mergedlogs = this.accountStatusNew.logs;
    const props = ['restartPoint', 'logsFrom', 'oldLogs'];
    let diffs = '';
    const comp = (nowRec, wasRec, key) => {
      const now = nowRec[key],
        was = wasRec[key];
      return now === was ? '' : `\n\t\t\t${key}: ${was} => ${now}`;
    };
    const comp2 = (nowRec, wasRec, key) => {
      const nowA = nowRec[key] || [],
        wasA = wasRec[key] || [];
      if (_.isEqual(nowRec, wasRec)) return '';
      const added = _.differenceBy(nowA, wasA, 'dat');
      const deled = _.differenceBy(wasA, nowA, 'dat');
      const report = (A, s) =>
        A.reduce((txt, I) => txt + `\n\t\t\t${s}${I.dat}: ${I.text} => ${I.name}`, '');
      return report(added, 'added ') + report(deled, 'deled ');
    };
    const whatsDifferent = (nowLog, wasLog) => {
      diffs = '';

      diffs += comp(nowLog, wasLog, 'restartPoint');
      diffs += comp(nowLog, wasLog, 'logsFrom');
      diffs += comp2(nowLog, wasLog, 'oldLogs');
      return diffs;
    };
    // check for dummy payments that have been removed
    _.differenceBy(this.dummyLogs, mergedlogs, 'dat').forEach(log => {
      this.logs.delete(log.dat);
    });
    for (const log of mergedlogs.filter(log => log.type === 'A')) {
      if (log.type !== 'A' || log.req === 'A') continue;
      let actLog = this.logs.get(log.dat);
      if (!actLog) {
        if (log.req[0] === '_') {
          this.logs.set(log.dat, new AccLog(log));
          const diffs = whatsDifferent(log, {});
          console.log(log.dat, log.req, log.amount, diffs);
          changed = true;
        }
        continue;
      }
      const newVal = _.pick(log, props);
      if (newVal.oldLogs) newVal.oldLogs = newVal.oldLogs.map(basicLog);
      if (_.isEqual(newVal, _.pick(actLog, props))) continue;
      const diffs = whatsDifferent(newVal, _.pick(actLog, props));
      console.log(log.dat, log.amount, diffs);
      delete actLog.oldLogs;
      var logRec = { ...actLog, ...newVal };
      this.logs.set(log.dat, new AccLog(logRec));
      changed = true;
    }
    // save any old debts in the account document.

    if (changed && save) {
      logit('fixupAccLogs changes made', {
        id: this._id,
        old: this.logs,
        mergedlogs,
      });
      await this.dbUpdate();
    }
    return changed;
  }
  /*-------------------------------------------------*/
  /*                                                 */
  /*         Replication Conflicts                   */
  /*                                                 */
  /*-------------------------------------------------*/

  get conflictingDocVersions() {
    return R.pluck('_rev', this.conflictingDocs);
  }

  get conflictingDocs() {
    return [this, ...this.conflicts.sort((a, b) => getRev(b._rev) - getRev(a._rev))];
  }

  get conflictsByDate() {
    let confs = this.conflictingDocs;
    logit('confs', confs);
    let sum = {};
    confs.forEach((conf, i) => {
      this.confLogger = this.logger.child({
        confRev: conf._rev,
      });
      (conf.log || []).forEach(lg => {
        let [dat, , , , req, amount] = lg;
        if (req !== 'P') return;
        if (!sum[dat]) sum[dat] = R.repeat('-', confs.length);
        sum.logs[dat][i] = amount;
      });
    });
    // now filter out the OK stuff
    for (let [dat, data] of Object.entries(sum).sort(logCmpDate)) {
      const dataOK = R.all(v => v === data[0], data);
      if (dataOK) delete sum[dat].logs[dat];
      else break;
    }

    return sum;
  }
}
/*-------------------------------------------------*/
/*                                                 */
/*         Helper Functions                   */
/*                                                 */
/*-------------------------------------------------*/
const getNewestDate = (...args) => {
  return args.reduce((newest, item) => {
    const dat = _.isArray(item)
      ? getNewestDate(...item)
      : _.isString(item)
      ? item
      : item.dat;
    return dat > newest ? dat : newest;
  }, '2000-01-01T00:00:01.000');
};

const getOldestDate = (...args) => {
  return args
    .filter(log => log)
    .reduce((oldest, log) => {
      const dat = _.isArray(log)
        ? getOldestDate(...log)
        : _.isString(log)
        ? log
        : log.dat;
      return dat < oldest ? dat : oldest;
    }, '9999-99-99');
};
// function isBillable(log) {
//   return /^[BC]X?$/.test(log.req || '');
// }
function isBooking(log) {
  return /^[BC]/.test(log.req || '');
}

function setHistoricFlags(logs, historic, hideable) {
  logs.forEach(l => {
    l.historic = historic;
    l.hideable = hideable;
  });
}

function resortAndAdjustBalance(cLog, prevBalance, historic, hideable) {
  let balance = prevBalance;
  cLog.sort(cmpDate).forEach(log => {
    if (log.type === 'A') return;
    balance -= log.toCredit || log.amount || 0;
    log.balance = balance;
    log.historic = historic;
    log.hideable = hideable;
  });
  return balance;
}

function adjustToRestartPoint(aLogs, bLogs, darkAgesStarts) {
  const firstOKacc = findRestartPoint(aLogs, darkAgesStarts);
  if (firstOKacc >= 0) {
    const lastPayment = (aLogs[firstOKacc - 1] || {}).dat || '0000-00-00';
    aLogs = aLogs.slice(firstOKacc);
    const logsFrom = getOldestDate(_.map(aLogs, 'logsFrom'), lastPayment);
    // const paymentsMade = !_.isEmpty(aLogs);
    bLogs = _.unionBy(
      bLogs.filter(log => log.dat >= logsFrom),
      ..._.map(aLogs, l => l.oldLogs || []),
      'dat',
    );
  }
  return [aLogs, bLogs];
}

function findRestartPoint(aLogs, darkAgesStarts) {
  let ok = true;
  let lastDark = -1;
  for (let i = 0; i < aLogs.length; i++) {
    const { logsFrom, restartPoint, req } = aLogs[i];
    if (req === '__') return i;
    if (logsFrom && logsFrom < darkAgesStarts) {
      ok = false;
    }
    if (restartPoint) {
      if (ok) {
        return lastDark + 1;
      } else {
        lastDark = i;
        ok = true;
      }
    }
  }
  return lastDark + 1;
}

decorate(Account, {
  members: observable,
  name: computed,
  sortname: computed,
  report: computed,
  ConflictingDocs: action,
  updateDocument: action,
  deleteMemberFromAccount: action,
  addMemberToAccount: action,
  dbUpdate: action,
  deleteConflictingDocs: action,
  makePaymentToAccount: action,
  insertPaymentsFromConflictingDoc: action,
  deletePayment: action,
  accountLogs: computed,
  accountFrame: computed,
  accountMembers: computed,
  accountStatus: computed,
  accountStatusNew: computed,
  fixupAccLogs: action,
  conflictingDocVersions: computed,
  conflictingDocs: computed,
  conflictsByDate: computed,
});
const basicLog = log => {
  return _.pick(log, requiredLogProperties);
};
const getRev = rev => parseInt(rev.split('-')[0]);
var coll = new Intl.Collator();
var logCmpDate = (a, b) => coll.compare(a[0], b[0]);
const cmpName = (a, b) => coll.compare(a.name, b.name);
var cmpDate = (a, b) => coll.compare(a.dat, b.dat);
// var walkReqSort = R.sortWith([
//   R.ascend(R.prop('walkId')),
//   R.descend(R.prop('req')),
//   R.ascend(R.prop('dat')),
// ]);
var walkSort = R.sortWith([R.ascend(R.prop('walkId')), R.ascend(R.prop('dat'))]);
// var dateSort = R.sortWith([R.ascend(R.prop('dat'))]);
module.exports = Account;
