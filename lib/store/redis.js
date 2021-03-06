"use strict";

const redis = require("redis");
const hlpr = require("../helper")

function RedisStore(body) {
  const hits = "api_limiter::hits"

  this["resetTimesecWindow"] = hlpr["calculateNextResetTime"](body["secWindow"]);
  this["resetTimeminWindow"] = hlpr["calculateNextResetTime"](body["minWindow"]);
  this["resetTimehrWindow"] = hlpr["calculateNextResetTime"](body["hrWindow"]);

  this["redisUrl"] = body["redisUrl"]

  this["windows"] = ["secWindow", "minWindow", "hrWindow"]


  this.initialize = function () {
    this["client"] = redis.createClient(this['redisUrl']);

    this["client"].on('error', (err) => {
      console.log("[redis][connection error]", err)
    });

    this["client"].on('connect', (res) => {
      console.log(`[redis store initialized successfully on] ${this['redisUrl']}`)
    });
  }

  this.incr = function (key, cb) {
    let current = {}
    let requests = this["windows"].map((window) => {
      return new Promise((resolve) => {
        incrementKey(this["client"], key, window, current, resolve)
      })
    })
    Promise.all(requests).then(() => {
      cb(null, current, {
        resetTimeSecWindow: this["resetTimesecWindow"],
        resetTimeMinWindow: this["resetTimeminWindow"],
        resetTimeHourWindow: this["resetTimehrWindow"]
      })
    });
  }

  this.decrement = function (key) {
    this["windows"].forEach((window) => {
      this["client"]["hincrby"](hits, `${key}::${window}`, -1, (err, rs) => {
        if (err) {
          console.log("[RedisStore][decrement][hincrby][err]", err);
        }
      })
    })
  };

  this.resetWindow = function (windowType) {
    this["client"]["hexists"](hits, windowType, (err, res) => {
      if (!err && res !== null) {
        this["client"]["hgetall"](hits, (err, rs) => {
          if (err) {
            console.log(`[RedisStore][resetAll${windowType}][hgetall][err]`, err);
          } else {
            if (rs !== null && Object.keys(rs)["length"] > 0) {
              Object.keys(rs).forEach((key) => {
                if (key.includes(windowType)) {
                  this["client"]["hset"](hits, key, 0, (err, rs) => {
                    if (err) {
                      console.log(`[RedisStore][resetAll${windowType}][hset][err]`, err);
                    }
                  })
                }
              })
            }
          }
        })
      } else {
        console.log(`[RedisStore][resetAll${windowType}][hexists][err]`, err);
      }
    })
    this[`resetTime${windowType}`] = hlpr["calculateNextResetTime"](body[windowType]);
  };

  this.resetKey = function (key) {
    this["windows"].forEach((window) => {
      this["client"]["hdel"](hits, `${key}::${window}`, (err, rs) => {
        if (err) {
          console.log("[RedisStore][resetKey][hdel][err]", err);
        }
      })
    })
  };

  const incrementKey = function (client, key, window, current, cb) {
    client["hincrby"](hits, `${key}::${window}`, 1, (err, rs) => {
      if (rs) {
        current[window] = rs
      }
      cb()
    })
  }

  this["windows"].forEach((window) => {
    let intervalWindow = `${window}Interval`

    intervalWindow = setInterval(() => {
      this["resetWindow"](window)
    }, body[window]);
    if (intervalWindow["unref"]) {
      intervalWindow["unref"]();
    }
  })

}

module.exports = RedisStore;