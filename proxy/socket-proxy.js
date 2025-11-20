/*
 Simple WebSocket relay for local Realtime-Collab prototype.
 Usage:
   1) npm init -y
   2) npm install ws
   3) node proxy/socket-proxy.js
   4) Open the HTML in two browser tabs and click "Realtime-Collab starten"

 This server relays any message from a client to all other connected clients.
*/

const WebSocket = require('ws');
const PORT = process.env.PORT || 6789;
const wss = new WebSocket.Server({ port: PORT });

console.log(`Socket relay running on ws://localhost:${PORT}`);

wss.on('connection', function connection(ws, req) {
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', function incoming(message) {
    // broadcast to everyone except the sender
    wss.clients.forEach(function each(client) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  ws.on('close', ()=>{});
});

// simple ping to detect dead connections
setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);
