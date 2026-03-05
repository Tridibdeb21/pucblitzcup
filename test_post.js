const http = require('http');
const data = JSON.stringify({
  roomId: 'TEST',
  date: '2026-03-05T00:00:00Z',
  duration: 1,
  player1: { handle: 'foo', score: 1 },
  player2: { handle: 'bar', score: 0 },
  winner: 'foo'
});
const opts = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/results',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};
const req = http.request(opts, res => {
  console.log('status', res.statusCode);
  res.on('data', d => process.stdout.write(d));
});

req.on('error', e => console.error(e));
req.write(data);
req.end();
