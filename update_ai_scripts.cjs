const fs = require('fs');
const vm = require('vm');

let html = fs.readFileSync('D:/KudoX_Mess_Tele/public/index.html', 'utf8');
const aiCode = fs.readFileSync('D:/KudoX_Mess_Tele/ai_handlers.js', 'utf8');

// 1. Update switchTab
if (!html.includes('loadAiConfig()')) {
  html = html.replace(
    "if (tabId === 'autocmt') {\n        loadInventoryProperties();\n      }",
    "if (tabId === 'autocmt') {\n        loadInventoryProperties();\n        loadAiConfig();\n      }"
  );
}

// 2. Update scanAndAddPropertiesFromText finally button text
html = html.replace(
  "btn.innerHTML = '<span>⚡</span> <span>Bóc Tách & Nạp Căn</span>';",
  "btn.innerHTML = '<span>✨</span> <span>AI Bóc Tách & Nạp Căn</span>';"
);

// 3. Update scanAndAddPropertiesFromImage finally button text
html = html.replace(
  "btn.innerHTML = '<span>🔍</span> <span>Quét Chữ OCR & Nạp</span>';",
  "btn.innerHTML = '<span>✨</span> <span>AI Vision OCR & Nạp</span>';"
);

// 4. Update DOMContentLoaded
if (!html.includes('loadAiConfig();\n    });')) {
  html = html.replace(
    "initOperatingMode();\n      refreshData();\n      setInterval(refreshData, 5000);",
    "initOperatingMode();\n      refreshData();\n      setInterval(refreshData, 5000);\n      loadAiConfig();"
  );
}

// 5. Insert AI functions before "LOGIC SOẠN & ĐĂNG BÀI TỪ WEB"
const targetAnchor = '// LOGIC SOẠN & ĐĂNG BÀI TỪ WEB (TOPIC 1 PARITY)';
const targetAnchorPos = html.indexOf(targetAnchor);
if (targetAnchorPos === -1) {
  throw new Error('Target anchor "LOGIC SOẠN & ĐĂNG BÀI TỪ WEB (TOPIC 1 PARITY)" not found');
}

// Find previous line break or separator
const separatorPos = html.lastIndexOf('    // ========================================================', targetAnchorPos);
const insertPos = separatorPos !== -1 ? separatorPos : targetAnchorPos;

html = html.slice(0, insertPos) + aiCode + '\n\n    ' + html.slice(insertPos);

// Verify entire inline script syntax with vm.Script
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.indexOf('</script>', scriptStart);
const scriptContent = html.substring(scriptStart + 8, scriptEnd);

try {
  new vm.Script(scriptContent);
  console.log('✅ JavaScript syntax check PASSED! 0 syntax errors.');
  fs.writeFileSync('D:/KudoX_Mess_Tele/public/index.html', html, 'utf8');
  console.log('✅ Successfully updated public/index.html!');
} catch (e) {
  console.error('❌ JavaScript syntax error:', e.message);
  console.error(e.stack);
  process.exit(1);
}
