# chrome-remote-profile

## 运行说明

### 运行 Chrome/Chromium

通过 `--remote-debugging-port` 参数启动 Chrome，例如:

```shell
chrome.exe --remote-debugging-port=9222
```

### 运行 app.js

```shell
# 安装依赖
npm install
# 运行
node app.js  -D ./profiles -I 127.0.0.1 -P 9222 -T 30 -W 30 -M 3 -B 0 -E 1000 -F yes -C yes
# 守护进程
node daemon.js -I 127.0.0.1 -P 9222 -F yes -A 90 -C 30
```

### 参数说明

```shell
# app.js
-D --dst         输出文件夹 (default: ./profiles)
-I --ip          Chrome 所对应的相应ip (default: 127.0.0.1)
-P --port        Chrome 所开启的 remote-debugging-port (default: 9222)
-T --timeout     分析时间 (default: 12.5 s)
-W --waittime    等待时间 (default: 12.5 s)
-M --max         最大并发标签 (default: 5)
-B --begin       起始 url 对应 id (default: 0)
-E --end         结束 url 对应 id
-C --cover       是否覆盖原数据
-F --forever     是否持续运行

# daemon.js
-I --ip          Chrome 所对应的相应ip (default: 127.0.0.1)
-P --port        Chrome 所开启的 remote-debugging-port (default: 9222)
-F --forever     是否持续运行 (输入任意参数即可开启持续运行模式)
-A --aliveTime   任何一个 Tab 的最长存在时间 (default: 90s)
-C --checkTime   轮询 Chrome 信息的间隔时间 (default: 30s)
```

## 其它语言版本

[English](../README.md)