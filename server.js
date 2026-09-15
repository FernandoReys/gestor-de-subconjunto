const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };
const port = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  let requested;
  try { requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
  if (requested === '/') requested = '/index.html';
  const file = path.normalize(path.join(root, requested));
  if (!file.startsWith(root + path.sep) || requested.split('/').some(x => x.startsWith('.')) || !types[path.extname(file)]) { res.writeHead(404); return res.end('Não encontrado'); }
  fs.stat(file, (error, stat) => {
    if (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500); return res.end(error.code === 'ENOENT' ? 'Não encontrado' : 'Erro do servidor'); }
    const headers = { 'Content-Type': types[path.extname(file)], 'Accept-Ranges': 'bytes', 'Content-Length': stat.size, 'Cache-Control': 'no-cache' };
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start=Number(range[1]), end=range[2]?Math.min(Number(range[2]),stat.size-1):stat.size-1;
      if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end();}
      res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':end-start+1});
      if(req.method==='HEAD')return res.end();
      fs.createReadStream(file,{start,end}).pipe(res);return;
    }
    res.writeHead(200, headers);
    if(req.method==='HEAD')return res.end();
    fs.createReadStream(file).pipe(res);
  });
});
if(require.main===module)server.listen(port, '0.0.0.0', () => console.log(`Gestor de Subconjunto disponível na porta ${port}`));
module.exports=server;
