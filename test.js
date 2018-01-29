global.Promise = require("bluebird");

<<<<<<< HEAD
const async = require('async');
const {delay} = require('./utils')

const mapLimit = function (array, limit, fn) {
    return new Promise((resolve, reject)=>{
        async.mapLimit(array, limit, fn, (err, results)=>{
            if (err) {
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
}

l = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

mapLimit(l, 3, async (item)=>{
    await delay(4000);
    return item;
}).then((results)=>{
    console.log(results);
});
=======
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
>>>>>>> 5608eb464771c1baff5fcbf86732d91d6736728a
