// Servidor WebSocket mínimo para el plugin Sala. Sin dependencias.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
/** Una trama de texto del servidor al cliente. */
const frame = (text) => {
  const body = Buffer.from(text);
  const head = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 255]);
  return Buffer.concat([head, body]);
};

/** Saca las tramas completas de `data`. Devuelve los textos y lo que sobra. */
function read(data) {
  const texts = [];
  let at = 0;
  for (;;) {
    if (data.length < at + 2) break;
    const len = data[at + 1] & 127;
    const ext = len === 126 ? 2 : 0;
    const size = len === 126 ? data.readUInt16BE(at + 2) : len;
    const start = at + 2 + ext + 4;
    if (data.length < start + size) break;
    const mask = data.subarray(at + 2 + ext, start);
    const body = Buffer.from(data.subarray(start, start + size)).map((b, i) => b ^ mask[i % 4]);
    if ((data[at] & 15) === 1) texts.push(body.toString());
    at = start + size;
  }
  return { texts, rest: data.subarray(at) };
}

/** Reparte lo que llega a todos los conectados. `onMessage` es para las pruebas. */
export function startSala(port = 8787, onMessage = () => {}) {
  const clients = new Set();
  const server = createServer((_, res) => res.writeHead(426).end());
  server.on('upgrade', (req, socket) => {
    const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    clients.add(socket);
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      const { texts, rest } = read(Buffer.concat([pending, chunk]));
      pending = rest;
      for (const text of texts) {
        onMessage(text);
        for (const c of clients) c.write(frame(text));
      }
    });
    const gone = () => clients.delete(socket);
    socket.on('close', gone);
    socket.on('error', gone);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, close: () => { for (const c of clients) c.destroy(); server.close(); } })));
}
