const CDP = require('chrome-remote-interface');
const program = require('commander');

const {delay, formatDateTime} = require('./utils');

const maps = new Map();

let aliveTime = 90;
let checkTime = 30;
let forever = false;

const config = {
    host: 'localhost',
    port: 9222
}

program
    .version('1.0.0')
    .option('-I --ip <host>', 'your chrome host ip', config.host)
    .option('-P --port <port>', 'your chrome debug port', config.port)
    .option('-F --forever <bool>', 'forever run')
    .option('-A --aliveTime <time>', 'the max time of a tab alive', parseFloat, aliveTime)
    .option('-C --checkTime <time>', 'the delay time to wait for website loading', parseFloat, checkTime);

const whiteList = ['chrome://newtab/', 'chrome-extension'];

function isInList(i, array) {
    for(let item of array) {
        if (i.startsWith(item)) {
            return true;
        }
    }
    return false;
}

function isInWhiteList(targetUrl) {
    return isInList(targetUrl, whiteList);
}

function init() {
    program.parse(process.argv);
    forever = program.forever?true:false;
    aliveTime = program.aliveTime;
    checkTime = program.checkTime;
    config.host = program.ip;
    config.port = program.port;

    console.log("Daemon Server run at %s", formatDateTime(new Date()));
}

async function main() {
    init();
    do {
        await delay(checkTime*1000);
        try {
            const ids = [];
            const targets = await CDP.List(config);
            for(let target of targets) {
                ids.push(target.id);
                if (target.type !== 'page' || isInWhiteList(target.url)) {
                    continue;
                }
                const count = maps.get(target.id) + 1 || 1;
                if (count * checkTime >= aliveTime) {
                    maps.delete(target.id);
                    await CDP.Close(target);
                } else {
                    maps.set(target.id, count);
                }
            }
            maps.forEach((value, key)=>{
                if (!isInList(key, ids)) {
                    maps.delete(key);
                }
            });
        } catch (err) {
            console.error(err);
        }
    } while (forever);
}

process.on("uncatchException", function(err) {
    console.error(err);
});

main();