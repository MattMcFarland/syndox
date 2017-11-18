const logger = require("npmlog")
const debug = require("debug")("syndox")
const util = require("util")
const pkg = require("../package.json")

logger.heading = "syndox"
logger.info("using", `syndox@${pkg.version}`)

const vanilla = consoleObject => consoleObject.log

module.exports.start = () => {
  const _log = vanilla(console)
  console._log = _log
  console.dir = (...args) => _log(util.inspect(...args, true, 3, true))
  console.log = (...args) => logger.info(...args)
  console.info = (...args) => logger.info(...args)
  console.warn = (...args) => logger.warn(...args)
  console.error = (...args) => logger.error("ERR", ...args)
  console.debug = (...args) => debug(...args)
  return logger
}

module.exports.logger = logger
