const mysql = require('mysql2/promise');
const { dbConfig } = require('./config')

const { recentId, fetchNewUrls, finishProfile } = require('./db');

(async function () {
    const data = await fetchNewUrls(5, 10);
    for(let item of data) {
        console.log(item.id);
    }
})().then(()=>{
    process.exit();
});