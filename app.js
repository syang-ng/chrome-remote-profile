const fs = require('fs');
const util = require('util');
const async = require('async');
const program = require('commander');
const CDP = require('chrome-remote-interface');

const config = {
    src: 'urls.txt',
    dst: './urls.txt.profiles',
    host: '127.0.0.1',
    port: 9222
}
const mMapFile = 'maps.txt';
let mUrls = [];

let count = 0;
let mMapFilePath = '';

program
    .version('1.0.0')
    .option('-S --src <path>', 'your scr input urls file', config.src)
    .option('-D --dst <path>', 'your output dst dir', config.dst)
    .option('-I --ip <host>', 'your chrome host ip', config.host)
    .option('-P --port <port>', 'your chrome debug port', config.port)
    .option('-T --timeout <time>', 'the time to profile', 3000)
    .option('-W --waittime <time>', 'the delay time to wait for website loading', 3000)
    .option('-M --max <conn>', 'the maximum tab at the same time', 3)
    .option('-B --begin <index>', 'the index of url to begin', 0);

function readUrlFile (mUrlFile) {
    let content = fs.readFileSync(mUrlFile, 'utf8');
    // 将文件按行拆成数组并存储
    content.split(/\r?\n/).forEach(function (url) {
        if (url !== '') {
            mUrls.push(url);
        }
    });
};

function writeJson (url, data) {
    const path = util.format('%s/%d.json', config.dst, count);//config.dst + '/' + formatFileName(url);
    fs.writeFile(path, JSON.stringify(data), function (err) {
        if (err) console.error(err);
    });
    fs.appendFile(mMapFilePath, util.format('%d: %s\r\n', count, url), function (err) {
        if (err) console.error(err);
    });
    if (log(count++)) {
        console.log('current url: %s', url);
    };
};

function log(i) {
    if (i%1000 === 0 && i%10000 !== 0) {
        console.log('current url index: %d', i);
    }
    return i%10000 === 0;
}

function delay(timeout) {
    return new Promise(function (resolve, reject) {
        setTimeout(function () {
            resolve();
        }, timeout);
    })
};

async function newTab(url, timeout=3000, delayTime=2000) {
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
            const {Page, Profiler} = client;        
            await Promise.all([
                Profiler.enable()
            ]);
            await delay(delayTime);
            await Profiler.start();
            await delay(timeout);
            const data = await Profiler.stop();
//            const {nodes} = profile;
            writeJson(url, data);
        }
        // close tab
        CDP.Close({
            host: config.host,
            port: config.port,
            id: target.id
        });
    } catch (err) {
        console.error(err);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

function main() {
    /* 命令行参数解析 */
    program.parse(process.argv);
    config.src = program.src || config.src;
    config.dst = program.dst || util.format("%s.profiles", config.src);
    config.host = program.ip || config.host;
    config.port = program.port || config.port; 
    count = program.begin;

    /* 输入 url 文件读取 */
    if(fs.existsSync(config.src)) {
        readUrlFile(config.src);
        if (count) {
            mUrls = mUrls.splice(count);
        }
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