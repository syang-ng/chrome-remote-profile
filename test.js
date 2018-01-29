global.Promise = require("bluebird");

const {delay} = require('./utils');

l = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

async function tests() {
    await delay(1000);
    console.log(2333);
}

(async function () {
    await Promise.map(l, async (item) => {
        await tests()
    }, {concurrency: 3});
})().then(()=>{
    console.log(2333);
    process.exit();
})