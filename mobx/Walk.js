const R = require('ramda');
const _ = require('lodash');
let db;
const XDate = require('xdate');
const emitter = require('./eventBus');
const { merge } = require('lodash');

const { logger } = require('StEdsLogger');
const Logit = require('logit');
var logit = Logit(__filename);
// var logit2 = logit;
const { observable, computed, action, autorun, toJS, decorate } = require('mobx');
const Booking = require('./Booking');
const MS = require('./MembersStore');
const memberName = memId => (MS.members.get(memId) || {fullName:`unknown ${memId}`}).fullName;
class Walk {
  // addMemberName(memId){
  //   // let memName = MS.members.get(memId).fullName;
  //   return `${memId} - ${MS.members.get(memId).fullName}`;
  // }

  constructor(walk, dbset) {
    this._id = '';
    this.type = 'walk';
    this._conflicts;
    this.annotations;
    this.bookings = observable.map({});
    this.capacity;
    this.closed = false;
    this.fee;
    this.firstBooking;
    this.lastCancel;
    this.venue;
    this.walkDate;
    this.walkId;
    this.logger;
    this.confLogger;
    this.getWalk = this.getWalk.bind(this);
    this.getBookings = this.getBookings.bind(this);
    this.dbUpdate = this.dbUpdate.bind(this);
    this.updateDocument = this.updateDocument.bind(this);

    db = dbset;

    autorun(() => logit('autorun', this.report, this));
    // Object.entries(walk.bookings || {}).forEach(([memId, booking])=>this.bookings.set(memId, new Booking(booking, memId, {getWalk: this.getWalk})))
    // delete walk.logs;
    // merge(this, walk)
    this.updateDocument(walk);
    this.logger = logger.child({ walk: this.walkId, venue: this.venue });
    this.logger.addSerializers({
      memId: memId => `${memId} - ${memberName(memId)}`,
    });
  }

  getWalk() {
    const { fee, lastCancel, venue, _id, logger } = this;
    return { fee, lastCancel, venue, _id, logger };
  }

  get bookingsValues() {
    return Array.from(this.bookings.values());
  }
  get bookingsKeys() {
    return Array.from(this.bookings.keys());
  }
  get bookingsEntries() {
    return Array.from(this.bookings.entries());
  }

  get dispDate() {
    return new XDate(this.walkDate).toString('dd MMM');
  }

  get walkDate() {
    return this._id.substr(1);
  }

  get shortname() {
    return this.venue.split(/[ -]/, 2)[0];
  }

  get code() {
    if (this.shortCode) return this.shortCode;
    return this.venue.substr(0, 4);
    // let code = this.shortname[0] + this.shortname.substr(1).replace(/[aeiou]/gi, '');
    // if (code.length > 4) code = code.substr(0, 2) + code.substr(-2);
    // return code;
  }

  get names() {
    return { venue: this.venue, shortname: this.shortname, code: this.code };
  }

  get bookingTotals() {
    let totals = { B: 0, W: 0 };
    this.bookingsValues.map(({ status }) => {
      /^[BW]$/.test(status) && totals[status]++;
    });
    let free = this.capacity - totals.B;
    let display = '' + free + (totals.W > 0 ? ` (-${totals.W})` : '');
    return {
      booked: totals.B,
      waitlist: totals.W,
      free,
      available: free - totals.W,
      full: free <= totals.W,
      display,
    };
  }

  get walkLogsByMembers() {
    let map = {};
    // let activeMember = MS.activeMember;
    for (let [memId, booking] of this.bookings.entries()) {
      map[memId] = booking.mergeableLogs;
    }

    // logit(`walkLogsByMembers ${this._id}`, map);
    // logit(`getWalkLog ${this._id} ${activeMember}`, map[activeMember]);
    return map;
  }

  get busBookings() {
    return this.getBookings('B');
  }

  get carBookings() {
    return this.getBookings('C');
  }
  getBookings(requestType) {
    logit('makeGetBookings', this.bookings, requestType);
    let bookings = this.bookingsValues
      .filter(booking => booking.status === requestType)
      .map(booking => {
        const memId = booking.memId;
        let member = MS.members.get(memId);
        let name = member.fullNameR;
        //  let name = members[memId].firstName+' '+members[memId].lastName;
        let annotation = booking.annotation ? ` (${booking.annotation})` : '';
        // if (member.memberStatus === "Guest") annotation += " *G*";
        const guest = member.memberStatus === 'Guest';
        return {
          memId,
          name,
          annotation,
          type: booking.status,
          requestType,
          guest,
        };
      })
      .sort(nameCmp);
    logit('getBookings', bookings);
    return bookings;
  }

  get waitingList() {
    let bookings = this.bookingsValues
      .filter(booking => booking.status === 'W')
      .map(booking => {
        const memId = booking.memId;
        let member = MS.members.get(memId);
        let name = member.fullNameR;
        let dat = Array.from(booking.logs.values()).reverse()[0].dat;
        return { dat, memId, name, waitlisted: true };
      });

    return bookings.sort(datCmp);
  }

  annotateBooking(memId, note) {
    logit('annotateBooking', memId, note);

    var booking = this.bookings.get(memId);
    booking && booking.updateAnnotation(note);
    this.dbUpdate();
  }

  updateBookingRequest(memId, req) {
    var booking = this.bookings.get(memId);
    logit('updateBookingRequest', booking, memId, req);
    if (!booking) {
      booking = new Booking({}, memId, {
        getWalk: this.getWalk,
        walk: this.walk,
      });
      this.bookings.set(memId, booking);
    }
    booking.updateBookingRequest(req);
    logit('updated booking', booking);
    if (booking.deleteMe) this.bookings.delete(memId);
    this.dbUpdate();
  }

  resetLateCancellation(memId) {
    logit('resetLateCancellation', memId);
    var booking = this.bookings.get(memId) || {};
    if (booking.resetLateCancellation()) this.dbUpdate();
    return;
  }

  closeWalk() {
    this.closed = true;
    this.dbUpdate();
  }

  get report() {
    return `Walk: ${this._id} ${this.venue}`;
  }

  getConflictingDocs() {
    return `Walk: ${this._id} ${this.venue}`;
  }

  async dbUpdate() {
    const logFields = ['dat', 'req', 'who', 'machine', 'fixed'];
    logit('DB Update start', this);
    let { _conflicts, logger, ...newDoc } = _.omitBy(toJS(this), _.isFunction); //eslint-disable-line no-unused-vars
    Object.entries(newDoc.bookings).map(([memId, booking]) => {
      const newBooking = _.omitBy(booking, _.isFunction);
      newBooking.logs = Object.values(newBooking.logs).map(log => _.pick(log, logFields));
      newDoc.bookings[memId] = newBooking;
    });

    // newDoc.logs = Object.values(newDoc.logs)
    logit('DB Update', newDoc, _conflicts, this);
    const res = await db.put(newDoc);
    this._rev = res.rev;
    const info = await db.info();
    logit('info', info);
    await emitter.emit('dbChanged', 'walk changed');
  }
  updateDocument(walkDoc) {
    // const added = R.difference(Object.keys(walkDoc.bookings), this.bookings.keys());
    Object.entries(walkDoc.bookings || {}).forEach(([memId, booking]) => {
      if (this.bookings.has(memId))
        this.bookings.get(memId).updateBookingFromDoc(booking);
      else {
        this.bookings.set(
          memId,
          new Booking(booking, memId, { getWalk: this.getWalk, walk: this }),
        );
      }
    });
    const deleted = R.difference(
      this.bookings.keys(),
      Object.keys(walkDoc.bookings || {}),
    );
    deleted.forEach(memId => this.bookings.delete(memId));
    delete walkDoc.bookings;
    delete walkDoc.walkDate;
    merge(this, walkDoc);
    return;
  }
}

decorate(Walk, {
  annotations: observable,
  capacity: observable,
  closed: observable,
  fee: observable,
  firstBooking: observable,
  lastCancel: observable,
  venue: observable,
  dispDate: computed,
  walkDate: computed,
  shortname: computed,
  code: computed,
  names: computed,
  bookingTotals: computed,
  walkLogsByMembers: computed,
  busBookings: computed,
  carBookings: computed,
  waitingList: computed,
  annotateBooking: action,
  updateBookingRequest: action,
  resetLateCancellation: action,
  closeWalk: action,
  report: computed,
  ConflictingDocs: action,
  dbUpdate: action,
  updateDocument: action,
});
module.exports = Walk;
// const getRev = rev => parseInt(rev.split('-')[0]);
var coll = new Intl.Collator();
// var logCmpDate = (a, b) => coll.compare(a[0], b[0]);
var datCmp = (a, b) => coll.compare(a.dat, b.dat);
var nameCmp = (a, b) => coll.compare(a.name, b.name);
// var datColl = new Intl.Collator();
