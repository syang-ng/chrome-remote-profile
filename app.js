const fs = require('fs');
const util = require('util');
const program = require('commander');
const CDP = require('chrome-remote-interface');
const launcher = require('chrome-launcher');

// replace the Promise for high performance
global.Promise = require("bluebird");

const { config } = require('./config');
const { formatDateTime } = require('./utils');
const { recentId, fetchNewUrls, finishProfile } = require('./db');

const writeFile = Promise.promisify(fs.writeFile);

const mMapFile = 'maps.txt';
let currentId = 0;
let mUrls = [];
let mMapFilePath = '';

function writeJson(id, seq, data) {
    const path = util.format('%s/%d_%d.json', config.dst, id, seq);
    return writeFile(path, JSON.stringify(data, null));
};

function delay(timeout) {
    return new Promise(function (resolve, reject) {
        setTimeout(function () {
            resolve();
        }, timeout);
    })
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
            let threads = 0;
            let num = 1;
            let seq = 1;
            const map = new Map();
            const queue = new Array();
            const {Target, Profiler} = client;
            await Profiler.enable();        
            await Target.setAutoAttach({autoAttach: true, waitForDebuggerOnStart: false});
            Target.attachedToTarget(function (obj) {
                if (obj.sessionId !== null) {
                    console.log(obj);
                    threads++;
                    queue.push(obj.sessionId);
                }
            });
            Target.receivedMessageFromTarget(function(obj) {
                const message = JSON.parse(obj.message);
                const id = map.get(message.id);
                if (id !== undefined) {
                    writeJson(url, id, message.result.profile);
                    threads--;
                    if(!threads){
                        CDP.Close({
                            host: config.host,
                            port: config.port,
                            id: target.id
                        });
                        fs.appendFile(mMapFilePath, util.format('%d %d %s\r\n', count, map.size+1, url), function (err) {
                            if (err) console.error(err);
                        });
                        count++;
                    }
                }
            });
            await delay(delayTime);
            await Profiler.start();
            await delay(timeout);
            const {profile} = await Profiler.stop();
            writeJson(url, 0, profile);
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
                let back = await Target.sendMessageToTarget({
                    message: JSON.stringify({id: seq, method:"Profiler.stop"}),
                    sessionId: sessionId
                });
                console.log("message %d, id: %d, back=%s", ++i, seq, JSON.stringify(back));
                map.set(seq, num++);
                seq++;
            }          
            if (!threads){
                CDP.Close({
                    host: config.host,
                    port: config.port,
                    id: target.id
                });
                fs.appendFile(mMapFilePath, util.format('%d %d %s\r\n', count, map.size+1, url), function (err) {
                    if (err) console.error(err);
                });
                count++;                
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
    count = program.begin;
    /* 并发执行 提高效率 */
    return Promise.all([
        /* 检查目的文件夹是否存在 */        
        new Promise((resolve)=>{
            if (!fs.existsSync(config.dst)) {
                fs.mkdirSync(config.dst);
            }
            resolve();
        }),
        /* url - 文件名 映射文件 */        
        new Promise((resolve)=>{
            mMapFilePath = util.format('%s/%s', config.dst, mMapFile);
            fs.appendFile(mMapFilePath, `# ${formatDateTime(new Date())}\n`, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
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
            const newId = await recentId();
            if (newId > currentId) {
                /* fecth data */
                const rows = await fetchNewUrls(currentId+1, newId);
                /* run */
                console.log('************ begin! ************');
                await Promise.map(rows, async (url) => {
                    await newTab(row, program.timeout, program.waittime);
                }, {concurrency: program.max});
                const end = new Date().getTime();
                console.log('************ end! ************');
                currentId = newId;
            } else {
                /* delay for next request */
                delay(30000);
            }
        }
        process.exit();
    } catch (err) {
        console.error(err);
    }
}

main();