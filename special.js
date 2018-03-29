const fs = require('fs');
const util = require('util');
const program = require('commander');
const launcher = require('chrome-launcher');
const CDP = require('chrome-remote-interface');
const exec = require('child_process').exec;

// replace the Promise for high performance
global.Promise = require("bluebird");

const DB = require('./db');
const { env } = require('./env');
const { config,redisConfig } = require('./config');
const { delay, formatDateTime } = require('./utils');

const writeFile = Promise.promisify(fs.writeFile);
const chmod = Promise.promisify(fs.chmod);

let db;

async function writeJson(id, seq, data) {
    const path = util.format('%s/%d_%d.json', config.dst, id, seq);
    try {
        await writeFile(path, JSON.stringify(data));
        const stat = fs.statSync(path);
        if (stat.uid === process.getuid()) {
            await chmod(path, '666')
        }
    } catch (err) {
        console.error(err);
    }
    return;
}

async function writeJS(data, id, scriptId) {
    // TODO accessdb
    //  if (url.endsWith('.jpg') || url.endsWith('.png') || url.endsWith('.gif') || url.endsWith('.css')|| url.endsWith('.html') || url.endsWith('.htm') || url.endsWith('.svg') ||url.startsWith('data:image') || url.includes('.css?') || url.includes('.png?')|| url.includes('.gif?')|| url.includes('.jpg?')) {
       // return;
    //}
    const path = util.format('%s/%d_%d.js', config.dst, id, scriptId);
    try {
        await writeFile(path, JSON.stringify(data));
        const stat = fs.statSync(path);
        if (stat.uid === process.getuid()) {
            await chmod(path, '666')
        }
    } catch (err) {
        console.error(err);
    }
}

const rcvNetworkRequestWillBeSent = async function({id, url, initiator}) {
    await db.finishReRunHistory({
        id: id,
        url: url,
        cat: 'request',
        init: JSON.stringify(JSON.parse(initiator))
    });
}

const rcvDebuggerGetScriptSource = async function(data, others) {
    // return if data is null or undefined
    if (data === undefined || data === null) {
        return;
    }
    const {id, scriptId} = others;
    await writeJS(data, id, scriptId);
}

const rcvNetworkGetResponseBody = function(data, others) {
    // return if data is null or undefined
    if (data === undefined || data === null) {
        return;
    }
    //writeJS(data, fileMd5, others.requestUrl);
}

const rcvProfileStop = async function(id, seq, data) {
    await writeJson(id, seq, data);
}

const callbackMap = new Map([
    ['Network.requestWillBeSent', rcvNetworkRequestWillBeSent]
]);

program
    .version('1.0.0')
    .option('-D --dst <path>', 'your output dst dir', '/home/lancer/share/rerun')
    .option('-P --port <port>', 'your chrome debug port', config.port)
    .option('-T --timeout <time>', 'the time to profile', 8)
    .option('-W --waitTime <time>', 'the delay time to wait for website loading', 20)
    .option('-I --interval <time>', 'the interval of each tab', 5)
    .option('-N --num <number>', 'the number of tab to profile before chrome restart', 1000)
//.option('-N --num <number>', 'the number of tab profiler per hour', 3600)
    .option('-E --env <env>', 'the environment', 'production');

/* profiler the special url with new tab */
async function newTab(item, timeout, waitTime) {
    const url = item.url;
    const id = item.id;
    let client;
    try {
        // new tab
        const target = await CDP.New({
            host: config.host,
            port: config.port,
            url: url
        });
        // profile the page
        if (target.type === 'page') {
            client = await CDP({
                host: config.host,
                port: config.port,
                target: target
            });
            
            let num = 0;
            let seq = 1;
            let total = 1;            
            const callbackArray = new Array();
            const sessions = new Set();
            // const requestUrls = [];
            const initTime = new Date();
            const paramsArray = new Array();
            
            const {Debugger, Network, Target, Profiler} = client;
            
            await Promise.all([
                Debugger.enable(),
                Network.enable({maxTotalBufferSize: 10000000, maxResourceBufferSize: 5000000}),
                Profiler.enable(),
            ]);

            await Target.setAutoAttach({autoAttach: true, waitForDebuggerOnStart: false});        
            
            Debugger.scriptParsed(async ({scriptId}) => {
                try {
                    const {scriptSource} = await Debugger.getScriptSource({scriptId: scriptId});
                    await rcvDebuggerGetScriptSource(scriptSource, {id, scriptId});
                } catch(err) {
                    console.log('script source error!');
                    console.error(err);
                }
            });

            Network.requestWillBeSent(async ({initiator}) => {
                await db.finishReRunHistory({
                    id: id,
                    url: url,
                    cat: 'request',
                    init: JSON.stringify(JSON.parse(initiator))
                });
            });

            Target.attachedToTarget((obj) => {
                if (obj.sessionId !== undefined) {
                    let sessionId = obj.sessionId;
                    console.log(`attched: ${sessionId}`);
                    sessions.add(sessionId);
                    Target.sendMessageToTarget({
                        message: JSON.stringify({id: seq++, method:"Debugger.enable"}),
                        sessionId: sessionId
                    });
                    Target.sendMessageToTarget({
                        message: JSON.stringify({id: seq++, method:"Network.enable", params:{"maxTotalBufferSize":10000000,"maxResourceBufferSize":5000000}}),
                        sessionId: sessionId
                    });
                    Target.sendMessageToTarget({
                        message: JSON.stringify({id: seq++, method:"Profiler.enable"}),
                        sessionId: sessionId
                    });
                }
            });
            Target.detachedFromTarget((obj) => {
                if (obj.sessionId !== undefined) {
                    console.log(`detached: ${obj.sessionId}`);
                    sessions.delete(obj.sessionId);
                }
            });
            Target.receivedMessageFromTarget(async (obj)=>{
                const message = JSON.parse(obj.message);
                const deltaTime = new Date() - initTime;
                let callback, others;
                if (message.method === 'Debugger.scriptParsed') {
                    callbackArray[seq] = rcvDebuggerGetScriptSource;
                    paramsArray[seq] = {id: id, scriptId: message.params.scriptId};
                    Target.sendMessageToTarget({
                        message: JSON.stringify({id: seq++, method:"Debugger.getScriptSource", params:{scriptId: message.params.scriptId}}),
                        sessionId: obj.sessionId
                    });
                } else if (message.method !== undefined) {
                    callback = callbackMap.get(message.method);
                    const initiator = message.params.initiator;
                    if(callback !== undefined) {
                        await callback({id, url, initiator});
                    }
                } else if(message.id !== undefined) {
                    callback = callbackArray[message.id];
                    if (callback === rcvProfileStop){
                        await callback(id, total++, message.result.profile);                      
                    } else if(callback === rcvDebuggerGetScriptSource){
                        others = paramsArray[message.id];                        
                        await callback(message.result.scriptSource, others);
                        delete paramsArray[message.id];
                    } 
                    delete callbackArray[message.id];
                }
            });
            await delay(waitTime);
            let pSessions = Array.from(sessions);
            if (pSessions.length > 8) {
                pSessions = pSessions.slice(0, 8);
            }
            await Promise.all([
                (async()=>{
                    /* profile the main thread */
                    await Profiler.setSamplingInterval({interval: 100});
                    await Profiler.start();
                    await delay(timeout);
                    const {profile} = await Profiler.stop();
                    await writeJson(id, 0, profile);
                })(),
                (async()=>{
                    /* profile the other thread */
                    await Promise.map(pSessions, async (sessionId)=>{
                        await Target.sendMessageToTarget({
                            message: JSON.stringify({id: seq++, method:"Profiler.setSamplingInterval", params:{interval:100}}),
                            sessionId: sessionId
                        });           
                        await Target.sendMessageToTarget({
                            message: JSON.stringify({id: seq++, method:"Profiler.start"}),
                            sessionId: sessionId
                        });
                        await delay(timeout);
                        callbackArray[seq] = rcvProfileStop;
                        Target.sendMessageToTarget({
                            message: JSON.stringify({id: seq++, method:"Profiler.stop"}),
                            sessionId: sessionId
                        });
                    }, {concurrency: 8});
                 })()
            ]);
            num += sessions.size;
            await new Promise(async (resolve, reject)=>{
                let count = 0;
                while (total <= num && count < 10) {
                    await delay(0.5);
                    count++;
                }
                resolve();                
            });
            await CDP.Close({
                host: config.host,
                port: config.port,
                id: target.id
            });
        }
    } catch (err) {
        console.log('tab error!');
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
        config.dst = './rerun';
        // delete config['chromePath'];
        // redisConfig.host = '127.0.0.1';
        program.toProfileUrlNums = 1;
    }

    config.chromeFlags = ['--headless'];
    if(env === 'old') {
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
        })
    ]);
}

async function main() {
    try {
        /* initial */
        await init();
        const {interval, toProfileUrlNums, timeout, waitTime} = program;
        /* init db */
        db = new DB(program.num, 300);                
        /* run */
        console.log('************ begin! ************');
        console.log("App run at %s", formatDateTime(new Date()));
        console.log('want to fetch '+ toProfileUrlNums + ' urls');
        const rows = await db.fetchReRunUrlsMaster(toProfileUrlNums);
        /*const rows = [{id: 1621940, url: 'https://browsermine.com/'}];*/ 
        console.log('fetch from redis ' + rows.length + ' urls');
        if (rows.length === 0)
            return;
        for (let row of rows) {
            try {
                /* start Chrome */                        
                const chrome = await launcher.launch(config);                        
                await newTab(row, timeout, waitTime);                        
                await chrome.kill();
            } catch (err) {
                console.error(err)
            } finally {
                const cmd = `pkill -f port=${config.port}`;
                console.log(cmd);
                exec(cmd, (error, stdout, stderr) => {
                    console.log(`${stdout}`);
                    console.log(`${stderr}`);
                    if (error !== null) {
                        console.log(`exec error: ${error}`);
                    }
                });
            }
        }
        /* delay for kill Chrome */
        await db.close();
        if (program.env != 'production')
            return;
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();                
    }
}

process.on("uncatchException", function(err) {
    console.error(err);
});

main();
