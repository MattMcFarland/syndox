import { MODULE_NAME } from './constants'
import cosmiconfig from 'cosmiconfig'
import low from 'lowdb'
import FileSync from 'lowdb/adapters/FileSync'
import mkdirp from 'mkdirp'
import path from 'path'

const config = cosmiconfig(MODULE_NAME)

export default () => 
  config.load(process.cwd())
  .then(result => result.config)
  .then(config => {
    return new Promise((resolve, reject) => {
      mkdirp(path.resolve(process.cwd(), config.out), err => {
        if (err) console.warn(err)        
        const adapter = new FileSync(`${config.out}/db.json`)
        const db = low(adapter)
        db.defaults({ index: {}, files: {} }).write()
        return resolve(db)
      })  
    })
  })

