import pipe from 'promise.pipe'
import Logger from './logger'

// #region Initialization
Logger.start()

// use common js require

const parser = require('debug').enabled
  ? require('./debugger')()
  : require('./parser')

const {
  initializeDB,
  addFilesContentsToHash,
  args,
  createFilesHash,
  dedupe,
  fatalError,
  flatten,
  processAllGlobPatterns,
  saveContextToFileHash,
  status,
  logContext,
  addASTContentsToHash,
} = parser

// #endRegion Initialization

// #region Program

const program = pipe(
  initializeDB(),
  processAllGlobPatterns,
  // since globpatterns are inserted as multiple arrays.
  flatten,
  // remove duplicates found by multiple globpatterns
  dedupe,
  createFilesHash,
  saveContextToFileHash,
  addFilesContentsToHash,
  addASTContentsToHash
)

program(args)
  .then(status('end'))
  .catch(fatalError)

// #endregion Program
