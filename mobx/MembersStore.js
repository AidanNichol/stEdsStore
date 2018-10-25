const { getSettings } = require('settings');
const {
  observable,
  computed,
  action,
  runInAction,
  toJS,
  reaction,
  autorun,
  decorate,
} = require('mobx');
// const {setActiveAccount} = require( 'mobx/AccountsStore)'
let db;
const Member = require('./Member');
// const R = require( 'ramda');
const Logit = require('logit.js');
var logit = Logit(__filename);

var coll = new Intl.Collator();

// export let membersLoading;

class MembersStore {
  constructor() {
    this.dispStart = 0;
    this.dispLength = 23;
    this.sortProp = 'name';
    this.modalOpen = false;

    this.members = observable.map({});
    this.activeMemberId;
    this.loaded = false;
    this.editMember;
    this.activeMemberId = null;
    this.createNewMember = this.createNewMember.bind(this);
    this.addMember = this.addMember.bind(this);
    this.deleteMember = this.deleteMember.bind(this);
    this.setActiveMember = this.setActiveMember.bind(this);
    this.setActiveMemberId = this.setActiveMemberId.bind(this);
    this.getAccountForMember = this.getAccountForMember.bind(this);
    this.setSortProp = this.setSortProp.bind(this);
    this.setDispStart = this.setDispStart.bind(this);
    this.resetEdit = this.resetEdit.bind(this);
    this.saveEdit = this.saveEdit.bind(this);
    this.changeDoc = this.changeDoc.bind(this);

    // membersLoading = this.loadMembers();
    reaction(
      () => this.activeMemberId,
      () => {
        logit('activeMemberId set:', this.activeMemberId);
        // const member = this.members.get(this.activeMemberId);
        // member && setActiveAccount(member.accountId);

        this.resetEdit();
        this.syncToIndex();
      },
    );
    reaction(
      () => this.sortProp,
      () => {
        this.syncToIndex();
        logit('members sortProp set:', this.sortProp);
      },
    );
    autorun(() => logit('autorun loaded', this.loaded));
  }
  // membersLoading: () => membersLoading;

  get membersValues() {
    return Array.from(this.members.values());
  }

  syncToIndex() {
    if (!this.activeMemberId) return (this.dispStart = 0);
    let i = this.membersSorted.findIndex(mem => mem._id === this.activeMemberId);
    logit('resync', {
      i,
      dispStart: this.dispStart,
      dispLength: this.dispLength,
      dispLast: this.dispStart + this.dispLength - 1,
    });
    if (i >= this.dispStart && i <= this.dispStart + this.dispLength - 1) return; // already showing on current page
    this.dispStart = Math.max(i - 11, 0); // postion in middle of page
    logit('syncToIndex', 'done');
  }

  get activeMember() {
    if (!this.activeMemberId) return {};
    return this.members.get(this.activeMemberId);
  }

  get selectNamesList() {
    return this.membersValues.map(member => {
      return {
        value: member._id,
        memId: member._id,
        accId: member.accountId,
        label: member.fullNameR,
      };
    });
  }

  get membersSorted() {
    return this.sortProp === 'name'
      ? this.membersSortedByName
      : this.membersSortedByMemNo;
  }

  get membersSortedByName() {
    const cmp = (a, b) => coll.compare(a.fullNameR, b.fullNameR);
    return this.membersValues.sort(cmp);
  }

  get membersSortedByMemNo() {
    const cmp = (a, b) => a.memNo - b.memNo;
    return this.membersValues.sort(cmp);
  }

  getMemberByMemNo(id) {
    return this.members.get(id);
  }

  createNewMember() {
    const memNo =
      this.membersValues.reduce((max, mem) => Math.max(max, mem.memNo), 0) + 1;
    this.editMember = new Member(
      {
        _id: 'M' + memNo,
        memberId: 'M' + memNo,
        accountId: 'A' + memNo,
        newMember: true,
      },
      db,
    );
    logit('createNewMember', memNo, this.editMember);
  }

  addMember(member) {
    this.members.set(member._id, new Member(member, db));
  }

  deleteMember(memId) {
    const member = this.members.get(memId);
    if (member) {
      logit('delete Member ', memId, member.fullName);
      member._deleted = true;
      member.dbUpdate();
    }
    this.activeMemberId = null;
  }

  setActiveMember(memberId) {
    this.activeMemberId = memberId;
  }

  setActiveMemberId(memberId) {
    this.activeMemberId = memberId;
  }

  getAccountForMember(memId) {
    const member = this.members.get(memId);
    return member && member.accountId;
  }

  setSortProp(seq) {
    this.sortProp = seq;
  }

  setDispStart(no) {
    this.dispStart = no;
  }

  resetEdit() {
    if (!this.newMember) {
      // won't match if new member being created
      if (this.activeMember) this.editMember = new Member(toJS(this.activeMember), db);
      else this.editMember = undefined;
    } else {
      const { _id, accountId, memberId, newMember } = this.editMember;
      this.editMember = new Member({ _id, accountId, memberId, newMember }, db);
    }
  }

  saveEdit(memData) {
    // const {newMember, ...data} = toJS(this.editMember);
    delete memData.newMember;
    const current = this.members.get(memData._id);
    if (current && current._rev) memData._rev = current._rev;
    this.members.set(memData._id, new Member(memData, db));
    this.activeMemberId = memData._id;
    this.activeMember.dbUpdate();
  }

  get membersIndex() {
    return this.sortProp === 'name' ? this.membersIndexByName : this.membersIndexByNumber;
  }

  get membersIndexByName() {
    const members = this.membersSortedByName;
    let key = [],
      index = {},
      lastKey = '';
    members.forEach((mem, i) => {
      let c = mem.lastName[0];
      if (c !== lastKey) {
        lastKey = c;
        key.push([c, c, i]);
        index[c] = 0;
      }
      index[c]++;
    });
    return { key, index };
  }

  get membersIndexByNumber() {
    const members = this.membersSortedByMemNo;
    let key = [],
      index = {};
    let bsize = Math.ceil(members.length / 24);
    for (var i = 0; i < members.length; i = i + bsize) {
      let c = members[i].memberId;
      key.push(['○', c, i]);
      index[c] = i;
    }
    return { key, index };
  }

  changeDoc({ deleted, doc, id, ...rest }) {
    let member = this.members.get(id);
    logit('changeDoc', { deleted, doc, id, member, rest });
    if (deleted) {
      if (member && doc._rev === member._rev) this.members.delete(id);
      if (this.activeMemberId === id) this.activeMemberId = null;
      return;
    }
    if (!member) {
      this.addMember(doc);
    } else {
      if (doc._rev === member._rev) return; // we already know about this
      if (!doc._id) {
        logit('changeDoc bad', { deleted, doc, id, member, rest });
        return;
      }
      member.updateDocument(doc);
    }
  }

  async init(setdb) {
    db = setdb;
    // loadMembers
    logit('loading members', '');
    const data = await db.allDocs({
      include_docs: true,
      startkey: 'M',
      endkey: 'M9999999',
    });
    /* required in strict mode to be allowed to update state: */
    runInAction('update state after fetching data', () => {
      data.rows
        .map(row => row.doc)
        .filter(doc => doc.type === 'member')
        .sort(lastnameCmp)
        .map(doc => this.addMember(doc));
      if (typeof window !== 'undefined') {
        const savedValues = localStorage.getItem('stEdsRouter');
        if (getSettings('router.enabled') && savedValues) {
          const memId = JSON.parse(savedValues).memberId;
          if (this.members.has(memId))
            this.activeMemberId = JSON.parse(savedValues).memberId;
        }
      }
      this.loaded = true;
    });
  }
}

decorate(MembersStore, {
  dispStart: observable,
  sortProp: observable,
  modalOpen: observable,
  activeMemberId: observable,
  loaded: observable,
  syncToIndex: action,
  activeMember: computed,
  editMember: observable,
  selectNamesList: computed,
  membersSorted: computed,
  membersSortedByName: computed,
  membersSortedByMemNo: computed,
  MemberByMemNo: action,
  createNewMember: action,
  addMember: action,
  deleteMember: action,
  setActiveMember: action,
  setActiveMemberId: action,
  setSortProp: action,
  setDispStart: action,
  resetEdit: action,
  saveEdit: action,
  membersIndex: computed,
  membersIndexByName: computed,
  membersIndexByNumber: computed,
  changeDoc: action,
  init: action,
});
var lastnameCmp = (a, b) =>
  coll.compare(a.lastName + ', ' + a.firstName, b.lastName + ', ' + b.firstName);

const membersStore = new MembersStore();

// export const setActiveMember = memId => membersStore.setActiveMember(memId);
// export const getAccountForMember = memId => {
//   const member = membersStore.members.get(memId);
//   return member && member.accountId;
// };
// export default membersStore;

module.exports = membersStore;
