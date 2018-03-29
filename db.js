const mysql = require('mysql2/promise');
const redis = require('redis')

const { dbConfig, redisConfig } = require('./config');
const { formatDateTime } = require('./utils');


class DB {
    /**
     * 数据库构造函数
     * @param {number} limit - 线程池上限. 
     * @param {boolean} cover - 是否覆盖已处理数据项.
     * @param {object} config - 数据库配置.
     */
    constructor(redisLimit = 3, limit = 30, cover = false, config = dbConfig) {
        this.pool = mysql.createPool(
            Object.assign({
                connectionLimit: limit
            }, dbConfig)
        );
        this.cover = cover;
        this.redisClient = redis.createClient(6379, redisConfig.host);
    }

    /* 关闭数据库连接线程池和 redis 连接 */
    async close() {
        this.redisClient.quit();
        await this.pool.end();
    }

    /**
     * 返回数据库中最新的 id
     * @return {number} - 最新插入的 id.
     */
    async recentId() {
        const condition = !this.cover ? ' WHERE status is NULL ' : ' ';
        const sql = `SELECT id FROM \`profilerUrl\`${condition}ORDER BY id DESC LIMIT 1`;
        try {
            const [row, field] = await this.pool.query(sql);
            if (row.length === 0) {
                return undefined;
            } else {
                return row[0].id;
            }
        } catch (err) {
            console.error(err);
            throw err;
        }
    }

    async fetchNewUrlsMaster(totalUrls) {
        let times = totalUrls / 10;
        console.log('redis db need to find  ' + totalUrls + ' urls');
        console.log('redis db need to find  ' + times + ' times');
        let res = [];
        while (times--) {
            let curRes = await this.fetchNewUrls(10);
            for (let item of curRes)
                res.push(item);
            if (curRes.length < 10)
                break;
        }
        console.log('redis db find ' + res.length + ' urls');
        return res;
    }

    async fetchNewUrls(redisLimit) {
        let res = new Array();
        let redisFetches = [];
        for (let i = 0; i < redisLimit; i++) {
            redisFetches.push(new Promise(resolve => {
                this.redisClient.blpop('to_profile', 1, function (error, data) {
                    if (error) {
                        console.log('redis fetchNewUrls error : ', error);
                    }
                    resolve(data);
                });
            }));
        }
        await Promise.all(redisFetches)
            .then(function (rows) {
                for (let k in rows) {
                    if (rows[k] == null) {
                        break;
                    }
                    let strings = rows[k][1].split(',');
                    res.push({
                        'id': strings[0],
                        'url': strings[1]
                    });
                }
            });
        return res;
    }

    async fetchReRunUrlsMaster(totalUrls) {
        let times = totalUrls / 10;
        console.log('redis db need to find  ' + totalUrls + ' urls');
        console.log('redis db need to find  ' + times + ' times');
        let res = [];
        while (times--) {
            let curRes = await this.fetchReRunUrls(10);
            for (let item of curRes)
                res.push(item);
            if (curRes.length < 10)
                break;
        }
        console.log('redis db find ' + res.length + ' urls');
        return res;
    }

    async fetchReRunUrls(redisLimit) {
        const res = new Array();
        const redisFetches = new Array();
        for (let i = 0; i < redisLimit; i++) {
            redisFetches.push(new Promise(resolve => {
                this.redisClient.blpop('rerun', 1, function (error, data) {
                    if (error) {
                        console.log('redis fetchNewUrls error : ', error);
                    }
                    resolve(data);
                });
            }));
        }
        await Promise.all(redisFetches)
            .then(function (rows) {
                for (let k in rows) {
                    if (rows[k] == null) {
                        break;
                    }
                    let strings = rows[k][1].split(',');
                    res.push({
                        'id': strings[0],
                        'url': strings[1]
                    });
                }
            });
        console.log(res.length)
        return res;
    }

    /**
     * 完成 profile 后将数据写回数据库
     * @param {number} id - 对应 id.
     * @param {number} threads - 相应线程数.
     * @return {boolean} - 写入状态. 
     */
    async finishProfile(id, threads, requestUrls) {
        const timestamp = formatDateTime(new Date());
        const sql = `UPDATE \`profilerUrl\` SET status=4, threads=${threads}, finishTimeStamp="${timestamp}" WHERE id = ${id}`;
        try {
            console.log(sql);
            await this.pool.execute(sql);
            //return true;
        } catch (err) {
            console.error(err);
            //throw err;
        }
        for (let idx in requestUrls) {
            const request = requestUrls[idx];
            const url = request.url;
            const time = request.time;
            const requestUrl = request.requestUrl;
            const fileHash = request.fileHash;
            const category = request.category;
            const requestsUrlSql = `INSERT INTO  requestHistory(url, time, requestUrl,category, fileHash)VALUES("${url}", "${time}", "${requestUrl}", "${category}","${fileHash}")`;
            try {
                //       console.log('requestUrls : ' +requestsUrlSql);
                await this.pool.execute(requestsUrlSql);
            } catch (err) {
                console.error(err);
            }
        }
        return;
    }

    async startProfile(id) {
        const timestamp = formatDateTime(new Date());
        const sql = `UPDATE \`profilerUrl\` SET status=3, finishTimeStamp="${timestamp}" WHERE id = ${id}`;
        try {
            await this.pool.execute(sql);
        } catch (err) {
            console.error(err);
        }
        return;
    }

    async finishReRunHistory({id, url, cat, init}) {
        let sql;
        if (init !== undefined) {
            sql = `INSERT INTO \`rerunHistory\` (profilerUrlId, url, cat, init) VALUES (${id}, ${url}, ${cat}, ${init})`;
        } else {
            sql = `INSERT INTO \`rerunHistory\` (profilerUrlId, url, cat) VALUES (${id}, ${url}, ${cat})`;            
        }
        try {
            await this.pool.execute(sql);
        } catch (err) {
            console.error(err);
        }
        return;
    }
}

// test function
async function testRedis() {
    let db;
    try {
        db = new DB();
    } catch (error) {
        console.log(error);
    }
    for (let i = 0; i < 2; i++) {
        res = await db.fetchNewUrlsMaster(1000);
        for (let e in res) {

            console.log(res[e]);
        }
        console.log(typeof res);
        console.log(res.length);
    }
}
//testRedis();

module.exports = DB;
