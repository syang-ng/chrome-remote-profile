const fs = require('fs');
const util = require('util');
const program = require('commander');
const launcher = require('chrome-launcher');
const CDP = require('chrome-remote-interface');
const md5 = require('md5');
const exec = require('child_process').exec;


// replace the Promise for high performance
global.Promise = require("bluebird");

const DB = require('./db');
const { env } = require('./env');
const { config,redisConfig  } = require('./config');
const { delay, formatDateTime} = require('./utils');

//const writeFile = Promise.promisify(fs.writeFile);

let db;

function writeJson(id, seq, data) {
    const path = util.format('%s/%d_%d.json', config.dst, id, seq);
    fs.writeFile(path, JSON.stringify(data), (err)=>{
	if (err) {
            console.log(err);
	} else {
            fs.chmod(path, '666',(err)=>{
		if (err) console.log(err);
	    });
	}
    });
    return ;
}

function writeJS(data, fileMd5, url) {
    // No JS
    // return;
    // TODO accessdb
    if (!( url.endsWith('.jpg') || url.endsWith('.png') || url.endsWith('.gif') || url.endsWith('.css')|| url.endsWith('.html') || url.endsWith('.htm') || url.endsWith('.svg') ||url.startsWith('data:image') || url.includes('.css?') || url.includes('.png?')|| url.includes('.gif?')|| url.includes('.jpg?'))){

    const path = util.format('%s/file_%s', config.dst, fileMd5);
    fs.writeFile(path, data,(err)=>{
	if (err) {
            console.log(err);
	} else {
            fs.chmod(path, '666',(err)=>{
		if (err)console.log(err);
	    });
	}
    });
    return;
	}
}

const rcvNetworkRequestWillBeSent = function(params, others) {
    others.requestUrls.push({
        'url': others.url,
        'time': others.deltaTime,
        'requestUrl': params.request.url,
        'category': 'request',
        'fileHash': 'NULL'
    });
}

const rcvDebuggerGetScriptSource = function(data, others) {
    /*
    // return if data is null or undefined
    if (data === undefined || data === null) {
        return;
    }
    const fileMd5 = md5(data);
    others.requestUrls.push({
        'url': others.url,
        'time': others.deltaTime,
        'requestUrl': others.requestUrl,
        'category': 'response',
        'fileHash': fileMd5
    });
    writeJS(data, fileMd5);
    */
}

const rcvNetworkGetResponseBody = function(data, others) {
    // return if data is null or undefined
    if (data === undefined || data === null) {
        return;
    }
    const fileMd5 = md5(data);
    others.requestUrls.push({
        'url': others.url,
        'time':others.deltaTime,
        'requestUrl': others.requestUrl,
        'category':'response',
        'fileHash': fileMd5
    });
    writeJS(data, fileMd5, others.requestUrl);
}

const rcvProfileStop = function(id, seq, data) {
    writeJson(id, seq, data);
}

const callbackMap = new Map([
    ['Network.requestWillBeSent', rcvNetworkRequestWillBeSent]
]);

program
    .version('1.0.0')
    .option('-D --dst <path>', 'your output dst dir', '/home/lancer/share')
    .option('-P --port <port>', 'your chrome debug port', config.port)
    .option('-T --timeout <time>', 'the time to profile', 8)
    .option('-W --waitTime <time>', 'the delay time to wait for website loading', 20)
    .option('-I --interval <time>', 'the interval of each tab', 2)
    .option('-N --num <number>', 'the number of tab to profile before chrome restart', 1000)
//.option('-N --num <number>', 'the number of tab profiler per hour', 3600)
    .option('-E --env <env>', 'the environment', 'production');

/* profiler the special url with new tab */
async function newTab(item, timeout, waitTime) {
    const url = item.url;
    const id = item.id;
    await db.startProfile(id);
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
            let total = 1;            
            const callbackArray = new Array();
            const sessions = new Set();
            const requestUrls = [];
            const initTime = new Date();
            const requestArray = new Array();
            
            const {Debugger, Network, Target, Profiler} = client;
            
            await Promise.all([
                Debugger.enable(),
                Network.enable({maxTotalBufferSize: 10000000, maxResourceBufferSize: 5000000}),
                Profiler.enable()
            ]);

            await Target.setAutoAttach({autoAttach: true, waitForDebuggerOnStart: false});        
            
            Network.requestWillBeSent((params) => {
                let deltaTime = new Date() - initTime;                
                let others = {requestUrls: requestUrls, url: url, deltaTime: deltaTime}
                rcvNetworkRequestWillBeSent(params, others);
            });
            
            Network.responseReceived(async (params) => {
                let deltaTime = new Date() - initTime;
                let others = {requestUrls: requestUrls, url: url, deltaTime: deltaTime, requestUrl: params.response.url};
                const {body} = await Network.getResponseBody({requestId: params.requestId});
                rcvNetworkGetResponseBody(body, others);
            });
            
            Debugger.scriptParsed(async (params) => {
                // TODO handle errors
                let deltaTime = new Date() - initTime;
                let others = {requestUrls: requestUrls, url: url, deltaTime: deltaTime, requestUrl: params.url};
                const {scriptSource} = await Debugger.getScriptSource({scriptId: params.scriptId});
                rcvDebuggerGetScriptSource(scriptSource, others);
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
            Target.receivedMessageFromTarget((obj)=>{
                const message = JSON.parse(obj.message);
                const deltaTime = new Date() - initTime;
                let callback, others;
                if (message.method === 'Debugger.scriptParsed') {
                    callbackArray[seq] = rcvDebuggerGetScriptSource;
                    requestArray[seq] = {requestUrls: requestUrls, url: url, deltaTime: deltaTime, requestUrl: message.params.url};
                    Target.sendMessageToTarget({
                        message: JSON.stringify({id: seq++, method:"Debugger.getScriptSource", params:{scriptId: message.params.scriptId}}),
                        sessionId: obj.sessionId
                    });
                } else if (message.method === 'Network.responseReceived') {
                    callbackArray[seq] = rcvNetworkGetResponseBody;
                    requestArray[seq] = {requestUrls: requestUrls, url: url, deltaTime: deltaTime, requestUrl: message.params.response.url};
                    Target.sendMessageToTarget({
                        message: JSON.stringify({id: seq++, method:'Network.getResponseBody', params:{requestId: message.params.requestId}}),
                        sessionId: obj.sessionId
                    });
                }else if (message.method !== undefined) {
                    callback = callbackMap.get(message.method);
                    if(callback!==undefined) {
                        others = {requestUrls: requestUrls, url: url, deltaTime: deltaTime};
                        callback(message.params, others);
                    }
                } else if(message.id !== undefined) {
                    callback = callbackArray[message.id];
                    if(callback===rcvProfileStop){
                        callback(id, total++, message.result.profile);                      
                    }else if(callback===rcvDebuggerGetScriptSource){
                        others = requestArray[message.id];                        
                        callback(message.result.scriptSource, others);
                        delete requestArray[message.id];
                    }else if(callback===rcvNetworkGetResponseBody){
                        others = requestArray[message.id];
                        if(message.result!==undefined) {                 
                            callback(message.result.body, others);
                        }
                        delete requestArray[message.id];                        
                    }
                    delete callbackArray[message.id];
                }
            });
            await delay(waitTime);
            if(sessions.size >= 15) {
                await db.finishProfile(id, sessions.size + 1, requestUrls);                
                return;
            }
            await Promise.all([
                (async()=>{
                    /* profile the main thread */
                    await Profiler.setSamplingInterval({interval: 100});
                    await Profiler.start();
                    await delay(timeout);
                    const {profile} = await Profiler.stop();
                    writeJson(id, 0, profile);
                })(),
                (async()=>{
                    /* profile the other thread */
                    await Promise.map(sessions, async (sessionId)=>{
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
                        callbackArray[seq] = rcvProfileStop;
                        Target.sendMessageToTarget({
                            message: JSON.stringify({id: seq++, method:"Profiler.stop"}),
                            sessionId: sessionId
                        });
                    }, {concurrency: 5});
                })()
            ]);
            num+=sessions.size;
            await new Promise(async (resolve, reject)=>{
                let count = 0;
                while (total <= num && count < 10) {
                    delay(0.5);
                    count++;
                }
                resolve();                
            });
            CDP.Close({
                host: config.host,
                port: config.port,
                id: target.id
            });
            db.finishProfile(id, total, requestUrls);
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
        config.dst = '/home/lancer/share';
        //redisConfig.host = '127.0.0.1';
        program.num = 1;
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
	try {
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
            if (program.env != 'production') {
                break;
            }
}catch (err){
        console.error(err);
} finally {
    let yourscript = exec('pkill chrome',
       (error, stdout, stderr) => {
           console.log(`${stdout}`);
           console.log(`${stderr}`);
           if (error !== null) {
               console.log(`exec error: ${error}`);
           }
       });
}

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

