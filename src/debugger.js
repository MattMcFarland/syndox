const Debug = require('debug')
const parser = require('./parser')

/**
 * found this gem here: http://me.dt.in.th/page/JavaScript-override/
 * author: Thai Pangsakulyanont
 * @namespace Debugger
 */
const Debugger = {
  /**
   * Sends the original function into the callback function, and whatever that callback function returns, we replace the object’s method with it.
   * @param {object} object - object to monkeypatch
   * @param {string} methodName - method to override
   * @param {function} callback - callback
   */
  override: function (object, methodName, callback) {
    object[methodName] = callback(object[methodName])
  },
  /**
   *  Takes a function extraBehavior, and return a function suitable for passing to override—a function that takes the original function and return the altered behavior.
   * @param {function} extraBehavior -do this before
   */
  before: function (extraBehavior) {
    return function (original) {
      return function () {
        extraBehavior.apply(this, arguments)
        return original.apply(this, arguments)
      }
    }
  },
  /**
   * Takes a function extraBehavior, and return a function suitable for passing to override—a function that takes the original function and return the altered behavior.
   * @param {function} extraBehavior - do this after
   */
  after: function (extraBehavior) {
    return function (original) {
      return function () {
        var returnValue = original.apply(this, arguments)
        extraBehavior.apply(this, arguments)
        return returnValue
      }
    }
  }
}

module.exports = () => {
  Object.keys(parser).forEach(fn => {
    if (typeof parser[fn] === 'function') {
      Debug('syndox:attach')(parser[fn])
      Debugger.override(parser, fn, Debugger.before((f) => {
        if (!Array.isArray(fn)) console.log('status', fn + '()')
        Debug('syndox:call')(fn, JSON.stringify(f))
      }))
      Debugger.override(parser, fn, Debugger.after((f) => {
        Debug('syndox:done')(fn)
      }))
    }
  })
  return parser
}
