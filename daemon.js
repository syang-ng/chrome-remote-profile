const CDP = require('chrome-remote-interface');
const program = require('commander');

const {delay, formatDateTime} = require('./utils');

const maps = new Map();

let aliveTime = 90;
let checkTime = 30;
let forever = false;

const config = {
    host: '127.0.0.1',
    port: 9222
}

program
    .version('1.0.0')
    .option('-I --ip <host>', 'your chrome host ip', config.host)
    .option('-P --port <port>', 'your chrome debug port', config.port)
    .option('-F --forever <bool>', 'forever run')
    .option('-A --aliveTime <time>', 'the max time of a tab alive', aliveTime)
    .option('-C --checkTime <time>', 'the delay time to wait for website loading', checkTime);

const whiteList = ['chrome://newtab/', 'chrome-extension'];

/**
 * 检查元素是否在相应数组中
 * @param {Integer} i - 待检查的元素.
 * @param {Array} array - 待遍历的数组.
 * @return {Boolean} - 检查的结果.
 */
function isInList(i, array) {
    for(let item of array) {
        if (i.startsWith(item)) {
            return true;
        }
    }
    return false;
}

/**
 * 检查 Url 是否在白名单中
 * @param {string} targetUrl - 待检查的 Url.
 * @return {Boolean} - 检查的结果.
 */
function isInWhiteList(targetUrl) {
    return isInList(targetUrl, whiteList);
}

/* initial part */
function init() {
    program.parse(process.argv);
    forever = program.forever?true:false;
    aliveTime = parseFloat(program.aliveTime);
    checkTime = parseFloat(program.checkTime);
    config.host = program.ip;
    config.port = parseInt(program.port);

    console.log("Daemon Server run at %s", formatDateTime(new Date()));
}

/* main part */
async function main() {
    init();
    do {
        await delay(checkTime);
        try {
            const ids = [];
            const targets = await CDP.List({
                host: config.host,
                port: config.port
            });

            for(let target of targets) {
                ids.push(target.id);
                if (target.type !== 'page' || isInWhiteList(target.url)) {
                    continue;
                }
                const count = maps.get(target.id) + 1 || 1;
                if (count * checkTime >= aliveTime) {
                    maps.delete(target.id);
                    await CDP.Close({
                        host: config.host,
                        port: config.port,
                        id: target.id
                    });
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