# import ahocorasick
# A = ahocorasick.Automaton()
import pymysql
from DBUtils.PooledDB import PooledDB
import sys
from threading import Thread

keywords = ['wasm', 'coinhive', ]

query_sql = 'select id, url, requestUrl from requestHistory where id between {begin} and {end}'

output_file = './url.txt'

url_set = set()
pool = PooledDB(pymysql, 30, host='10.141.209.139',
                user='root', passwd='Lancer_2017', db='tracer', port=3306)
def init():
    begin = 100000
    end = 200000
    limit = 10000
    thread_num = 20

    if len(sys.argv) > 1:
        begin = int(sys.argv[1])
    if len(sys.argv) > 2:
        end = int(sys.argv[2])
    if len(sys.argv) > 3:
        thread_num = int(sys.argv[3])
    if len(sys.argv) > 4:
        limit = int(sys.argv[4])

    return [begin, end, thread_num, limit]


def fetchUrls(b, e):
    try:
        conn = pool.connection()
        cur = conn.cursor()
        sql = query_sql.format(begin=str(b), end=str(e))
        cur.execute(sql)
        r = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    return r


def compare(url):
    for keyword in keywords:
        if keyword in url:
            return True
    return False


def log(dst, url):
    with open(dst, 'a') as f:
        f.write(f'{url}\n')


def one_thread(b, e, limit):
    n = (e - b) / limit
    m = (e - b) % limit
    bes = [(b+i*limit, b+(i+1)*limit) for i in range(n)]
    if m:
        bes.append((b+n*limit, e))
    for item in bes:
        rows = fetchUrls(item[0], item[1]-1)
        for row in rows:
            if compare(row[2]):
                if row[1] not in url_set:
                    url_set.add(row[1])
                    log(output_file, row[1])
    return


def main():
    [begin, end, thread_num, limit] = init()
    try:
        num = (end - begin) / thread_num
        be = [(begin+i*num, begin+(i+1)*num) for i in range(thread_num)]
        be[-1] = (be[-1][0], end)
        threads = []
        for i in range(thread_num):
            threads.append(Thread(target=one_thread, args=[be[i][0], be[i][1], limit]))
        for thread in threads:
            thread.start()
    except Exception as err:
        print(err)
    return

main()
