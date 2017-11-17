// #region Initialization
const pipe = require('promise.pipe')
const Logger = require('./logger')
Logger.start()

const parser = require('debug').enabled
  ? require('./debugger')()
  : require('./parser')

const {
  dedupe,
  flatten,
  fatalError,
  processAllGlobPatterns,
  createFilesHash,
  args,
  status,
  saveContextToFileHash,
  addFilesContentsToHash
} = parser

// #endRegion Initialization

// #region Program

const program = pipe(
  processAllGlobPatterns,
  // since globpatterns are inserted as multiple arrays.
  flatten,
  // remove duplicates found by multiple globpatterns
  dedupe,
  createFilesHash,
  saveContextToFileHash,
  addFilesContentsToHash
)

program(args)
  .then(status('end'))
  .catch(fatalError)

// #endregion Program
