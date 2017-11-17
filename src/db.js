import { MODULE_NAME } from './constants'
import cosmiconfig from 'cosmiconfig'
import low from 'lowdb'
import FileSync from 'lowdb/adapters/FileSync'

export default () =>
  cosmiconfig(MODULE_NAME)
  .then(result => result.config)
  .then(config => {
    const adapter = new FileSync(`${config.out}/db.json`)
    const db = low(adapter)
    return db.defaults({ index: {}, files: {} }).write()
  })
