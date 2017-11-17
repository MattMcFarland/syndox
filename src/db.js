const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')

const adapter = new FileSync('out/db.json')
const db = low(adapter)

db.defaults({ index: {}, files: {} })
  .write()

module.exports = db
