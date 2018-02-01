const fs = require('fs');
const util = require('util');
const program = require('commander');
const launcher = require('chrome-launcher');
const CDP = require('chrome-remote-interface');

// replace the Promise for high performance
global.Promise = require("bluebird");

const DB = require('./db');
const { config } = require('./config');
const { delay, formatDateTime } = require('./utils');

const writeFile = Promise.promisify(fs.writeFile);

let db;
let currentId = 0;
let forever = false;

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
    .option('-I --ip <host>', 'your chrome host ip', config.host)
    .option('-P --port <port>', 'your chrome debug port', config.port)
    .option('-T --timeout <time>', 'the time to profile', 10)
    .option('-W --waittime <time>', 'the delay time to wait for website loading', 30)
    .option('-M --max <conn>', 'the maximum tab at the same time', 5)
    .option('-B --begin <index>', 'the index of url to begin', 0)
    .option('-E --end <index>', 'the index of url to end', undefined)
    .option('-C --cover <boolean>', 'whether to cover the data')
    .option('-F --forever <yes/no>', 'whether to run forever')

/* profiler the special url with new tab */
async function newTab(item, timeout, delayTime) {
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
                    if (!num) {
                        CDP.Close({
                            host: config.host,
                            port: config.port,
                            id: target.id
                        });
                        db.finishProfile(id, total);
                    }
                }
            });
            await delay(delayTime);
            /* profile the main thread */
            await Profiler.setSamplingInterval({interval: 100});
            await Profiler.start();
            await delay(timeout);
            const {profile} = await Profiler.stop();
            writeJson(id, 0, profile);
            /* profile the other thread */
            let sessionId;
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
                await Target.sendMessageToTarget({
                    message: JSON.stringify({id: seq, method:"Profiler.stop"}),
                    sessionId: sessionId
                });
                map.set(seq, sessionId);
                num++;
                seq++;
            }, {concurrency: 1});
            if (!num) {
                CDP.Close({
                    host: config.host,
                    port: config.port,
                    id: target.id
                });
                db.finishProfile(id, total);
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
    config.host = program.ip;
    config.port = program.port; 
    currentId = parseInt(program.begin);
    program.max = parseInt(program.max);
    const cover = program.cover?true:false;
    forever = program.forever?true:false;

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
            db = new DB(program.max*3, cover);
            resolve();
        }),
        /* 启动 Chrome */
        launcher.launch({port: config.port})
    ]);
}

async function main() {
    try {
        /* initial */
        await init();
        /* run as server */
        do {
            let newId;      
            if (program.end) {
                newId = parseInt(program.end);
                program.end = undefined;
            } else {
                newId = await db.recentId();
            }
            if (newId >= currentId) {
                /* fecth data */
                const rows = await db.fetchNewUrls(currentId, newId);
                const nextId = rows[rows.length-1].id + 1;
                /* run */
                console.log('************ begin! ************');
                console.log("App run at %s", formatDateTime(new Date()));
                await Promise.map(rows, async (item, index) => {
                    if (index < program.max) {
                        await delay(program.waittime/program.max*index);
                    }
                    await Promise.race([
                        newTab(item, program.timeout, program.waittime),
                        delay(program.waittime*2+program.timeout*5) // 确保资源释放
                    ]);
                }, {concurrency: program.max});
                console.log("App stop at %s", formatDateTime(new Date()));
                console.log('************ end! ************');
                currentId = nextId;
            } else {
                /* delay for next request */
                await delay(60);
            }
        } while (forever);
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
