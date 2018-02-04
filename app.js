const fs = require('fs');
const util = require('util');
const program = require('commander');
const launcher = require('chrome-launcher');
const CDP = require('chrome-remote-interface');

// replace the Promise for high performance
global.Promise = require("bluebird");

const DB = require('./db');
const { env } = require('./env');
const { config,redisConfig  } = require('./config');
const { delay, formatDateTime} = require('./utils');

const writeFile = Promise.promisify(fs.writeFile);

let db;

/**
 * 封装了 json 的写入
 * @param {number} id   - url 在数据库中对应的 id.
 * @param {number} seq  - 该文件属于同一 url 的第几个文件.
 * @param {string} data - 需要写入的 json 数据. 
 */
function writeJson(id, seq, data) {
    const path = util.format('%s/%d_%d.json', config.dst, id, seq);
    return writeFile(path, JSON.stringify(data));
};

program
    .version('1.0.0')
    .option('-D --dst <path>', 'your output dst dir', '/home/lancer/share/')
    .option('-P --port <port>', 'your chrome debug port', config.port)
    .option('-T --timeout <time>', 'the time to profile', 8)
    .option('-W --waitTime <time>', 'the delay time to wait for website loading', 20)
    .option('-I --interval <time>', 'the interval of each tab', 2)
    .option('-N --num <number>', 'the number of tab profiler per hour', 900)
    .option('-E --env <env>', 'the environment', 'production');

/* profiler the special url with new tab */
async function newTab(item, timeout, waitTime) {    
    console.log('new tab ');
    console.log(item);
    const url = item.url;
    const id = item.id;
    let total = 1;
    try {
        // new tab
        const target = await CDP.New({
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
            let num = 0;
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
                const sId = map.get(message.id);
                if (sId !== undefined && message.result.profile !== undefined) {
                    writeJson(id, total, message.result.profile);
                    num--;
                    total++;
                    if (total > 4  || !num) {
                        CDP.Close({
                            host: config.host,
                            port: config.port,
                            id: target.id
                        });
                        db.finishProfile(id, total);
                    }
                }
            });
            await delay(waitTime);
            /* profile the main thread */
            await Profiler.setSamplingInterval({interval: 100});
            await Profiler.start();
            await delay(timeout);
            const {profile} = await Profiler.stop();
            writeJson(id, 0, profile);
            /* profile the other thread */
            let sessionId;
            num += queue.length;
		const subThreads = queue.length;
            await Promise.map(queue, async function(sessionId) {
                if (sessionId === undefined) {
                    return;
                }
                await Target.sendMessageToTarget({
                    message: JSON.stringify({id: seq, method:"Profiler.enable"}),
                    sessionId: sessionId
                });                  
                seq++;
                await Target.sendMessageToTarget({
                    message: JSON.stringify({id: seq, method:"Profiler.setSamplingInterval", params:{interval:100}}),
                    sessionId: sessionId
                });           
                seq++;
                await Target.sendMessageToTarget({
                    message: JSON.stringify({id: seq, method:"Profiler.start"}),
                    sessionId: sessionId
                });
                seq++;
                await delay(timeout);
                map.set(seq, sessionId);
                Target.sendMessageToTarget({
                    message: JSON.stringify({id: seq++, method:"Profiler.stop"}),
                    sessionId: sessionId
                });
            }, {concurrency: 4});
            //}, {concurrency: parseFloat('Infinity')});
            await delay(timeout+3);
            if (total > 4  || !num){
                CDP.Close({
                    host: config.host,
                    port: config.port,
                    id: target.id
                });
		console.log(item)
		console.log(id)
                db.finishProfile(id, 1);

            }
        }        
    } catch (err) {
        console.error(err);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

function init() {
    /* 命令行参数解析 */
    program.parse(process.argv);
    config.dst = program.dst;
    config.port = program.port;
    program.interval = parseInt(program.interval);
    program.toProfileUrlNums = parseInt(program.num);    

    if (program.env != 'production') {
        console.log('test env');
        config.dst = '/r910/share';
        redisConfig.host = '127.0.0.1';
    }

    config.chromeFlags = ['--headless'];
    if(env==='old') {
        config.chromeFlags.push('--no-sandbox');
    }

    /* 并发执行 提高效率 */
    return Promise.all([
        /* 检查目的文件夹是否存在 */        
        new Promise((resolve)=>{
            if (!fs.existsSync(config.dst)) {
                fs.mkdirSync(config.dst);
            }
            resolve();
        }),
        /* mysql 数据库对象创建 */        
        new Promise((resolve)=>{
            db = new DB(program.num, 300);
            resolve();
        })
    ]);
}

async function main() {
    try {
        /* initial */
        await init();
        const {interval, toProfileUrlNums, timeout, waitTime} = program;
        /* run as server */
        do {
            /* start Chrome */
            const chrome = await launcher.launch(config);
            /* run */
            console.log('************ begin! ************');
            console.log("App run at %s", formatDateTime(new Date()));
            console.log('want to fetch '+ toProfileUrlNums + ' urls');
            const rows = await db.fetchNewUrlsMaster(toProfileUrlNums);
            console.log('fetch from redis ' + rows.length + ' urls');
            if (rows.length == 0)
                break;
            for (let row of rows) {

                newTab(row, timeout, waitTime);
                await delay(interval);
            }
            console.log("App stop at %s", formatDateTime(new Date()));
            console.log('************ end! ************');
            /* delay for kill Chrome */
            await delay(60);
            await chrome.kill();
            if (rows.length < toProfileUrlNums)
                break;
        } while (true);
    } catch (err) {
        console.error(err);
    } finally {
        db.close();
        process.exit();                
    }
}

process.on("uncatchException", function(err) {
    console.error(err);
});

main();
