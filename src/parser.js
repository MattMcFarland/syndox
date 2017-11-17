import { MODULE_NAME } from './constants'
import cosmiconfig from 'cosmiconfig'
import cache from './cache'

const { promisify } = require('util')
const { resolve: resolvePath } = require('path')
const { parse: parseAST } = require('babylon')
const { Transform } = require('stream')
const mkdirp = require('mkdirp')
const path = require('path')
const json = require('big-json')
const fs = require('fs')
const shortid = require('shortid')
const readFile = promisify(fs.readFile)
const glob = require('glob')
const db = require('./db')

// #region Unary Functions

/**
 * Removes duplicates from the given array
 * @param {Array} arr dedupe this array
 */
const dedupe = arr => arr.reduce((x, y) => x.includes(y) ? x : [...x, y], [])

/**
 * Flattens an array that is one level deep.
 * @param {Array} arr flatten this array
 */
const flatten = arr => [].concat(...arr)

/**
 * create AST of given code
 * @param {string} code - code will be converted to AST
 * @returns {object} Abstract Syntax Tree
 */
const parseCode = code => parseAST(code)

/**
 * Parse an array of code
 * @param {string[]} codeArray - converts each string in codeArray to AST
 * @returns {object[]} Array of Abstract Syntax Trees
 * @uses parseCode
 */
const parseCodeArray = codeArray => codeArray.map(parseCode)

/**
 * Logs the current context to the console
 * @param {*} data log this
 * @returns {*} data
 */
const logContext = (data) => {
  console.log('ctx', data)
  return data
}
/**
 * Send a status message while in a promise chain
 * @param {string} msg
 */
const status = msg => data => {
  console.log('status', msg)
  return data
}

/**
 * Changes context in promise chain
 * @param {*} newContext next thing in promise chain will focus on this
 */
const setContext = newContext => _ => {
  return Promise.resolve(newContext)
}

/**
 * Only attempts to read real files, discarding directories, etc.
 * @param {string} filepath path to be read by fs.readFile
 * @returns {Promise<string>} A promise of the file contents.
 * @see readFiles
 */
const safelyReadFile = filepath => {
  return new Promise((resolve, reject) => {
    fs.stat(filepath, (err, stats) => {
      if (err) return reject(err)
      if (stats.isFile()) {
        console.log('read', filepath)
        return readFile(filepath, 'utf-8').then(data => {
          resolve([filepath, data])
        })
      }
      console.warn('skip', filepath)
      return resolve('')
    })
  })
}

/**
 * Read the contents of all files in the given array
 * @param {string[]} filesArray - array of full paths to files
 * @returns {Promise<string[]>} - A promise when all files have been read
 * @uses safelyReadFile
 */
const readFiles = filesArray => Promise.all(filesArray.map(safelyReadFile))

// const addEntryToFileHash = ([key, value]) => db.get('files').assign({[key]: value}).write()
// const addEntriesToFileHash = (entries) => Promise.all(entries.map(addEntryToFileHash))
const getFullPathsFromFileHash = fileHash => Promise.all(Object.values(fileHash).map(({fullPath}) => fullPath))
const getFileHashFromDB = () => db.get('files').value()

const saveContextToFileHash = context => {
  return db.get('files').assign(context).write()
}
const appendContextAsKeysToFileHash = keyToAppend => context => {
  const fileHash = getFileHashFromDB()
  return Object.entries(fileHash).reduce((hash, [key, value]) => {
    const fullPath = value.fullPath
    value.data = context[fullPath]
    return hash
  }, {})
}
const convertEntriesToObject = entries => {
  return entries.reduce((obj, [ key, value ]) => ({ ...obj, [key]: value }), {})
}

const addFilesContentsToHash = () =>
  Promise.resolve(getFileHashFromDB())
    .then(getFullPathsFromFileHash)
    .then(logContext)
    .then(readFiles)
    .then(convertEntriesToObject)
    .then(appendContextAsKeysToFileHash('data'))
    .then(saveContextToFileHash)
/**
 * Logs error, exits 1
 * @param {Error} err error object
 */
const fatalError = err => {
  console.error(err)
  process.exit(1)
}

/**
 * Processes a glob pattern to an array of files
 * @param {string} pattern pattern to resolve
 * @returns {Promise<...string[]>} all matches found from the pattern
 * @throws {Error} If nothing is found
 * @see processGlobPattern
 */
const processGlobPattern = pattern => {
  return new Promise((resolve, reject) => {
    glob(pattern, (err, matches) => {
      if (err) return reject(err)
      return resolve(matches)
    })
  })
}

const processAllGlobPatterns = patterns => Promise.all(patterns.map(processGlobPattern))

/**
 * Converts resolves the full path of the filepath relative to the current working directory.
 * @param {string} relativePath filepath to resolve
 */
const resolvePathFromCWD = relativePath => resolvePath(process.cwd(), relativePath)

/**
 * Resolves the full path all file patterns relative to the current working directory.
 * @param {string[]} relativePaths array of relative filepaths to resolve
 * @uses resolvePathFromCWD
 */
const resolveAllFilePathsFromCWD = relativePaths => relativePaths.map(resolvePathFromCWD)

// const cacheFullFilePath = filePath => cache.get(`files.${filePath}`).assign({ fullPath })

/**
 * Creates base filehash for further read/writes, which will include fullpath and rel-path
 * @param {string[]} filepaths - relative paths, full paths will be added to them.
 * @returns {FileHash}
 */
const createFilesHash = filepaths => {
  return filepaths.reduce((hash, filepath) => Object.assign(hash, {
    [filepath]: {
      fullPath: resolvePathFromCWD(filepath),
      index: filepath,
      id: shortid.generate()
    }
  }), {})
}

/**
 * Runs the process of pulling all file definitions from the database, then reading their data.
 */
const generateASTs = () => {
  const fileHash = db.get('files').value()
  const withAST = Object.entries(fileHash).reduce((hash, [key, value]) => {
    return Object.assign(hash, {
      [key]: {
        ast: safelyReadFile(value.fullPath),
        ...value
      }
    })
  }, {})
  console.dir(withAST)
}

const readConfig = () =>
  cosmiconfig(MODULE_NAME)

const assignContextToCache = key => context => {
  cache.set(key, context)
  return context
}

const fromCacheToContext = key => _ => cache.get(key)

const fromConfig = key => _ =>
  Promise.resolve(assignContextToCache('config'))
  .then(cosmic => cosmic.config[key])

// const streamAST = ast => {
//   return new Promise((resolve, reject) => {
//     const stringifyWriteTransform = new Transform({
//       writableObjectMode: true,
//       readableObjectMode: true,
//       transform: function (chunk, encoding, transformCallback) {
//         const fullPath = path.resolve('out', `ast/${chunk.filePath}.json`)
//         mkdirp(fullPath.split('/').slice(0, -1).join('/'), (err) => {
//           if (err) fatalError(err)
//           console.log('transform', fullPath)
//           const fileWriteStream = fs.createWriteStream(fullPath)
//           fileWriteStream.on('error', fatalError)
//           fileWriteStream.on('finish', () => console.log('write', fullPath))
//           fileWriteStream.on('finish', transformCallback)

//           const stringifyStream = json.createStringifyStream({body: chunk.ast})
//           stringifyStream.on('error', fatalError)
//           stringifyStream.on('end', fileWriteStream.end)
//           stringifyStream.on('end', () => console.log('stringified', fullPath))
//           stringifyStream.pipe(fileWriteStream)
//         })
//       }
//     })
//     const relativeFilePath = path.relative(sourceDirPath, filePath)
//     stringifyWriteTransform.on('finish', resolve)
//     stringifyWriteTransform.on('error', fatalError)
//     stringifyWriteTransform.write({ filePath: `source/${relativeFilePath}`, ast })
//   })
// }

// const writeASTs = asts => Promise.all(asts.map(streamAST))

// endregion Unary Functions

// #region Declarations

/**
 * @property {string[]} args passed from the command line to this program
 */
const args = process.argv.slice(2)

// #endregion Declarations

module.exports = {
  dedupe,
  flatten,
  parseCode,
  parseCodeArray,
  logContext,
  safelyReadFile,
  readFiles,
  fatalError,
  setContext,
  processGlobPattern,
  processAllGlobPatterns,
  resolvePathFromCWD,
  resolveAllFilePathsFromCWD,
  status,
  args,
  createFilesHash,
  generateASTs,
  addFilesContentsToHash,
  saveContextToFileHash,
  readConfig,
  fromCacheToContext
}
