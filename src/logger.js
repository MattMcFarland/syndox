// @flow
import logger from 'npmlog'
import Debug from 'debug'
import util from 'util'
import pkg from '../package.json'

const debug = Debug('syndox')

logger.heading = 'syndox'
logger.info('using', `syndox@${pkg.version}`)

const vanilla = consoleObject => consoleObject.log

// since we are re-assigning console and all....
declare var console: {
  log: any,
  _log: any,
  dir: any,
  info: any,
  warn: any,
  error: any,
  debug: any,
}

export const start = () => {
  const _log = vanilla(console)
  console._log = _log
  console.dir = (...args) => _log(util.inspect(...args, true, 3, true))
  console.log = (...args) => logger.info(...args)
  console.info = (...args) => logger.info(...args)
  console.warn = (...args) => logger.warn(...args)
  console.error = (...args) => logger.error('ERR', ...args)
  console.debug = (...args) => debug(...args)
  return logger
}
