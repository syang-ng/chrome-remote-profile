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
node app.js  -D ./profiles -I 127.0.0.1 -P 9222 -T 30 -W 30 -M 3 -B 0 -E 1000 -F yes -C yes
# daemon
node daemon.js -I 127.0.0.1 -P 9222 -F yes -A 90 -C 30
```

### about argv

```shell
# app.js
-D --dst <path>        your output dst dir (default: ./profiles)
-I --ip <host>         your chrome host ip (default: 127.0.0.1)
-P --port <port>       your chrome debug port (default: 9222)
-T --timeout <time>    the time to profile (default: 12.5s)
-W --waittime <time>   the delay time to wait for website loading (default: 12.5s)
-M --max <conn>        the maximum tab at the same time (default: 5)
-B --begin <index>     the index of url to begin (default: 0)
-E --end <index>       the index of url to end
-C --cover <boolean>   whether to cover the data
-F --forever <yes/no>  whether to run forever

# daemon.js
-I --ip <host>         your chrome host ip (default: 127.0.0.1)
-P --port <port>       your chrome debug port (default: 9222)
-F --forever <bool>    forever run
-A --aliveTime <time>  the max time of a tab alive (default: 90s)
-C --checkTime <time>  the delay time to wait for website loading (default: 30s)
```

## Other Language Vesrion

[简体中文](./docs/README_ZH.md)
