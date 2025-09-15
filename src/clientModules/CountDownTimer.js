export class CountDownTimer {
  duration; // number - how long before the timer expires (milliseconds)
  granularity; // number - how often to run the tick functions (milliseconds)
  tickFns; // Function[] - functions to run at every tick
  running; // boolean - whether the timer is still running
  timeoutId; // timeoutID

  constructor(granularity = 1000) {
    this.granularity = granularity;
    this.tickFns = [];
    this.running = false;
  }

  parse(milliseconds) {
    return {
      minutes: Math.trunc(milliseconds / 1000 / 60),
      seconds: Math.round((milliseconds % 60000) / 1000),
    };
  }

  onTick(fn) {
    if (typeof fn === 'function') {
      this.tickFns.push(fn);
    }
    return this;
  }

  start(duration, totalDuration) {
    // Always allow starting, even if a previous timer was considered running.
    this.stop(); // Ensure any existing timeout is cleared before starting a new one.
    this.running = true;
    this.duration = duration;
    const displayDuration = totalDuration ?? duration;
    let start = Date.now();
    let that = this; // make a ref to the class so we can reference easily
    let diff; // holds the remaining time on the timer

    // If the duration is not positive, don't start the timer loop.
    // Just run the tick functions once with 0 to signal completion.
    if (duration <= 0) {
      that.tickFns.forEach((fn) => fn(0, that.parse(0), displayDuration));
      return;
    }

    (function timer() {
      // calculate the remaining time on the timer
      // This is the core of the timer logic.
      diff = that.duration - (Date.now() - start);

      if (diff > 0) {
        that.timeoutId = setTimeout(timer, that.granularity);
      } else {
        diff = 0;
        that.running = false;
      }

      // call each registered function
      that.tickFns.forEach((fn) => fn(diff, that.parse(diff), displayDuration));
    })();
  }

  stop() {
    if (this.timeoutId != undefined) {
      clearTimeout(this.timeoutId);
    }
    this.running = false;
  }

  isExpired() {
    return !this.running;
  }
}
