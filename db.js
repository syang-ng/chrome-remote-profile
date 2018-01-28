const mysql = require('mysql2/promise');

const { dbConfig } = require('./config');
const { formatDateTime } = require('./utils');

async function recentId() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [row, field] = await connection.execute('select id from `profilerurl` order by id DESC limit 1');
        return row[0].id;
    } catch (err) {
        console.error(err);
        throw err;
    }
}
async function fetchNewUrls(id1, id2) {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [row, field] = await connection.execute(`SELECT * FROM \`profilerurl\` WHERE id BETWEEN ${id1} AND ${id2}`);
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
        const connection = await mysql.createConnection(dbConfig);
        console.log(sql);
        await connection.execute(sql);
    } catch (err) {
        console.error(err);
        throw err;
    }
}

exports.recentId = recentId;
exports.fetchNewUrls = fetchNewUrls;
exports.finishProfile = finishProfile;
