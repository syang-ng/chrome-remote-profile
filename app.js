const fs = require('fs');
const util = require('util');
const async = require('async');
const program = require('commander');
const launcher = require('chrome-launcher');
const CDP = require('chrome-remote-interface');

// replace the Promise for high performance
global.Promise = require("bluebird");

const { config } = require('./config');
const { delay, formatDateTime } = require('./utils');
const { recentId, fetchNewUrls, finishProfile } = require('./db');

const writeFile = Promise.promisify(fs.writeFile);
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

const mMapFile = 'maps.txt';
let currentId = 0;
let mUrls = [];
let mMapFilePath = '';

function writeJson(id, seq, data) {
    const path = util.format('%s/%d_%d.json', config.dst, id, seq);
    return writeFile(path, JSON.stringify(data, null));
};

program
    .version('1.0.0')
    .option('-D --dst <path>', 'your output dst dir', './profiles')
    .option('-I --ip <host>', 'your chrome host ip', config.host)
    .option('-P --port <port>', 'your chrome debug port', config.port)
    .option('-T --timeout <time>', 'the time to profile', 2000)
    .option('-W --waittime <time>', 'the delay time to wait for website loading', 10000)
    .option('-M --max <conn>', 'the maximum tab at the same time', 3)
    .option('-B --begin <index>', 'the index of url to begin', 0);

/* profile the special url with new tab */
async function newTab(item, timeout, delayTime) {
    const url = item.url;
    const id = item.id;
    let total = 1;
<<<<<<< HEAD
=======
    let target = undefined;
>>>>>>> 5608eb464771c1baff5fcbf86732d91d6736728a
    try {
        console.log(2333)
        // new tab
<<<<<<< HEAD
        var target = await CDP.New({
=======
        target = await CDP.New({
>>>>>>> 5608eb464771c1baff5fcbf86732d91d6736728a
            host: config.host,
            port: config.port,
            url: url
        });
        // profile the page
        if (target.type === 'page') {
            var client = await CDP({
                host: config.host,
                port: config.port,
                target: target
            });
<<<<<<< HEAD
            let num = 1;
            let seq = 1;
            const map = new Map();
            const queue = new Array();
            const {Target, Profiler} = client;
            await Profiler.enable();        
            await Target.setAutoAttach({autoAttach: true, waitForDebuggerOnStart: false});
            Target.attachedToTarget(function (obj) {
                if (obj.sessionId !== null) {
                    queue.push(obj.sessionId);
                }
            });
            Target.receivedMessageFromTarget(function(obj) {
                const message = JSON.parse(obj.message);
                const number = map.get(message.id);
                if (number !== undefined && message.result.profile !== undefined) {
                    writeJson(id, total, message.result.profile);
                    total++;
                }
            });
            await delay(delayTime);
            await Profiler.start();
            await delay(timeout);
            const {profile} = await Profiler.stop();
            writeJson(id, 0, profile);
            let sessionId;
            while ((sessionId=queue.pop()) !== undefined) {
                await Target.sendMessageToTarget({
                    message: JSON.stringify({id: seq, method:"Profiler.enable"}),
                    sessionId: sessionId
                });                  
                seq++;
                await Target.sendMessageToTarget({
                    message: JSON.stringify({id: seq, method:"Profiler.start"}),
                    sessionId: sessionId
                });
                seq++;
                await delay(timeout);
                await Target.sendMessageToTarget({
                    message: JSON.stringify({id: seq, method:"Profiler.stop"}),
                    sessionId: sessionId
                });
                map.set(seq, num++);
                seq++;
            }
        }        
    } catch (err) {
        console.error(err);
    } finally {
=======
        }
    } catch (err) {
        console.error(err);
    } finally {
        console.log('finally')
>>>>>>> 5608eb464771c1baff5fcbf86732d91d6736728a
        if (target) {
            CDP.Close({
                host: config.host,
                port: config.port,
                id: target.id
            });
<<<<<<< HEAD
            finishProfile(id, total);
=======
            await finishProfile(id, total);
>>>>>>> 5608eb464771c1baff5fcbf86732d91d6736728a
        }
        if (client) {
            await client.close();
        }
    }
}

function init() {
    /* 命令行参数解析 */
    program.parse(process.argv);
    config.dst = program.dst;    
    config.host = program.ip;
    config.port = program.port; 
    currentId = program.begin;

    /* 并发执行 提高效率 */
    return Promise.all([
        /* 检查目的文件夹是否存在 */        
        new Promise((resolve)=>{
            if (!fs.existsSync(config.dst)) {
                fs.mkdirSync(config.dst);
            }
            resolve();
        }),
        /* 启动 chrome */
        launcher.launch({port: config.port})
    ]);
}

async function main() {
    try {
        /* initial */
        await init();
        /* run as server */
        while (true) {
            console.log(2333355667);
            const newId = await recentId();
<<<<<<< HEAD
=======
            console.log(23334455);
>>>>>>> 5608eb464771c1baff5fcbf86732d91d6736728a
            if (newId >= currentId) {
                /* fecth data */
                const rows = await fetchNewUrls(currentId, newId);
                /* run */
                console.log('************ begin! ************');
                await Promise.map(rows, async (item) => {
                    await newTab(item, program.timeout, program.waittime);
<<<<<<< HEAD
=======
                    console.log(item.id);
>>>>>>> 5608eb464771c1baff5fcbf86732d91d6736728a
                }, {concurrency: program.max});
                /*await mapLimit(rows, program.max, async (item) => {
                    await newTab(item, program.timeout, program.waittime);
                    console.log(item.id);
                });*/
                console.log('************ end! ************');
<<<<<<< HEAD
                currentId = newId + 1;
=======
                currentId = newId+1;
>>>>>>> 5608eb464771c1baff5fcbf86732d91d6736728a
            } else {
                /* delay for next request */
                await delay(30000);
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();                
    }
}

main();