const CDP = require('chrome-remote-interface');
const launcher = require('chrome-launcher');

const {config} = require('./config');
const { delay } = require('./utils');

async function newTab(url, timeout, delayTime) {
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

            const {Page, Target} = client;

            const reply = await Target.setAutoAttach({autoAttach: true, waitForDebuggerOnStart: false});

            await Page.enable();            
            

            console.log(reply);
            
            Target.attachedToTarget(function (obj) {
                console.log(obj);
                if (obj.sessionId !== null) {
                    console.log(23333);
                }
            });

            await delay(5000);


        } else {
            console.log(target);
        } 
    } catch (err) {
        console.error(err);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

const urls = ["http://jishutx.cn/post/148.html", "http://10.131.255.32/homepage.html", "http://www.freebuf.com/", "https://github.com"];//, "https://www.drugitenovini.com/"];

(async ()=> {
    await launcher.launch({port: config.port});    
    for(let url of urls) {
        await newTab(url, 10000, 10000);
    }
})();