import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(appRoot,process.env.SERVE_DIR||'dist');
const port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
const prefix=('/'+(process.env.BASE_PATH||'').replace(/^\/+|\/+$/g,'')+'/').replace('//','/');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 try{
  let pathname=decodeURIComponent(new URL(req.url,'http://local.invalid').pathname);
  if(prefix!=='/'){if(!pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}pathname=pathname.slice(prefix.length-1);}
  let target=path.resolve(root,'.'+pathname);
  if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  let stat;try{stat=await fs.stat(target);}catch{res.writeHead(404,{'content-type':'text/html; charset=utf-8'});res.end(await fs.readFile(path.join(root,'404.html')));return;}
  if(stat.isDirectory())target=path.join(target,'index.html');
  const data=await fs.readFile(target);res.writeHead(200,{'content-type':types[path.extname(target)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});if(req.method==='HEAD')res.end();else res.end(data);
 }catch{res.writeHead(500);res.end('Static file error');}
});
server.listen(port,host,()=>console.log(`Static preview: http://${host}:${port}${prefix}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
