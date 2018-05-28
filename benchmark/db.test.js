const DB = require('./db');

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

async function testDB() {
    let db;
    try {
        db = new DB();
    } catch (error) {
        console.log(error);
    }
    const ret = await db.fetchTimeSpaceUrls({round: 0});
    for(let item of ret) {
        console.log(JSON.stringify(item));
    } 
}

async function testFetchFromRedis(key) {
    let db;
    try{
        db = new DB();
        const rows = await db.fecthFromRedis({key, num: 10});
        for(let row of rows) {
            console.log(JSON.stringify(row))
        }
    } catch(err) {
        console.error(err);
    }
} 
//testRedis();
//testDB();
testFetchFromRedis('to_profile2');
