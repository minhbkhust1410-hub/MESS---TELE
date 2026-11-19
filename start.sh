#!/usr/bin/env bash
# =========================================================================
# FB EXTEN - Professional Unix/Linux/macOS Launcher
# =========================================================================

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================================================="
echo "🚀 KHỞI ĐỘNG HỆ THỐNG FB EXTEN (UNIX WORKFLOW)"
echo "========================================================================="
echo "🌐 Web Dashboard: http://localhost:3300"
echo "☁️ Cloud DB: 100% Online Encrypted Vault (0 Byte Local)"
echo "🛡️ Permissions: Full Master Privileges Granted"
echo "========================================================================="

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is not installed. Please install Node.js (v20+)."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

echo "▶️ Starting FalconX server..."
npm start
