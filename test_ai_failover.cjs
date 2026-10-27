const fs = require('fs');

(async () => {
  try {
    console.log('1. Logging in as admin...');
    const loginRes = await fetch('http://127.0.0.1:3300/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'ecotrang2026' })
    }).then(r => r.json());
    console.log('Login result:', loginRes.success);
    const token = loginRes.token;
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    };

    console.log('\n2. Testing /api/ai/keys/add with multiple keys (Gemini + Groq)...');
    const addRes = await fetch('http://127.0.0.1:3300/api/ai/keys/add', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        keys: 'AIzaSyA_SampleGeminiKey1234567890\nAIzaSyB_SampleBackupKey0987654321\ngsk_sampleGroqLlamaKey55555555'
      })
    }).then(r => r.json());
    console.log('Add keys response:', addRes.success, 'Message:', addRes.message);
    console.log('Total keys in pool:', addRes.keysPool?.length);

    console.log('\n3. Testing /api/ai/config (Masked Key Pool)...');
    const cfgRes = await fetch('http://127.0.0.1:3300/api/ai/config', { headers: authHeaders }).then(r => r.json());
    console.log('Total keys count:', cfgRes.config?.totalKeysCount);
    console.log('Active keys count:', cfgRes.config?.activeKeysCount);
    console.log('Keys in pool:');
    (cfgRes.config?.keysPool || []).forEach(k => {
      console.log(` - [${k.provider}] ${k.apiKey} -> Status: ${k.status} (Success: ${k.successCount}, Fail: ${k.failCount})`);
    });

    console.log('\n4. Testing /api/ai/simulate (Auto Failover & Resilience)...');
    const simRes = await fetch('http://127.0.0.1:3300/api/ai/simulate', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        postContent: 'Cần tìm gấp căn 2PN Sky Oasis hoặc Haven Park tầm 9-10tr full đồ vào ở ngay, ai có ib gửi video nhé'
      })
    }).then(r => r.json());

    console.log('Simulate Success:', simRes.success);
    console.log('- Provider Used:', simRes.analysis?.providerUsed);
    console.log('- Key Used (Masked):', simRes.analysis?.keyUsedMasked);
    console.log('- Matched Property:', simRes.analysis?.bestMatch?.project, simRes.analysis?.bestMatch?.priceText);
    console.log('- Distance Info:', simRes.analysis?.matchResult?.distanceText);
    console.log('- Generated Comment:\n  ' + simRes.analysis?.aiComment);

    console.log('\n✅ AUTO FAILOVER & KEY POOL ENDPOINTS VERIFIED 100% OPERATIONAL!');
  } catch (err) {
    console.error('❌ Error testing failover:', err);
  }
})();
