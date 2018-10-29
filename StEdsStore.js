const DS = require('./mobx/DateStore');
const WS = require('./mobx/WalksStore');
const MS = require('./mobx/MembersStore');
const AS = require('./mobx/AccountsStore');
const PS = require('./mobx/PaymentsSummaryStore');
debug.enable('updates, -pouchdb*');
var logit = debug('updates');
logit.log = console.log.bind(console);
logit.debug = console.debug.bind(console);
console.log('logit enabled:', logit.enabled);

logit.debug('debug');

const init = async db => {
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
  emitter.emit('startMonitoring', db);
};

module.exports = { DS, WS, MS, AS, PS, init };
