// Independent HTTP fixture matching the upstream OpenBeken JSON interface.
const http=require('node:http');
class OpenBekenFixture{
  constructor(){this.on=true;this.brightness=60;this.ct=300;this.flags=4096;this.sdk='obk';this.writes=[];this.reads=[];this.rejectWrites=false;this.password=null;this.silent=false;}
  async start(){
    this.server=http.createServer((req,res)=>{
      if(this.password&&req.headers.authorization!=='Basic '+Buffer.from('admin:'+this.password).toString('base64')){res.writeHead(401);res.end();return;}
      const url=new URL(req.url,'http://localhost');
      if(this.silent)return;
      if(url.pathname==='/api/info'){res.end(JSON.stringify({flags:String(this.flags),chipset:'BK7231T',startcmd:'private startup data'}));return;}
      if(url.pathname!=='/cm'){res.writeHead(404);res.end();return;}
      const command=url.searchParams.get('cmnd');this.reads.push(command);
      if(command==='Status 2'){res.end(JSON.stringify({StatusFWR:{SDK:this.sdk,Version:'OpenBK7231T_1.18.test'}}));return;}
      if(command==='Status 11'){res.end(JSON.stringify({StatusSTS:{POWER:this.on?'ON':'OFF',Dimmer:this.brightness,CT:this.ct,Wifi:{SSId:'private-network'}}}));return;}
      this.writes.push(command);
      if(!this.rejectWrites){
        if(/^Power (ON|OFF)$/.test(command))this.on=command==='Power ON';
        else if(/^Dimmer \d+$/.test(command)){this.brightness=Number(command.split(' ')[1]);if(this.flags&(1<<23))this.on=true;}
        else if(/^CT \d+$/.test(command)){this.ct=Number(command.split(' ')[1]);if(this.flags&(1<<23))this.on=true;}
        else{res.writeHead(400);res.end('{}');return;}
      }
      res.end(JSON.stringify({POWER:this.on?'ON':'OFF',Dimmer:this.brightness,CT:this.ct}));
    });
    await new Promise(resolve=>this.server.listen(0,'127.0.0.1',resolve));this.host='http://127.0.0.1:'+this.server.address().port;return this;
  }
  async close(){this.server.closeAllConnections();await new Promise(resolve=>this.server.close(resolve));}
}
module.exports={OpenBekenFixture};
