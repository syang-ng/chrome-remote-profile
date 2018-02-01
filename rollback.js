const fs = require('fs');
const mysql = require('mysql2/promise');

const {dbConfig} = require('./config');

const pool = mysql.createPool(
    Object.assign({
        connectionLimit: 30
    }, dbConfig)
);

function fileExists(path, id) {
    const path = `${path}/${id}_0.json`;
    return fs.existsSync(path);
}

(async ()=> {
    const [rows, field] = await pool.query('select * from `profilerUrl` where status=1');
    for (let row of rows) {
        const id = row.id;
        if (!fileExists('./profiles', id)) {
            // pool.execute(`update \`profilerUrl\` set status=NULL, threads=NULL, finishTimeStamp=NULL, hashTimeProportion=NULL where id=${id}`);
            console.log(`update \`profilerUrl\` set status=NULL, threads=NULL, finishTimeStamp=NULL, hashTimeProportion=NULL where id=${id}`);            
        }
    }
})().then(()=>{
    console.log('Finish rollback!');
    pool.end();
});