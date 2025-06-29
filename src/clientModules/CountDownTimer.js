export class CountDownTimer {
  duration; // number - how long before the timer expires (milliseconds)
  granularity; // number - how often to run the tick functions (milliseconds)
  tickFns; // Function[] - functions to run at every tick
  running; // boolean - whether the timer is still running
  timeoutId; // timeoutID

  constructor(duration, granularity = 1000) {
    this.duration = duration;
    this.granularity = granularity;
    this.tickFns = [];
    this.running = false;
  }

  updateDuration(milliseconds) {
    this.duration = milliseconds;
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

  start() {
    if (this.running) return;
    let start = Date.now();
    let that = this; // make a ref to the class so we can reference easily
    let diff; // holds the remaining time on the timer

    (function timer() {
      // calculate the remaining time on the timer
      // do this instead of trusting setInterval, which is untrustworthy
      diff = that.duration - Math.trunc(Date.now() - start);

      if (diff > 0) {
        that.timeoutId = setTimeout(timer, that.granularity);
      } else {
        diff = 0;
        that.running = false;
      }

      // call each registered function
      that.tickFns.forEach((fn) => fn(diff, that.parse(diff)));
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
