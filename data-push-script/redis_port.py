import redis
import sys
import mysql.connector
cnx = None
mysql_cursor = None
pool = None
redisHandler = None

global_sql = "select * from tracer.timeSpaceVisit where round={round} and threads is null"

round = 1

def read_args():
	return    

def __init__():
    global cnx
    global mysql_cursor
    if not cnx:
        cnx = mysql.connector.connect(user='lancer', password='lancer', host='10.141.209.139', database='tracer')
    if not mysql_cursor:
        mysql_cursor = cnx.cursor()
    global pool
    global redisHandler
    if not pool:
        pool = redis.ConnectionPool(host='10.141.209.139', port=6379)
    if not redisHandler:
        redisHandler = redis.StrictRedis(connection_pool=pool)

def tracking_url():
    need_to_add_redis_sql = global_sql.format(round=round)
    mysql_cursor.execute(need_to_add_redis_sql)
    res = mysql_cursor.fetchall()
    print(len(res))
    return res

def main():
    # redis_key = 'to_profile'
    # redis_key = 'rerun'
    redis_key = 'timespace'
    __init__()
    
    rows = []
    tracking_url_list = tracking_url()
    rows += tracking_url_list
    
    print('fetch len = {}'.format(len(rows)))
    cnt = 0
    for row in rows:
        idx, profilerId, url, *_ = row
        redis_string = '{},{}'.format(idx, url)
        redisHandler.lpush(redis_key, redis_string)
        if cnt % 1000 == 0:
            print(cnt)
        cnt += 1
        
    print(redisHandler.llen(redis_key))

if __name__ == '__main__':
    main()