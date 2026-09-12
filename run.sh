#!/usr/bin/env bash
set -e

# AegisDoc Master Run Script
# Starts Office Kit Bridge Server & Serves PWA Mobile Client

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORT="${PORT:-8765}"
PYTHON_BIN="./.venv/bin/python"

if [ ! -f "$PYTHON_BIN" ]; then
  PYTHON_BIN="python3"
fi

echo "=================================================================="
echo "          AEGISDOC: ON-DEVICE FINANCIAL FORENSICS SERVER          "
echo "=================================================================="
echo "Initializing environment..."

# 1. Ensure synthetic ground-truth corpus exists
if [ ! -f "veridoc/client/samples/manifest.json" ]; then
  echo "Generating synthetic financial document corpus..."
  "$PYTHON_BIN" veridoc/server/generate_samples.py
fi

# 2. Run Benchmark Evaluation Verification
echo "Running forensic benchmark self-test..."
"$PYTHON_BIN" veridoc/evaluation/eval_benchmark.py

# 3. Detect Local LAN IP for Mobile Testing
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

echo ""
echo "=================================================================="
echo "                    SYSTEM READY FOR EVALUATION                   "
echo "=================================================================="
echo "📱 MOBILE (iQOO / Android): http://${LAN_IP}:${PORT}/"
echo "💻 LAPTOP AUDITOR TERMINAL: http://localhost:${PORT}/"
echo "⚡ OFFICE KIT WEBSOCKET   : ws://${LAN_IP}:${PORT}/ws"
echo "🔒 ENCLAVE MODE           : 100% On-Device · Zero Cloud Leakage"
echo "=================================================================="
echo "Starting Office Kit Bridge Server on port ${PORT}..."
echo "Press Ctrl+C to stop."
echo ""

exec "$PYTHON_BIN" veridoc/server/bridge_server.py
