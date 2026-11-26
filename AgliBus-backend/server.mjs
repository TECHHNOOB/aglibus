import http from 'node:http';
import worker from './dist/worker.mjs';
const port=Number(process.env.PORT||3000);
http.createServer(async(req,res)=>{
  try{
    const url=new URL('http://localhost');
    const incoming=new URL(req.url,'http://localhost');
    url.pathname=incoming.pathname;url.search=incoming.search;
    const response=await worker.fetch(new Request(url,{method:req.method}));
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Request failed');}
}).listen(port,()=>console.log('AgliBus API listening on port '+port));
