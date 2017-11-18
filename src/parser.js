// @flow

import { MODULE_NAME } from './constants'
import cache from './cache'
import { path as objPath } from 'ramda'
import cosmiconfig from 'cosmiconfig'
import { resolve as resolvePath } from 'path'
import { parse as parseAST } from 'babylon'
import json from 'big-json'
import fs from 'fs'
import shortid from 'shortid'
// $FlowFixMe
import glob from 'glob'
import initDB from './db'

// $FlowFixMe
import { Transform } from 'stream'
// $FlowFixMe
import { promisify } from 'util'

// $FlowFixMe
const readFile = promisify(fs.readFile)

//# region Type Definitions
/** @typedef {string} K the key of a value in a key-value pair*/
type K = string
/** @typedef {any} V the value in a key-value pair*/
type V = any
/** @typedef {[K, V]} entry A key value pair specified in a tuple array [0,1] = [K,V] */
type entry = [K, V]
/** @typedef FileHash */
type FileHash = { [K]: FileHashItem }
/** @typedef FileHashItem containing info about a specific file, stored in a local database */
type FileHashItem = {
  ast: AST,
  data: string,
  fullPath: string,
  id: string,
  index: string,
}
/** @typedef AST Abstract Syntax Tree */
type AST = { ...AST }
/** @typedef Passthrough returns the original context */
type Passthrough = (any:any) => any
type Fn = (any:any) => any
type Config = {
  out: string
}
//# endregion

// #region Unary Functions

/**
 * Returns the value from database
 * @param {K} key 
 * @returns {V} value
 */
export const fromDB = (key:K):V => cache.get('db').get(key).value()
/**
 * Writes key value to database
 * @param {K} key write this key
 * @param {V} value with this value
 * @returns {void}
 */
export const toDB = (key:K, value:V):Promise<void> => Promise.resolve(cache.get('db').get(key).assign(value).write())

/**
 * Removes duplicates from the given array
 * @param {Array} arr dedupe this array
 * @returns {Array} deduped
 */
export const dedupe = (arr:any[]):any[] => arr.reduce((x, y) => x.includes(y) ? x : [...x, y], [])

/**
 * Flattens an array that is one level deep.
 * @param {Array} arr flatten this array
 * @returns {Array} deduped
 */
export const flatten = (arr:any[]):any[] => [].concat(...arr)

/**
 * create AST of given code
 * @param {string} code - code will be converted to AST
 * @returns {AST} Abstract Syntax Tree
 */
export const parseCode = (code:string):AST => parseAST(code)

/**
 * Parse an array of code
 * @param {string[]} codeArray - converts each string in codeArray to AST
 * @returns {AST[]} Array of Abstract Syntax Trees
 * @uses parseCode
 */
export const parseCodeArray = (codeArray:string[]):AST[] => codeArray.map(parseCode)

/**
 * Logs the current context to the console
 * @param {*} context log this
 * @returns {*} context
 */
export const logContext = (context:any):any => {
  console.log('ctx', context)
  return context
}

/**
 * Send a status message while in a promise chain
 * @param {string} msg
 * @returns {Passthrough} - context of the promise chain is unchanged.
 */
export const status = (msg:string):Passthrough => (context:any):any => {
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
 * Wipes the context to undefined, useful for controlling flow
 * @returns {void}
 */
export const voidContext = setContext(undefined)

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
export const readFiles = (filesArray:string[]):Promise<entry[]> => Promise.all(filesArray.map(safelyReadFile))

/**
 * Gets the fullPath property from each entry in the filehash
 * @param {FileHash[]} filehash 
 * @returns {Promise<string[]>}
 */
export const getFullPathsFromFileHash = (filehash:FileHash[]):Promise<string[]> => 
  Promise.all(Object.values(filehash).map(({fullPath}:V) => fullPath))

/**
 * Retrieves the FileHash from the db
 * @returns {FileHash[]}
 */
export const getFileHashFromDB = ():FileHash[] => fromDB('files')

/**
 * Saves the current context of promise chain to the fileHash[] in the DB
 * @param {any} context
 * @returns {Passthrough} - context of the promise chain is unchanged.
 */
export const saveContextToFileHash = (context:any):Promise<Passthrough> => toDB('files', context).then(() => context)

/**
 * Saves the current context of promise chain to the fileHash[]
 * @param {string} keyToAppend 
 * @returns {Passthrough} - context of the promise chain is unchanged.
 */
export const appendContextAsKeysToFileHash = (keyToAppend:string):Passthrough => (context:any):any => {
  const fileHash = getFileHashFromDB()
  return Promise.resolve(Object.entries(fileHash).reduce((hash, [key, value]:entry) => {
    const fullPath = value.fullPath
    value.data = context[fullPath]
    return hash
  }, {})).then(saveContextToFileHash).then(() => context)
}

/**
 * Converts entries to a POJO
 * @param {entry[]} entries 
 * @returns {any} converted entries
 */
export const convertEntriesToObject = (entries:entry[]):any => 
  entries.reduce((obj, [ key, value ]) => ({ ...obj, [key]: value }), {})

/**
 * Multistep procedure which takes the filehash from the db,
 * then reads all the filepaths from the glob,
 * then saves their data to the filehash for each respective file.
 * @returns {void} - context of the promise chain is voided on completion
 */
export const addFilesContentsToHash = ():Promise<any> =>
  Promise.resolve(getFileHashFromDB())
    .then(getFullPathsFromFileHash)
    .then(readFiles)
    .then(convertEntriesToObject)
    .then(appendContextAsKeysToFileHash('data'))
    .then(voidContext)
 /**
 * Logs error, exits 1
 * @param {Error} err error object
 * @returns {void} 
 */
export const fatalError = (err:Error):void => {
  console.error(err)
  process.exit(1)
}

/**
 * Processes a glob pattern to an array of files
 * @param {string} pattern pattern to resolve
 * @returns {Promise<string>} all matches found from the pattern
 * @throws {Error} If nothing is found
 */
export const processGlobPattern = (pattern:string):Promise<string> => 
  new Promise((resolve, reject) => {
    glob(pattern, (err, matches) => {
      if (err) return reject(err)
      return resolve(matches)
    })
  })

/**
 * Processes an array of glob patterns to an array of files
 * @param {string} pattern pattern to resolve
 * @returns {Promise<string[]>} all matches found from the pattern
 * @throws {Error} If nothing is found
 * @see processGlobPattern
 */
export const processAllGlobPatterns = (patterns:string[]):Promise<string[]> => Promise.all(patterns.map(processGlobPattern))

/**
 * Converts resolves the full path of the filepath relative to the current working directory.
 * @param {string} relativePath filepath to resolve
 * @returns {string} fullpath
 */
export const resolvePathFromCWD = (relativePath:string):$PropertyType<FileHashItem, 'fullpath'> => resolvePath(process.cwd(), relativePath)

/**
 * Resolves the full path all file patterns relative to the current working directory.
 * @param {string[]} relativePaths array of relative filepaths to resolve
 * @returns {string[]} fullpaths
 * @uses resolvePathFromCWD
 */
export const resolveAllFilePathsFromCWD = (relativePaths:string[]):string[] => relativePaths.map(resolvePathFromCWD)

/**
 * Creates base filehash for further read/writes, which will include fullpath and rel-path
 * @param {string[]} filepaths - relative paths, full paths will be added to them.
 * @returns {FileHash}
 */
export const createFilesHash = (filepaths: string[]):FileHash => 
  filepaths.reduce((hash:any, filepath) => Object.assign(hash, {
    [filepath]: createFileHashItem(filepath)
  }), {})


/**
 * Creates a file hash item just by given a relative file path.
 * @param {string} filepath 
 */
export const createFileHashItem = (filepath:string):FileHashItem => ({
  fullPath: resolvePathFromCWD(filepath),
  index: filepath,
  id: shortid.generate(),
  data: '',
  ast: {},
})

/**
 * Runs the process of pulling all file definitions from the database, then reading their data.
 */
export const generateASTs = () => {  
  const fileHash = fromDB('files')
  const withAST = Object.entries(fileHash).reduce((hash, [key, value]:entry) => {
    return Object.assign(hash, {
      [key]: {
        ast: safelyReadFile(value.fullPath),
        ...value
      }
    })
  }, {})
}

/**
 * Assigns current context to cache under the given key
 * @param {K} key 
 * @returns {V} saved value
 */
export const assignContextToCache = (key:K) => (context:any) => {
  cache.set(key, context)
  return context
}

/**
 * Gets a cache value, sets it as context
 * @param {K} key 
 * @returns {V} value
 */
export const fromCacheToContext = (key:string) => () => cache.get(key)

/**
 * Retrieves a config value, sets it as context
 * @param {string} keyOrPathToKey
 * @returns {Promise<V>} value
 */
export const fromConfig = (keyOrPathToKey:string) => ():Promise<V> =>
  Promise.resolve(fromCacheToContext('config'))
  .then(config => objPath(keyOrPathToKey.split('.'), config))

/**
 * Read config vars from .syndoxrc or package.json, return results
 * @returns {Promise<Config>}
 */
export const readConfig = ():Promise<Config> =>
  cosmiconfig(MODULE_NAME).load()
  .then(result => result.config)

/**
 * Reads Config then caches it as 'config' in cache map
 * @returns {Promise<Config>}
 */  
export const ReadConfigToCache = ():Promise<Config> =>
  readConfig()
  .then(assignContextToCache('config'))

/**
 * Initiailize the DB
 * @returns {Passthrough} - context of the promise chain is unchanged.
 */
export const initializeDB = ():Passthrough => (context:any):Promise<any> => 
  new Promise(resolve => {
    initDB().then(assignContextToCache('db')).then(() => resolve(context))
})
    
    
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

