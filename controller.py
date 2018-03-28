import sys
import subprocess

PKILL_CHROME = ['pkill', 'chrome']
PKILL_NODE = ['pkill', 'node']

def generate_port_num(num):
    if num > 100:
        num = 100
    return [(100 + i) * 100 + 86 for i in range(num)]

def generate_cmd(port_array):
    return [['node', 'app.js', '-P', str(i)] for i in port_array]

def main():
    num = int(sys.argv[1])
    port_nums = generate_port_num(num)
    cmds = generate_cmd(port_nums)
    while True:
        pids = []
        for cmd in cmds:
            pids.append(subprocess.Popen(cmd))
        for pid in pids:
            pid.wait()
        subprocess.call(PKILL_NODE)
        subprocess.call(PKILL_CHROME)
    return

if __name__ == '__main__':
    main()