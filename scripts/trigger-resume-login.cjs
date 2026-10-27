const http = require('http');

async function main() {
  // Login first
  const loginData = JSON.stringify({ username: 'admin', password: 'ecotrang2026' });
  const loginReq = http.request({
    hostname: '127.0.0.1',
    port: 3300,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': loginData.length
    }
  }, res => {
    const cookies = res.headers['set-cookie'];
    console.log('Login status:', res.statusCode);
    
    // Call resume-login
    const resumeReq = http.request({
      hostname: '127.0.0.1',
      port: 3300,
      path: '/api/accounts/resume-login',
      method: 'POST',
      headers: {
        'Cookie': cookies ? cookies.join('; ') : ''
      }
    }, res2 => {
      let data = '';
      res2.on('data', chunk => data += chunk);
      res2.on('end', () => {
        console.log('Resume login response:', data);
      });
    });
    resumeReq.end();
  });
  loginReq.write(loginData);
  loginReq.end();
}

main();
