const fs = require('fs');
const util = require('util');
const program = require('commander');
const launcher = require('chrome-launcher');
const CDP = require('chrome-remote-interface');

// replace the Promise for high performance
global.Promise = require("bluebird");

const { config } = require('./config');
const { delay, formatDateTime } = require('./utils');
const { createPool, endPool, recentId, fetchNewUrls, finishProfile } = require('./db');

const writeFile = Promise.promisify(fs.writeFile);

let currentId = 0;

function writeJson(id, seq, data) {
    const path = util.format('%s/%d_%d.json', config.dst, id, seq);
    return writeFile(path, JSON.stringify(data));
};

program
    .version('1.0.0')
    .option('-D --dst <path>', 'your output dst dir', './profiles')
    .option('-I --ip <host>', 'your chrome host ip', config.host)
    .option('-P --port <port>', 'your chrome debug port', config.port)
    .option('-T --timeout <time>', 'the time to profile', 12500)
    .option('-W --waittime <time>', 'the delay time to wait for website loading', 12500)
    .option('-M --max <conn>', 'the maximum tab at the same time', 5)
    .option('-B --begin <index>', 'the index of url to begin', 0)
    .option('-E --end <index>', 'the index of url to end', undefined);

/* profile the special url with new tab */
async function newTab(item, timeout, delayTime) {
    const url = item.url;
    const id = item.id;
    let total = 1;
    try {
        // new tab
        var target = await CDP.New({
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
            let num = 1;
            let seq = 1;
            const map = new Map();
            const queue = new Array();
            const {Target, Profiler} = client;
            await Profiler.enable();        
            await Target.setAutoAttach({autoAttach: true, waitForDebuggerOnStart: false});
            Target.attachedToTarget(function (obj) {
                if (obj.sessionId !== null) {
                    console.log(obj.sessionId);
                    queue.push(obj.sessionId);
                }
            });
            Target.receivedMessageFromTarget(function(obj) {
                const message = JSON.parse(obj.message);
                const number = map.get(message.id);
                if (number !== undefined && message.result.profile !== undefined) {
                    writeJson(id, total, message.result.profile);
                    total++;
                    if (writeTotal !== undefined && total > writeTotal) {
                        finishProfile(id, total);                        
                    }
                }
            });
            await delay(delayTime);
            await Profiler.setSamplingInterval({interval: 100});
            await Profiler.start();
            await delay(timeout);
            const {profile} = await Profiler.stop();
            writeJson(id, 0, profile);
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
                map.set(seq, num++);
                seq++;
            }, {concurrency: 1});
        }        
    } catch (err) {
        console.error(err);
    } finally {
        if (target) {
            CDP.Close({
                host: config.host,
                port: config.port,
                id: target.id
            });
            var writeTotal = total;
            finishProfile(id, total);
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
    currentId = parseInt(program.begin);
    program.max = parseInt(program.max);

    /* mysql 线程池创建 */
    createPool(program.max*3);

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
            let newId;      
            if (program.end) {
                newId = parseInt(program.end);
                program.end = undefined;
            } else {
                newId = await recentId();                
            }
            if (newId >= currentId) {
                /* fecth data */
                const rows = await fetchNewUrls(currentId, newId);
                /* run */
                console.log('************ begin! ************');
                const begintime = Date.now();
                await Promise.map(rows, async (item, index) => {
                    if (index < program.max) {
                        console.log(index);
                        await delay(program.waittime/program.max*index);
                    }
                    await Promise.race([
                        newTab(item, program.timeout, program.waittime),
                        delay(program.waittime*2+program.timeout) // 确保资源释放
                    ]);
                }, {concurrency: program.max});
                const endtime = Date.now();                
                console.log('************ end! ************');
                console.log('the task run: %ds', (endtime-begintime)/1000);
                currentId = newId + 1;
            } else {
                /* delay for next request */
                await delay(30000);
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        endPool();        
        process.exit();                
    }
}

process.on("uncatchException", function(err) {
    console.error(err);
});

main();
