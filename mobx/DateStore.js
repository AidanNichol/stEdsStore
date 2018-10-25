const XDate = require('xdate');
const { observable, computed, decorate } = require('mobx');
// const Logit = require( 'logit');
// var logit = Logit(__filename);

// export const dateDisplay = dat => new XDate(dat).toString('dd MMM HH:mm');

class DateStore {
  constructor(today) {
    this.testing = false;
    if (today) {
      this.today = new XDate(today);
      this.testing = true;
    } else {
      this.today = new XDate();
    }
    this.setNewDate = this.setNewDate.bind(this);
    console.log(this);
    // autorun(()=>console.warn('today is: ', this.today.toString('yyyy-MM-dd HH:mm')))
  }
  setNewDate(newDate) {
    this.today = newDate;
  }

  datetimePlus1(oldDate, inc = 1) {
    return new XDate(oldDate).addMilliseconds(inc).toString('i');
  }

  dispDate(dat) {
    const now = new XDate();
    const tdat = new XDate(dat);
    return tdat.toString(tdat.diffMonths(now) > 6 ? 'dd MMM, yyyy' : 'dd MMM HH:mm');
  }

  get dayNo() {
    console.log('getDay', this.today.getDay(), this.today.toString('ddd'));
    return this.today.getDay();
  }

  get todaysDate() {
    return this.today.toString('yyyy-MM-dd');
  }
  getLogTime(today = new Date()) {
    return new XDate(today).toString('i');
  }

  get now() {
    return new XDate().toString('yyyy-MM-dd HH:mm');
  }

  get prevDate() {
    return this.today
      .clone()
      .addDays(-55)
      .toString('yyyy-MM-dd');
  }

  get lastAvailableDate() {
    return this.today
      .clone()
      .addDays(59)
      .toString('yyyy-MM-dd');
  }

  get logTime() {
    return new XDate().toString('i');
  }
  datetimeIsRecent(datStr) {
    return this.datetimeIsToday(datStr);
  }
  datetimeIsToday(datStr) {
    return datStr.substr(0, 10) === this.todaysDate; // in the same day
  }

  dateMinus3Weeks(dat) {
    return new XDate(dat).addWeeks(-4).toString('yyyy-MM-dd');
  }
  date1YearAgo(dat) {
    return (dat ? new XDate(dat) : new XDate()).addYears(-1).toString('yyyy-MM-dd');
  }
  dateNmonthsAgo(dat, n) {
    return new XDate(dat).addMonths(-1 * n).toString('yyyy-MM-dd');
  }
  datePlusNDays(dat, n) {
    return new XDate(dat).addDays(-1 * n).toString('yyyy-MM-dd');
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
    const newToday = new XDate();
    if (newToday.toString('yyyy-MM-dd') !== dateStore.todaysDate)
      dateStore.setNewDate(newToday);
    dateStore.setNewDate(newToday);
  }, 60000);
}

module.exports = dateStore;
