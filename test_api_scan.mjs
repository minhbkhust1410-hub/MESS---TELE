async function run() {
  console.log('1. Đăng nhập lấy token admin...');
  const loginRes = await fetch('http://127.0.0.1:3300/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'ecotrang2026' })
  }).then(r => r.json());

  if (!loginRes.success) {
    throw new Error('Login failed: ' + loginRes.error);
  }
  const token = loginRes.token;
  console.log('2. Đã có auth token. Gọi API /api/members/scan...');

  const scanRes = await fetch('http://127.0.0.1:3300/api/members/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      groupUrl: 'https://www.facebook.com/groups/160934979480738/',
      resetBaseline: true
    })
  }).then(r => r.json());

  console.log('3. Kết quả API /api/members/scan:', {
    success: scanRes.success,
    totalMembers: scanRes.members?.length,
    newMembers: scanRes.newMembers?.length,
    sample: scanRes.members?.slice(0, 5)
  });
}

run().catch(console.error);
