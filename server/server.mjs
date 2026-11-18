// SEYİR — isteğe bağlı eş zamanlılık sunucusu.
// Gelen her mesajı diğer bağlı istemcilere aktarır (durum tutmaz).
// Çalıştır: npm run server   →   uygulamayı ?ws=ws://<ip>:8787 ile aç.
import { WebSocketServer } from 'ws';
import os from 'node:os';

const port = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({ port, maxPayload: 4096 });

wss.on('connection', (socket) => {
  socket.on('message', (data, isBinary) => {
    if (isBinary) return;
    const text = data.toString();
    try {
      const msg = JSON.parse(text);
      if (!msg || typeof msg.type !== 'string' || typeof msg.id !== 'string') return;
    } catch {
      return;
    }
    for (const client of wss.clients) {
      if (client !== socket && client.readyState === 1) client.send(text);
    }
  });
  socket.on('error', () => socket.terminate());
});

const ips = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);
console.log(`SEYİR eş zamanlılık sunucusu: ws://localhost:${port}`);
for (const ip of ips) console.log(`  Ağdaki cihazlar için: uygulamayı  ?ws=ws://${ip}:${port}  parametresiyle aç`);
