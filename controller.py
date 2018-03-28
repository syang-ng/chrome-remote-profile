import sys
import subprocess
from threading import Timer

PKILL_CHROME = ['pkill', 'chrome']
PKILL_NODE = ['pkill', 'node']

def generate_port_num(num):
    if num > 100:
        num = 100
    return [(100 + i) * 100 + 86 for i in range(num)]

def generate_cmd(port_array, script, tabs):
    return [['node', script, '-P', str(i), '-N', str(tabs)] for i in port_array]

def kill_all():
    subprocess.call(PKILL_NODE)
    subprocess.call(PKILL_CHROME)

def init():
    script = 'app.js'
    num = 3
    tabs = 250
    if len(sys.argv) > 1:
        script = sys.argv[1]
    if len(sys.argv) > 2:
        num = int(sys.argv[2])
    if len(sys.argv) > 3:
        num = int(sys.argv[3])
    return [script, num, tabs]

def main():
    [script, num, tabs] = init()
    port_nums = generate_port_num(num)
    cmds = generate_cmd(port_nums, script, tabs)
    while True:
        print('loop begin')
        pids = []
        timer = Timer(600, kill_all)    
        for cmd in cmds:
            print('run cmd: %s' % (' '.join(cmd)))
            pids.append(subprocess.Popen(cmd))
        timer.start()
        for pid in pids:
            pid.wait()
        timer.cancel()
        print('loop end')        
    return

if __name__ == '__main__':
    main()