const { observable, decorate } = require('mobx');
const { intersection } = require('lodash');
class SigninState {
  constructor() {
    this.name = '';
    this.password = '';
    this.authError = '';
    this.loggedIn = false;
    this.roles = [];
    this.machine = null;
  }
  get isBookingsAdmin() {
    return intersection(this.roles, ['_admin', 'admin', 'bookings']).length > 0;
  }
  get isMembersAdmin() {
    return (
      intersection(this.roles, ['_admin', 'admin', 'membership', 'bookings']).length > 0
    );
  }
}
decorate(SigninState, {
  name: observable,
  password: observable,
  authError: observable,
  loggedIn: observable,
  roles: observable,
});
const state = new SigninState();
module.exports = state;
