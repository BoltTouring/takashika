import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const allowed = new Set(['index.html', 'app.js', 'styles.css', 'manifest.json', 'sw.js']);
const server = createServer(async (req, res) => {
    try {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
        if (!['GET', 'HEAD'].includes(req.method)) {
            res.writeHead(405, { Allow: 'GET, HEAD' }).end();
            return;
        }
        if ((!allowed.has(path) && !/^(js|icons)\/[a-zA-Z0-9_-]+\.(js|svg|png)$/.test(path))) {
            res.writeHead(404).end('Not found');
            return;
        }
        const content = await readFile(resolve(root, path));
        res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
        res.writeHead(404).end('Not found');
    }
});
server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'Port is in use. Try PORT=4174 npm start.' : error.message);
    process.exitCode = 1;
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('Takashika: http://localhost:' + server.address().port));
