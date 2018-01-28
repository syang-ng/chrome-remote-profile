const fs = require('fs');
const util = require('util');
const async = require('async');
const program = require('commander');
const CDP = require('chrome-remote-interface');
//const launcher = require('chrome-launcher');

const { config } = require('./config');
const { formatDateTime } = require('./utils');

const mMapFile = 'maps.txt';
let count = 0;
let mUrls = [];
let mMapFilePath = '';

function readUrlFile(mUrlFile) {
    let content = fs.readFileSync(mUrlFile, 'utf8');
    // 将文件按行拆成数组并存储
    content.split(/\r?\n/).forEach(function (url) {
        if (url !== ''){
            mUrls.push(url);
        }
    });
};

function writeJson(url, seq, data) {
    const path = util.format('%s/%d_%d.json', config.dst, count, seq);//config.dst + '/' + formatFileName(url);
    fs.writeFile(path, JSON.stringify(data, null), function (err) {
        if (err) console.error(err);
    });
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
    .option('-S --src <path>', 'your scr input urls file', config.src)
    .option('-D --dst <path>', 'your output dst dir')
    .option('-I --ip <host>', 'your chrome host ip', config.host)
    .option('-P --port <port>', 'your chrome debug port', config.port)
    .option('-T --timeout <time>', 'the time to profile', 5000)
    .option('-W --waittime <time>', 'the delay time to wait for website loading', 6000)
    .option('-M --max <conn>', 'the maximum tab at the same time', 3)
    .option('-B --begin <index>', 'the index of url to begin', 0);

async function newTab(url, timeout=3000, delayTime=3000) {
    try {
        // new tab
        const target = await CDP.New({
            host: config.host,
            port: config.port,
            url: url
        });
        // profile
        if (target.type === 'page') {
            var client = await CDP({
                host: config.host,
                port: config.port,
                target: target
            });
            let threads = 0;
            let seq = 1;
            const map = new Map();
            const queue = new Array();
            const {Target, Profiler} = client;
            await Profiler.enable();        
            await Target.setAutoAttach({autoAttach: true, waitForDebuggerOnStart: false});
            Target.attachedToTarget(function (obj) {
                if (obj.sessionId !== null) {
                    threads++;
                    queue.push(obj.sessionId);
                    console.log(queue.length);
                }
            });
            var j = 0;
            Target.receivedMessageFromTarget(function(obj) {
                const message = JSON.parse(obj.message);
                const id = map.get(message.id);
                console.log("receive message %d, id: %d", j++, id);                
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
            await(delayTime);
            await Profiler.start();
            await delay(timeout);
            const {profile} = await Profiler.stop();
            writeJson(url, 0, profile);
            let sessionId;
            let i = 0;
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
                map.set(seq, threads);
                seq++;
            }
            if (!threads){
                console.log(2333);
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
    config.src = program.src;
    config.dst = program.dst || `${config.src}.profiles`;    
    config.host = program.ip;
    config.port = program.port; 
    count = program.begin;

    /* 输入 url 文件读取 */
    if(fs.existsSync(config.src)) {
        readUrlFile(config.src);
        if (count) {
            mUrls = mUrls.splice(count);
        }
        count = 1; 
    } else {
        console.error('url file doesn\'t exists!');
        return;
    }

    /* 检查目的文件夹是否存在 */
    if (!fs.existsSync(config.dst)) {
        fs.mkdirSync(config.dst);
    }

    /* url - 文件名 映射文件 */
    mMapFilePath = util.format('%s/%s', config.dst, mMapFile);
    fs.appendFile(mMapFilePath, `# ${formatDateTime(new Date())}\n`, function (err) {
        if (err) console.error(err);
    });

    /* 启动 Chrome */
    ///launcher.launch({port: config.port});
}

async function main() {
    /* 初始化 */
    init();
    
    /* 程序运行 */
    console.log('************ begin! ************');
    const begin = new Date().getTime(); 
    async.mapLimit(mUrls, program.max, async function (url) {
        await newTab(url, program.timeout, program.waittime);
        await delay(program.waittime/program.max)
    }, (err, results) => {
        if (err) console.error(err);
        const end = new Date().getTime();
        console.log('************ end! ************');
        console.log("runtime: %d", end-begin);
    });
}

main();