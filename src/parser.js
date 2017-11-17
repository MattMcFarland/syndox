// @flow

import { MODULE_NAME } from './constants'
import cache from './cache'
import { path as objPath } from 'ramda'
import cosmiconfig from 'cosmiconfig'
import { resolve as resolvePath } from 'path'
import { parse as parseAST } from 'babylon'
import mkdirp from 'mkdirp'
import json from 'big-json'
import fs from 'fs'
import shortid from 'shortid'
// $FlowFixMe
import glob from 'glob'
import db from './db'

// $FlowFixMe
import { Transform } from 'stream'
// $FlowFixMe
import { promisify } from 'util'

// $FlowFixMe
const readFile = promisify(fs.readFile)

//# region Type Definitions
type K = string
type V = any
type entry = [K, V]
type entries = entry[]
type values = V[]
type keys = K[]
type FileHash = {
  fullPath: string,
  index: string,
  data: string
}
//# endregion

// #region Unary Functions

/**
 * Removes duplicates from the given array
 * @param {Array} arr dedupe this array
 */
export const dedupe = (arr:any[]) => arr.reduce((x, y) => x.includes(y) ? x : [...x, y], [])

/**
 * Flattens an array that is one level deep.
 * @param {Array} arr flatten this array
 */
export const flatten = (arr:any[]) => [].concat(...arr)

/**
 * create AST of given code
 * @param {string} code - code will be converted to AST
 * @returns {object} Abstract Syntax Tree
 */
export const parseCode = (code:string) => parseAST(code)

/**
 * Parse an array of code
 * @param {string[]} codeArray - converts each string in codeArray to AST
 * @returns {object[]} Array of Abstract Syntax Trees
 * @uses parseCode
 */
export const parseCodeArray = (codeArray:string[]) => codeArray.map(parseCode)

/**
 * Logs the current context to the console
 * @param {*} data log this
 * @returns {*} data
 */
export const logContext = (data:any) => {
  console.log('ctx', data)
  return data
}
/**
 * Send a status message while in a promise chain
 * @param {string} msg
 */
export const status = (msg:string) => (context:any) => {
  console.log('status', msg)
  return context
}

/**
 * Changes context in promise chain
 * @param {*} newContext next thing in promise chain will focus on this
 */
export const setContext = (newContext:any) => ():Promise<any> => 
  Promise.resolve(newContext)

/**
 * Only attempts to read real files, discarding directories, etc.
 * @param {string} filepath path to be read by fs.readFile
 * @returns {Promise<entry>} A promise of the file contents.
 * @see readFiles
 */
export const safelyReadFile = (filepath:string):Promise<entry> => {
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
      return
    })
  })
}

/**
 * Read the contents of all files in the given array
 * @param {string[]} filesArray - array of full paths to files
 * @returns {Promise<string[]>} - A promise when all files have been read
 * @uses safelyReadFile
 */
export const readFiles = (filesArray:string[]) => Promise.all(filesArray.map(safelyReadFile))

// export const addEntryToFileHash = ([key, value]) => db.get('files').assign({[key]: value}).write()
// export const addEntriesToFileHash = (entries) => Promise.all(entries.map(addEntryToFileHash))


export const getFullPathsFromFileHash = (filehash:FileHash) => Promise.all(Object.values(filehash).map(({fullPath}:V) => fullPath))
export const getFileHashFromDB = () => db.get('files').value()

export const saveContextToFileHash = (context:any) => {
  return db.get('files').assign(context).write()
}
export const appendContextAsKeysToFileHash = (keyToAppend:string) => (context:any) => {
  const fileHash = getFileHashFromDB()
  return Object.entries(fileHash).reduce((hash, [key, value]:entry) => {
    const fullPath = value.fullPath
    value.data = context[fullPath]
    return hash
  }, {})
}
export const convertEntriesToObject = (entries:entries) => {
  return entries.reduce((obj, [ key, value ]) => ({ ...obj, [key]: value }), {})
}

export const addFilesContentsToHash = ():Promise<any> =>
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
export const fatalError = (err:Error) => {
  console.error(err)
  process.exit(1)
}

/**
 * Processes a glob pattern to an array of files
 * @param {string} pattern pattern to resolve
 * @returns {Promise<string[]>} all matches found from the pattern
 * @throws {Error} If nothing is found
 * @see processGlobPattern
 */
export const processGlobPattern = (pattern:string):Promise<string[]> => 
  new Promise((resolve, reject) => {
    glob(pattern, (err, matches) => {
      if (err) return reject(err)
      return resolve(matches)
    })
  })


export const processAllGlobPatterns = (patterns:string[]) => Promise.all(patterns.map(processGlobPattern))

/**
 * Converts resolves the full path of the filepath relative to the current working directory.
 * @param {string} relativePath filepath to resolve
 */
export const resolvePathFromCWD = (relativePath:string) => resolvePath(process.cwd(), relativePath)

/**
 * Resolves the full path all file patterns relative to the current working directory.
 * @param {string[]} relativePaths array of relative filepaths to resolve
 * @uses resolvePathFromCWD
 */
export const resolveAllFilePathsFromCWD = (relativePaths:string[]) => relativePaths.map(resolvePathFromCWD)

// export const cacheFullFilePath = filePath => cache.get(`files.${filePath}`).assign({ fullPath })

/**
 * Creates base filehash for further read/writes, which will include fullpath and rel-path
 * @param {string[]} filepaths - relative paths, full paths will be added to them.
 * @returns {FileHash}
 */
export const createFilesHash = (filepaths: string[]) => {
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
export const generateASTs = () => {
  const fileHash = db.get('files').value()
  const withAST = Object.entries(fileHash).reduce((hash, [key, value]:entry) => {
    return Object.assign(hash, {
      [key]: {
        ast: safelyReadFile(value.fullPath),
        ...value
      }
    })
  }, {})
  console.dir(withAST)
}

export const readConfig = () =>
  cosmiconfig(MODULE_NAME)
  .then(result => result.config)

export const assignContextToCache = (key:K) => (context:any) => {
  cache.set(key, context)
  return context
}

export const fromCacheToContext = (key:string) => () => cache.get(key)

export const fromConfig = (keyOrPathToKey:string) => ():Promise<any> =>
  Promise.resolve(fromCacheToContext('config'))
  .then(config => objPath(keyOrPathToKey.split('.'), config))

export const bootstrapConfig = () =>
  readConfig()
  .then(assignContextToCache('config'))

// export const streamAST = ast => {
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

// export const writeASTs = asts => Promise.all(asts.map(streamAST))

// endregion Unary Functions

// #region Declarations

/**
 * @property {string[]} args passed from the command line to this program
 */
export const args = process.argv.slice(2)

// #endregion Declarations

