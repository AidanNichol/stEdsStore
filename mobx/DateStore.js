const {format, addMilliseconds, differenceInMonths, getDay,
addDays, addWeeks, addMonths, addYears} = require('date-fns');
const {format:fmtFp} = require('date-fns/fp');
const formatDate = fmtFp('yyyy-MM-dd');
const formatISOdate = fmtFp("yyyy-MM-dd'T'HH:mm:ss.SSS");
const { observable, computed, decorate } = require('mobx');
// const Logit = require( 'logit');
// var logit = Logit(__filename);

// export const dateDisplay = dat => new XDate(dat).toString('dd MMM HH:mm');

class DateStore {
  constructor(today) {
    this.testing = false;
    if (today) {
      this.today = new Date(today);
      this.testing = true;
    } else {
      this.today = new Date();
    }
    this.setNewDate = this.setNewDate.bind(this);
    console.log(this);
    // autorun(()=>console.warn('today is: ', this.today.toString('yyyy-MM-dd HH:mm')))
  }
  setNewDate(newDate) {
    this.today = newDate;
  }

  datetimePlus1(oldDate, inc = 1) {
    return formatISOdate(addMilliseconds(new Date(oldDate), inc));
  }

  dispDate(dat) {
    const now = new Date();
    const tdat = new Date(dat);
    return format(tdat, differenceInMonths(tdat, now) > 6 ? 'dd MMM, yyyy' : 'dd MMM HH:mm');
  }

  get dayNo() {
    return getDay(this.today);
  }

  get todaysDate() {
    return formatDate(this.today);
  }
  getLogTime(today = new Date()) {
    return formatISOdate(today);
  }

  get now() {
    return format(new Date(), 'yyyy-MM-dd HH:mm');
  }

  get prevDate() {
    return formatDate(addDays(this.today, -55));
  }

  get lastAvailableDate() {
    return formatDate(addDays(this.today, 59));
  }

  get logTime() {
    return formatISOdate(new Date());
  }
  datetimeIsRecent(datStr) {
    return this.datetimeIsToday(datStr);
  }
  datetimeIsToday(datStr) {
    return datStr.substr(0, 10) === this.todaysDate; // in the same day
  }

  dateMinus3Weeks(dat) {
    return formatDate(addWeeks(new Date(dat), -4));
  }
  date1YearAgo(dat) {
    return formatDate(addYears((dat ? new Date(dat) : new Date()), -1));
  }
  dateNmonthsAgo(dat, n) {
    return formatDate(addMonths(new Date(dat), -1 * n));
  }
  datePlusNDays(dat, n) {
    return formatDate(addDays(new Date(dat), -1 * n));
  }
}
decorate(DateStore, {
  today: observable,
  dayNo: computed,
  todaysDate: computed,
  now: computed,
  prevDate: computed,
  lastAvailableDate: computed,
  logTime: computed,
});
const dateStore = new DateStore();
// const dateStore = new DateStore('2017-02-09');

if (!dateStore.testing) {
  setInterval(() => {
    const newToday = new Date();
    if (formatDate(newToday) !== dateStore.todaysDate)
      dateStore.setNewDate(newToday);
    dateStore.setNewDate(newToday);
  }, 60000);
}

module.exports = dateStore;
