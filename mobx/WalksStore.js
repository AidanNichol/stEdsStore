const {
  observable,
  computed,
  action,
  runInAction,
  autorun,
  reaction,
  toJS,
  decorate,
} = require('mobx');
const useFullHistory = require('StEdsSettings').get('useFullHistory');

let db;
const R = require('ramda');
const Logit = require('logit');
var logit = Logit(__filename);
console.log('import');
const DS = require('./DateStore');
const Walk = require('./Walk');
const MS = require('./MembersStore');
class WalksStore {

  constructor(walks) {
    this.activeWalk = null;
    this.walks = observable.map({});

    this.loaded = false;
    this.addWalk = this.addWalk.bind(this);
    this.addWalks = this.addWalks.bind(this);
    this.addWalks = this.addWalks.bind(this);
    this.setActiveWalk = this.setActiveWalk.bind(this);
    this.resetLateCancellation = this.resetLateCancellation.bind(this);
    this.resetLateCancellation = this.resetLateCancellation.bind(this);
    this.changeDoc = this.changeDoc.bind(this);

    if (walks) this.addWalks(walks);
    // else walksLoading = this.loadWalks();
    reaction(() => this.activeWalk, d => logit('activeWalk set:', d));
    autorun(() => logit('autorun loaded', this.loaded));
  }

  // walksLoading: () => walksLoading;

  get walksValues() {
    return !this.walks ? [] : Array.from(this.walks.values());
  }
  get walksKeys() {
    return !this.walks ? [] : Array.from(this.walks.keys()).sort(valCmp);
  }
  get bookableWalksId() {
    const today = DS.todaysDate;
    const walkIds = this.openWalks
      .filter(walk => walk.walkDate >= today)
      .map(walk => walk._id);
    logit('bookableWalksId', walkIds);
    return walkIds;
  }

  get openWalks() {
    const today = DS.todaysDate;
    const walkIds = this.walksValues
      .sort(idCmp)
      .filter(walk => walk._id.substr(1, 4) > '2016' && !walk.closed)
      .filter(walk => today >= walk.firstBooking.substr(0, 10)); // ignore time
    logit('openWalksId', walkIds);
    return walkIds;
  }

  get currentPeriodStart() {
    return this.openWalks[0].firstBooking;
  }

  get recentWalksId() {
    const no = 3;
    const nextWalk = this.bookableWalksId[0];
    const i = Math.max(this.walksKeys.indexOf(nextWalk) - no, 0);

    const recent = [...this.walksKeys.slice(i, i + no), ...this.bookableWalksId];
    logit('walkDay recent', recent, i, nextWalk, this.walksKeys);
    return recent;
  }

  get lastWalk() {
    const nextWalk = this.bookableWalksId[0];
    const i = Math.max(this.walksKeys.indexOf(nextWalk) - 1, 0);

    const lastWalkId = this.walksKeys[i];
    const walk = this.walks.get(lastWalkId);
    logit('last walk', nextWalk, i, lastWalkId, walk);
    return walk;
  }
  get historyStarts() {
    const nextWalk = this.bookableWalksId[0];
    const i = Math.max(this.walksKeys.indexOf(nextWalk) - 5, 0);

    const walk = this.walks.get(this.walksKeys[i]);
    logit('last walk', nextWalk, i, walk);
    return walk && walk.firstBooking;
  }
  get prehistoryStarts() {
    const nextWalk = this.bookableWalksId[0];
    return DS.dateNmonthsAgo(nextWalk.substr(1), 8);
  }
  get darkAgesStarts() {
    // const nextWalk = this.bookableWalksId[0];
    const yearago = 'W' + DS.date1YearAgo('');
    const oldestWalk = this.walksKeys.filter(walk => walk >= yearago)[0];
    return DS.datePlusNDays(oldestWalk.substr(1), 3);
  }
  get availableWalksStart() {
    if (useFullHistory) return 'W2016-11-01';
    else return this.darkAgesStarts;
  }
  get nextPeriodStart() {
    const nextWalk = this.bookableWalksId[0];
    const i = Math.max(this.walksKeys.indexOf(nextWalk) - 2, 0);

    const oldWalkId = this.walksKeys[i];
    const oldWalk = this.walks.get(oldWalkId);
    logit('nextPeriodStart', nextWalk, i, oldWalkId, oldWalk);
    return oldWalk.firstBooking;
  }

  get lastClosed() {
    return this.walksValues
      .filter(walk => walk.closed)
      .map(walk => walk._id)
      .pop();
  }

  get conflictingWalks() {
    return this.walksValues.filter(entry => (entry._conflicts || []).length > 0);
  }

  get allWalkLogsByAccount() {
    let map = {};
    this.walksValues.forEach(walk => {
      Object.entries(walk.walkLogsByMembers).map(([memId, logs]) => {
        let member = MS.members.get(memId);
        let accId = member.accountId;
        if (!map[accId]) map[accId] = logs;
        else map[accId] = R.concat(map[accId], logs);
      });
    });
    return map;
  }

  addWalk(walk) {
    this.walks.set(walk._id, new Walk(toJS(walk), db));
  }

  setActiveWalk(walkId) {
    logit('setActiveWalk', walkId);
    this.activeWalk = walkId;
  }

  addWalks(walks) {
    walks.filter(walk => walk.type === 'walk').map(walk => this.addWalk(walk));
  }

  resetLateCancellation(walkId, memId) {
    this.walks.get(walkId).resetLateCancellation(memId);
  }

  changeDoc({ deleted, doc, _id, ...rest }) {
    logit('changeDoc', { deleted, doc, rest });
    let walk = this.walks.get(_id);
    if (deleted) {
      if (doc._rev === walk._rev) this.walks.delete(doc._id);
      return;
    }
    if (!walk) {
      this.addWalk(doc);
      return;
    }
    if (doc._rev === walk._rev) return; // we already know about this
    walk.updateDocument(doc);
  }

  async init(setdb) {
    db = setdb;

    const endkey = 'W' + DS.lastAvailableDate;
    const startkey = useFullHistory ? 'W2016-11-01' : 'W' + DS.date1YearAgo('');
    logit('loadWalks', startkey, '<-->', endkey, useFullHistory);
    const data = await db.allDocs({include_docs: true, conflicts: true, startkey, endkey,});
    /* required in strict mode to be allowed to update state: */
    logit('allDocs', data);
    runInAction('update state after fetching data', () => {
      this.addWalks(data.rows.map(row => row.doc));

      this.loaded = true;
      logit('WalkStore', this, this.walks);
    });
  }
}
var coll = new Intl.Collator();
var idCmp = (a, b) => coll.compare(a._id, b._id);
var valCmp = (a, b) => coll.compare(a, b);


decorate(WalksStore, {
  activeWalk: observable,
  loaded: observable,
  bookableWalksId: computed,
  openWalks: computed,
  currentPeriodStart: computed,
  recentWalksId: computed,
  lastWalk: computed,
  nextPeriodStart: computed,
  lastClosed: computed,
  conflictingWalks: computed,
  allWalkLogsByAccount: computed,
  addWalk: action,
  setActiveWalk: action,
  addWalks: action,
  resetLateCancellation: action,
  changeDoc: action,
  init: action,
});
const walksStore = new WalksStore();
module.exports = walksStore;
