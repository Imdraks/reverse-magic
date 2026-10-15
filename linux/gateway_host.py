"""Private pipe client for the shared desktop bridge manager."""
import asyncio
import json

class GatewayHost:
    def __init__(self, node, script, directory):
        self.node,self.script,self.directory=node,script,directory
        self.process=None;self.reader=None;self.pending={};self.sequence=0
        self.state={'available':False,'active':False}
        self.start_lock=asyncio.Lock()

    async def start(self):
        async with self.start_lock:
            if self.process and self.process.returncode is None:return
            self.process=await asyncio.create_subprocess_exec(str(self.node),str(self.script),str(self.directory),stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL,limit=3*1024*1024)
            self.reader=asyncio.create_task(self.read())

    async def read(self):
        try:
            while line:=await self.process.stdout.readline():
                message=json.loads(line)
                if message.get('kind')=='state':self.state=message['state']
                elif message.get('kind')=='response':
                    future=self.pending.pop(message['id'],None)
                    if future and not future.done():
                        if message['ok']:future.set_result(message['result'])
                        else:future.set_exception(ValueError(message.get('error','Opération impossible.')))
        except (ValueError,ConnectionError):pass
        finally:
            self.state={'available':False,'active':False,'error':'Le gestionnaire du pont est arrêté.'}
            for future in self.pending.values():
                if not future.done():future.set_exception(ValueError('Le gestionnaire du pont est arrêté.'))
            self.pending.clear()

    async def command(self,action,data):
        await self.start();self.sequence+=1;request=self.sequence
        future=asyncio.get_running_loop().create_future();self.pending[request]=future
        try:
            self.process.stdin.write((json.dumps(dict(id=request,action=action,data=data))+'\n').encode())
            await self.process.stdin.drain()
            result=await asyncio.wait_for(future,180)
            if isinstance(result,dict) and 'config' in result:self.state=result
            return result
        finally:self.pending.pop(request,None)

    async def close(self):
        if self.process:
            if self.process.returncode is None:
                self.process.stdin.close()
                try:await asyncio.wait_for(self.process.wait(),5)
                except asyncio.TimeoutError:self.process.kill();await self.process.wait()
            if self.reader:await self.reader
