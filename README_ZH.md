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
node app.js -S ./urls.txt -D ./profiles -I 127.0.0.1 -P 9222 -T 3000 -W 3000 -M 3 -B 0
```

### 参数说明

```shell
    -S --src <path>       URL 输入文件 (默认: urls.txt)
    -D --dst <path>       数据输出文件夹 (默认: ./profiles)
    -I --ip <host>        Chrome 运行地址 (默认: 127.0.0.1)
    -P --port <port>      Chrome 运行端口 (默认: 9222)
    -T --timeout <time>   网页分析时间 (默认: 3000ms)
    -W --waittime <time>  网页加载时间 (默认: 3000ms)
    -M --max <conn>       最大同时打开标签页数 (默认: 3)
    -B --begin <index>    从第几个 URL 开始检查 (默认: 0)
```

## 其它语言版本

[English](./README.md)