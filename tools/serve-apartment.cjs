// Serve only the apartment's public runtime files on the requested interface.
// Usage: node tools/serve-apartment.cjs 192.168.1.162
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),host=process.argv[2]||'127.0.0.1';
const allowed=new Set(['/apps/apartment.html','/apps/apartment-manifest.json','/apps/apartment-sw.js','/apps/apartment/characters.html','/apps/apartment/style.css','/apps/apartment/game.js','/apps/apartment/world.js','/apps/apartment/simulation.js','/apps/apartment/characters.js','/apps/vendor/three.module.min.js','/assets/icons/icon.svg']);
for(const id of ['welcome','escort','hold','warning','incoming','waiting','secure'])allowed.add('/apps/apartment/voices/'+id+'.wav');
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost').pathname;
  if(url==='/'){res.writeHead(302,{Location:'/apps/apartment.html'}).end();return;}
  if(!allowed.has(url)){res.writeHead(404).end('Not found');return;}
  fs.readFile(path.join(root,url),(error,data)=>{
    if(error){res.writeHead(404).end('Not found');return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wav':'audio/wav'})[path.extname(url)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');res.end(data);
  });
}).listen(8000,host,()=>console.log('Apartment preview: http://'+host+':8000/apps/apartment.html'));
