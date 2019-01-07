const { merge } = require('lodash');
let db;
const { observable, computed, action, runInAction, toJS, decorate } = require('mobx');
const emitter = require('./eventBus');
const Logit = require('logit');
var logit = Logit(__filename);

class Member {
  constructor(member, dbset) {
    this._id = 0;
    this.type = 'member';
    this.memberId = 0;
    this.accountId = 0;
    this.firstName = '';
    this.lastName = '';
    this.address = '';
    this.phone = '';
    this.email = '';
    this.mobile = '';
    this.joined = '';
    this.nextOfKin = '';
    this.medical = '';
    this.memberStatus = 'Guest';
    this.roles = '';
    this.suspended = false;
    this.subscription = '';
    this.updateDocument = this.updateDocument.bind(this);
    this.updateField = this.updateField.bind(this);
    this.dbUpdate = this.dbUpdate.bind(this);

    db = dbset;
    // autorun(() => console.log('autorun Member', this.report, this));
    // for(let [key, val] of Object.entries(member)){
    //   this[key] = val;
    // }
    if (!member._id) {
      logit('constructor bad', member);
      return;
    }
    merge(this, member);
    this.memNo = parseInt(this._id.substr(1));
  }

  get report() {
    return `Member: ${this._id} ${this.fullName}`;
  }

  get fullName() {
    return `${this.firstName} ${this.lastName}`;
  }

  get fullNameR() {
    return `${this.lastName}, ${this.firstName}`;
  }

  shortName(account, parens) {
    if (account.members.length <= 1) return '';
    return parens ? `(${this.firstName})` : this.firstName;
  }
  get toObject() {
    return {
      _id: this._id,
      type: this.type,
      memberId: this.memberId,
      accountId: this.accountId,
      firstName: this.firstName,
      lastName: this.lastName,
      address: this.address,
      phone: this.phone,
      email: this.email,
      mobile: this.mobile,
      joined: this.joined,
      nextOfKin: this.nextOfKin,
      medical: this.medical,
      memberStatus: this.memberStatus,
      roles: this.roles,
      suspended: this.suspended,
      subscription: this.subscription,
      // subsStatus: this.subsStatus,
    };
  }
  get subsStatus() {
    return Member.getSubsStatus(this.memberStatus, this.subscription);
  }
  static getSubsStatus(memberStatus, subscription) {
    let _today = new Date();
    // DS.todaysDate;
    let status = 'ok';
    if (memberStatus === 'HLM') return { due: false, status, showSubsButton: false };
    if (memberStatus === 'Guest')
      return { due: false, status: 'guest', showSubsButton: false };

    const currentUserSubs = parseInt(subscription || 0);

    let fee = 15;
    // const _today = new Date();
    let thisYear = _today.getFullYear();
    // year - all new subs will be ok until the end of thie 'year'
    let year = _today >= new Date(`${thisYear}-10-01`) ? thisYear + 1 : thisYear;
    // dueSubsYear - we are collecting subs for this year
    let dueSubsYear = _today >= new Date(`${thisYear}-12-31`) ? thisYear + 1 : thisYear;
    // okSubsYear - if current value is this then you get the reduced rate.
    let okSubsYear = _today < new Date(`${thisYear}-02-01`) ? thisYear - 1 : thisYear;
    let showSubsButton =
      _today >= new Date(`${thisYear}-12-01`) && currentUserSubs < year;
    if (currentUserSubs >= okSubsYear) fee = 13;
    // console.log({currentUserSubs, year, thisYear, dueSubsYear,  okSubsYear, showSubsButton})
    if (currentUserSubs >= year || currentUserSubs >= dueSubsYear) {
      if (showSubsButton) return { due: false, status, year, fee, showSubsButton };
      else return { due: false, status, showSubsButton };
    }
    status = 'due';
    if (currentUserSubs >= okSubsYear) fee = 13;
    else status = 'late';
    showSubsButton = true;
    return { due: true, year, fee, status, showSubsButton };
  }
  updateField(field, value) {
    logit('updateField', field, value);
    this[field] = value;
  }

  updateDocument(member) {
    merge(this, member);
    return;
  }

  async dbUpdate() {
    let { _conflicts, ...newDoc } = toJS(this); // eslint-disable-line no-unused-vars
    logit('DB Update', newDoc._deleted, newDoc);
    const res = await db.put(newDoc);
    runInAction('after doc update', () => {
      this._rev = res.rev;
    });
    const info = await db.info();
    logit('info', info);
    emitter.emit('dbChanged', 'member changed');
  }
}

decorate(Member, {
  memberId: observable,
  accountId: observable,
  firstName: observable,
  lastName: observable,
  address: observable,
  phone: observable,
  email: observable,
  mobile: observable,
  joined: observable,
  nextOfKin: observable,
  medical: observable,
  memberStatus: observable,
  roles: observable,
  suspended: observable,
  subscription: observable,
  report: computed,
  fullName: computed,
  fullNameR: computed,
  subsStatus: computed,
  updateField: action,
  updateDocument: action,
  dbUpdate: action,
});
module.exports = Member;
