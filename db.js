const mysql = require('mysql2/promise');

const { dbConfig } = require('./config');
const { formatDateTime } = require('./utils');

async function recentId() {
    let connection;    
    try {
        connection = await mysql.createConnection(dbConfig);
        const [row, field] = await connection.execute('select id from `profilerurl` order by id DESC limit 1');
        return row[0].id;
    } catch (err) {
        console.error(err);
        throw err;
    } finally {
        connection.close();        
    }
}
async function fetchNewUrls(id1, id2) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [row, field] = await connection.execute(`SELECT * FROM \`profilerurl\` WHERE id BETWEEN ${id1} AND ${id2}`);
        return row;
    } catch (err) {
        console.error(err);
        throw err;
    } finally {
        connection.close();        
    }
}

async function finishProfile(id, threads) {
    let connection;
    const timestamp = formatDateTime(new Date());
    const sql = `UPDATE \`profilerurl\` SET status=1, threads=${threads}, finishTimeStamp="${timestamp}" WHERE id = ${id}`;
    try {
        console.log(sql);
        connection = await mysql.createConnection(dbConfig);
        await connection.execute(sql);
        return true;
    } catch (err) {
        console.error(err);
        throw err;
    } finally {
        connection.close();        
    }
}

exports.recentId = recentId;
exports.fetchNewUrls = fetchNewUrls;
exports.finishProfile = finishProfile;
