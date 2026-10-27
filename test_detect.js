const http = require('http');

const data = JSON.stringify({
  content: "Test check"
});

const req = http.request('http://localhost:3300/api/posts/test-photo-composer', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Result:', body));
});

req.write(data);
req.end();