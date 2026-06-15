export class LucraUserNotLoggedIn extends Error {
  constructor(message = "Lucra user is not logged in") {
    super(message);
    this.name = "LucraUserNotLoggedIn";
    Object.setPrototypeOf(this, LucraUserNotLoggedIn.prototype);
  }
}
