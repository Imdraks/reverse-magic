"""Private Magic Lantern adapter worker for the cross-platform gateway."""
import argparse
import asyncio
import fcntl
import json
import os
from pathlib import Path
import signal
import sys
from bluetooth import Controller
from lantern import address, state_directory
from protocol import light_frames

async def run(args):
    args.data_dir=None
    directory=state_directory(args)
    with (directory/'controller.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise RuntimeError('Contrôleur déjà utilisé.') from None
        controller=Controller(args.device,args.adapter)
        requests={}
        reader=asyncio.StreamReader(limit=65536)
        transport,_=await asyncio.get_running_loop().connect_read_pipe(lambda:asyncio.StreamReaderProtocol(reader),sys.stdin.buffer)
        async def respond(message):
            identifier=message['id']
            try:
                async with asyncio.timeout(5):
                    if message['op']=='status':result=controller.status()
                    elif message['op']=='apply':await controller.write(light_frames(message['state']));result={}
                    else:raise ValueError('Opération inconnue.')
                response=dict(kind='response',id=identifier,ok=True,result=result)
            except (Exception,asyncio.CancelledError):response=dict(kind='response',id=identifier,ok=False)
            finally:requests.pop(identifier,None)
            print(json.dumps(response),flush=True)
        try:
            while line:=await reader.readline():
                message=json.loads(line);identifier=message['id']
                if message.get('kind')=='cancel':
                    if task:=requests.get(identifier):task.cancel()
                elif message.get('kind')=='request':
                    if len(requests)>=32 or identifier in requests:raise ValueError('Trop de requêtes.')
                    requests[identifier]=asyncio.create_task(respond(message))
        finally:
            transport.close()
            tasks=list(requests.values())
            for task in tasks:task.cancel()
            await asyncio.gather(*tasks,return_exceptions=True)
            await controller.close()

if __name__=='__main__':
    os.umask(0o077)
    parser=argparse.ArgumentParser();parser.add_argument('--device',type=address,required=True);parser.add_argument('--adapter');args=parser.parse_args()
    async def main():
        task=asyncio.current_task();loop=asyncio.get_running_loop()
        for sig in (signal.SIGINT,signal.SIGTERM):loop.add_signal_handler(sig,task.cancel)
        try:await run(args)
        except asyncio.CancelledError:pass
    try:asyncio.run(main())
    except Exception:print('Adaptateur Magic Lantern indisponible.',file=sys.stderr);sys.exit(1)
