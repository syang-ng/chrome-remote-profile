const fs = require('fs');
const util = require('util');
const program = require('commander');
const launcher = require('chrome-launcher');
const CDP = require('chrome-remote-interface');
// replace the Promise for high performance
global.Promise = require("bluebird");

const DB = require('./db');
const { env } = require('./env');
const { config,redisConfig } = require('./config');
const { delay, formatDateTime} = require('./utils');

const writeFile = Promise.promisify(fs.writeFile);
const chmod = Promise.promisify(fs.chmod);

let db;

async function writeJson({firstSeen, round, seq, data}) {
    const path = util.format('%s/%d/%d/%d.json', config.dst, firstSeen, round, seq);
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

async function writeJS({data, firstSeen, round, scriptId, url}) {
    // TODO accessdb
    if (!url || url.endsWith('.jpg') || url.endsWith('.png') || url.endsWith('.gif') || url.endsWith('.css') || url.endsWith('.svg') ||url.startsWith('data:image') || url.includes('.css?') || url.includes('.png?')|| url.includes('.gif?')|| url.includes('.jpg?')) {
       return;
    }
    const path = `${config.dst}/${firstSeen}/${round}/${scriptId}.js`;
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

function mkSubDir({firstSeen, round}) {
    let path = `${config.dst}/${firstSeen}`;
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
    path = `${config.dst}/${firstSeen}/${round}`;
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
}

const rcvNetworkRequestWillBeSent = async function({id, url, initiator, sourceUrl, requestId}) {
    if(!id||!url||!response||!requestId) {
        return;
    }
    await db.finishTimeSpaceHistory({
        id: id,
        url: url,
        cat: 'request',
        init: JSON.stringify(initiator),
        sourceUrl: sourceUrl,
        requestId
    });
}

const rcvNetworkResponseReceived = async function({id, url, response, requestId}) {
    if(!id||!url||!response||!requestId) {
        return;
    }
    await db.finishTimeSpaceHistory({
        id,
        url,
        requestId,
        sourceUrl: response.url,
        cat: 'response',
        init: JSON.stringify(response),
    });
}

const rcvDebuggerGetScriptSource = async function(data, others) {
    // return if data is null or undefined
    if (!data || data.length === 0) {
        return;
    }
    const {firstSeen, round, scriptId, url} = others;
    await writeJS({data, firstSeen, round, scriptId, url});
}

const rcvNetworkGetResponseBody = function(data, others) {
    if (!data || data.length === 0) {
        return;
    }
    // const {id, url} = others; // await writeJS(data, id, url);
}

const rcvProfileStop = async function({firstSeen, round, seq, data}) {
    await writeJson({firstSeen, round, seq, data});
}

const callbackMap = new Map([
    ['Network.requestWillBeSent', rcvNetworkRequestWillBeSent],
    ['Network.responseReceived', rcvNetworkResponseReceived]
]);

program
    .version('1.0.0')
    .option('-D --dst <path>', 'your output dst dir', '/home/lancer/share/timespace')
    .option('-P --port <port>', 'your chrome debug port', config.port)
    .option('-T --timeout <time>', 'the time to profile', 8)
    .option('-W --waitTime <time>', 'the delay time to wait for website loading', 20)
    .option('-I --interval <time>', 'the interval of each tab', 5)
    .option('-R --round <number>', 'current round', 0)
    .option('-N --num <number>', 'the number of tab to profile before chrome restart', 100)   
    .option('-E --env <env>', 'the environment', 'production');

/* profiler the special url with new tab */
async function newTab(item, timeout, waitTime) {
    const url = item.url;
    const id = item.id;
    const firstSeen = item.firstSeen;
    const round = item.round;
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
            mkSubDir({firstSeen, round});
            let seq = 1;
            let total = 1;
            let websocket = undefined;
            const callbackArray = new Array();
            const paramsArray = new Array();      
            const sessions = new Set();
            const requestsMap = new Map();
            const wsFrames = new Array();

            const {Debugger, Network, Target, Profiler} = client;
            
            await Promise.all([
                Debugger.enable(),
                Network.enable({maxTotalBufferSize: 10000000, maxResourceBufferSize: 5000000}),
                Profiler.enable(),
            ]);

            await Target.setAutoAttach({autoAttach: true, waitForDebuggerOnStart: false}); 
            
            Debugger.scriptParsed(async ({scriptId, url}) => {
                try {
                    const {scriptSource} = await Debugger.getScriptSource({scriptId: scriptId});
                    await rcvDebuggerGetScriptSource(scriptSource, {id, scriptId, url, firstSeen, round});
                } catch(err) {
                    console.error(err);
                }
            });

            Network.requestWillBeSent(async ({requestId, request, initiator}) => {
                const sourceUrl = request.url;
                await rcvNetworkRequestWillBeSent({id, url, initiator, sourceUrl, requestId});
            });

            Network.responseReceived(async ({requestId, response})=>{
                await rcvNetworkResponseReceived({id, url, response, requestId});
            });

            Network.webSocketCreated(({url, initiator, requestId})=>{
                websocket = {url, initiator, requestId};
            });

            Network.webSocketFrameSent(({response})=>{
                wsFrames.push(response.payloadData);
            });

            Network.webSocketFrameReceived(({response})=>{
                wsFrames.push(response.payloadData);                
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
                let callback, others;
                if (message.method === 'Debugger.scriptParsed') {
                    callbackArray[seq] = rcvDebuggerGetScriptSource;
                    paramsArray[seq] = {id: id, scriptId: message.params.scriptId, url: message.params.url, firstSeen, round};
                    Target.sendMessageToTarget({
                        message: JSON.stringify({id: seq++, method:"Debugger.getScriptSource", params:{scriptId: message.params.scriptId}}),
                        sessionId: obj.sessionId
                    });
                } else if (message.method !== undefined) {
                    callback = callbackMap.get(message.method);
                    if(callback === rcvNetworkRequestWillBeSent) {
                        const {initiator, request, requestId} = message.params;
                        const sourceUrl = request.url;
                        await callback({id, url, initiator, sourceUrl});
                    } else if (callback === rcvNetworkResponseReceived) {
                        const {response, requestId} = message.params;                        
                        await callback({id, url, requestId, response})
                    }
                } else if(message.id !== undefined) {
                    callback = callbackArray[message.id];
                    if (callback === rcvProfileStop){
                        await callback({firstSeen, round, seq: total++, data: message.result.profile});                      
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
                    await writeJson({firstSeen, round, seq: 0, data: profile});
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
            await Promise.all([
                db.updateTimeSpaceUrls({id: id, threads: sessions.size+1}),
                new Promise(async (resolve, reject)=>{
                    if(websocket !== undefined) {
                        await db.finishTimeSpaceHistory({
                            id,
                            url,
                            cat: 'websocket',
                            init: JSON.stringify(websocket.initiator),
                            requestId: websocket.requestId,
                            sourceUrl: websocket.url,
                            frames: JSON.stringify(wsFrames.slice(0, 16))
                        });
                    }
                    resolve();
                }),
                new Promise(async (resolve, reject)=>{
                    let count = 0;
                    while (total <= sessions.size && count < 10) {
                        await delay(0.5);
                        count++;
                    }
                    resolve();                
                })
            ]);
            await CDP.Close({
                host: config.host,
                port: config.port,
                id: target.id
            });
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
    program.num = parseInt(program.num);
    if (program.env != 'production') {
        console.log('test env');
        config.dst = './timespace';
        // delete config['chromePath'];
        // redisConfig.host = '127.0.0.1';
    }

    config.chromeFlags = ['--headless'];
    if(env === 'old') {
        config.chromeFlags.push('--no-sandbox');
    }

    return Promise.all([
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
        /* init */        
        await init();
        const {interval, timeout, waitTime, round, num} = program;
        /* run */
        console.log('************ begin! ************');
        db = new DB(num, 300);
        const rows = await db.fecthFromRedis({key: 'timespace', num})
        /*const rows = [{id: 1621940, url: 'https://browsermine.com/'}];*/
        for (let row of rows) {
            try {
                const chrome = await launcher.launch(config);
                await newTab(row, timeout, waitTime);                        
                await chrome.kill();
            } catch (err) {
                console.error(err)
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await db.close();        
        process.exit();                
    }
}

process.on("uncatchException", function(err) {
    console.error(err);
});

main();