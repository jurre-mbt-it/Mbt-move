import { Pool } from 'pg'
import fs from 'node:fs'
const url = /^DIRECT_URL="?([^"\n]+)"?/m.exec(fs.readFileSync('.env.local','utf8'))?.[1]
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
console.table((await pool.query(process.argv[2])).rows)
await pool.end()
