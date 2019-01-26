// const Emittery = require('emittery');
// const emitter = new Emittery();
const logit = require('logit')(__filename+'.');

const DS = require('./mobx/DateStore');
const WS = require('./mobx/WalksStore');
const MS = require('./mobx/MembersStore');
const AS = require('./mobx/AccountsStore');
const PS = require('./mobx/PaymentsSummaryStore');
const Member = require('./mobx/Member');
const Booking = require('./mobx/Booking');
const AccLog = require('./mobx/AccLog');
const eventBus = require('./mobx/eventBus');
const signinState = require('./mobx/signinState');

// logit.log = console.log.bind(console);
// logit.debug = console.debug.bind(console);
console.log('logit enabled:', logit.enabled);

// logit.debug('debug');

const init = async (db, emitter) => {
  logit('storeLoading', 'start');
  const info = await db.info();
  logit('storeLoading', 'info', info);
  await PS.init(db);
  logit('storeLoading', 'PS');
  await MS.init(db);
  logit('storeLoading', 'MS');
  await WS.init(db);
  logit('storeLoading', 'WS');
  await AS.init(db);
  logit('storeLoading', 'AS');
  emitter && emitter.emit('startMonitoring', db);
};

module.exports = {
  DS,
  WS,
  MS,
  AS,
  PS,
  Member,
  Booking,
  AccLog,
  eventBus,
  signinState,
  init
};