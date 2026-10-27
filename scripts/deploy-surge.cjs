const { spawn } = require('child_process');
const path = require('path');

const distPath = path.resolve('cloud_dist');
// Tạo email ngẫu nhiên dùng riêng cho dự án
const email = `falconx.deploy.${Date.now()}@gmail.com`;
const pass = 'FalconX2026Pro@Secure';
const domain = `falconx-ecopark-${Math.floor(1000 + Math.random() * 9000)}.surge.sh`;

console.log(`🚀 Bắt đầu deploy Surge Cloud: ${domain}...`);

const proc = spawn('npx', ['surge', distPath, '--domain', domain], {
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true
});

let output = '';

proc.stdout.on('data', data => {
  const str = data.toString();
  output += str;
  process.stdout.write(str);

  if (str.includes('email:')) {
    proc.stdin.write(email + '\n');
  } else if (str.includes('password:')) {
    proc.stdin.write(pass + '\n');
  }
});

proc.stderr.on('data', data => {
  process.stderr.write(data.toString());
});

proc.on('close', code => {
  console.log(`\nSurge process exited with code ${code}`);
  if (code === 0) {
    console.log(`🎉 DEPLOY THÀNH CÔNG: https://${domain}`);
  }
});
