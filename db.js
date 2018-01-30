const mysql = require('mysql2/promise');

const {
    dbConfig
} = require('./config');
const {
    formatDateTime
} = require('./utils');

let pool;

function createPool(limit) {
    pool = mysql.createPool(
        Object.assign({
            connectionLimit: limit
        }, dbConfig)
    );
}

async function endPool() {
    await pool.endPool();
}

async function recentId() {
    try {
        // connection = await mysql.createConnection(dbConfig);
        const [row, field] = await pool.execute('select id from `profilerurl` order by id DESC limit 1');
        return row[0].id;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function fetchNewUrls(id1, id2) {
    try {
        const [row, field] = await pool.execute(`SELECT * FROM \`profilerurl\` WHERE id BETWEEN ${id1} AND ${id2}`);
        return row;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function finishProfile(id, threads) {
    const timestamp = formatDateTime(new Date());
    const sql = `UPDATE \`profilerurl\` SET status=1, threads=${threads}, finishTimeStamp="${timestamp}" WHERE id = ${id}`;
    try {
        console.log(sql);
        await pool.execute(sql);
        return true;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

exports.createPool = createPool;
exports.endPool = endPool;
exports.recentId = recentId;
exports.fetchNewUrls = fetchNewUrls;
exports.finishProfile = finishProfile;