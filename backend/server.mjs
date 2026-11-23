import http from 'node:http';
import api from './api.mjs';
const port = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  try {
    const result = await api.fetch(new Request(new URL(req.url, 'http://localhost'), {method:req.method}));
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end('Request could not be processed');
  }
}).listen(port, () => console.log('Udaipur bus API listening on port', port));
