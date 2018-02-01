const mysql = require('mysql2/promise');

const { dbConfig } = require('./config');
const { formatDateTime } = require('./utils');

class DB {
    /**
     * 数据库构造函数
     * @param {number} limit - 线程池上限. 
     * @param {boolean} cover - 是否覆盖已处理数据项.
     * @param {object} config - 数据库配置.
     */
    constructor (limit=30, cover=flase, config=dbConfig) {
        this.pool = mysql.createPool(
            Object.assign({
                connectionLimit: limit
            }, dbConfig)
        );
        this.cover = cover; 
    }

    /* 关闭数据库连接线程池 */    
    async close() {
        await this.pool.end();
    }

    /**
     * 返回数据库中最新的 id
     * @return {number} - 最新插入的 id.
     */
    async recentId() {
        const condition = !this.cover?' WHERE status is NULL ':' ';
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

    /**
     * 获得指定 id 范围内的数据
     * @param {number} id1 - 起始 id.
     * @param {number} id2 - 结束 id.
     * @param {number} limit - 范围限制.
     * @return {Array} - 返回数据数组. 
     */
    async fetchNewUrls(id1, id2, limit) {
        const condition = !this.cover?' status is NULL AND ':' ';
        const limitSql = limit?`LIMIT ${limit}`:'';
        const sql = `SELECT id, url FROM \`profilerUrl\` WHERE${condition}id BETWEEN ${id1} AND ${id2} ${limitSql}`;
        try {
            const [row, field] = await this.pool.query(sql);
            return row;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }

    /**
     * 完成 profile 后将数据写回数据库
     * @param {number} id - 对应 id.
     * @param {number} threads - 相应线程数.
     * @return {boolean} - 写入状态. 
     */
    async finishProfile(id, threads) {
        const timestamp = formatDateTime(new Date());
        const sql = `UPDATE \`profilerUrl\` SET status=1, threads=${threads}, finishTimeStamp="${timestamp}" WHERE id = ${id}`;
        try {
            console.log(sql);
            await this.pool.execute(sql);
            return true;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
}

module.exports = DB;