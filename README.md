# chrome-remote-profile

## how to run

### run chrome/chromium

start chrome with the `--remote-debugging-port` option, for example:

```shell
chrome.exe --remote-debugging-port=9222
```

### run app.js

```shell
# install dependence
npm install
# run
node app.js -S ./urls.txt -D ./profiles -I 127.0.0.1 -P 9222 -T 3000 -W 3000 -M 3 -B 0
```

### about argv

```shell
    -S --src <path>       your scr input urls file (default: urls.txt)
    -D --dst <path>       your output dst dir (default: ./profiles)
    -I --ip <host>        your chrome ip (default: 127.0.0.1)
    -P --port <port>      your chrome debug port (default: 9222)
    -T --timeout <time>   the time to profile (default: 3000)
    -W --waittime <time>  the delay time to wait for website loading (default: 3000)
    -M --max <conn>       the maximum tab at the same time (default: 3)
    -B --begin <index>    the index of url to begin (default: 0)
```

## Other Language Vesrion

[简体中文](./README_ZH.md)
