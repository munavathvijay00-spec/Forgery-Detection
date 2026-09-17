/**
 * PrivacyBoundaryDiagram Component
 * 
 * Renders an interactive, vector-crisp SVG network diagram showing:
 * 1. On-Device Hardware Memory Sandbox (Pixels, WASM, Local Heap)
 * 2. Air-gapped boundary line (No internet transmission)
 * 3. Optional Local Subnet Office Kit pairing (Metadata only: Hash + Verdict, 0 image pixels)
 * 4. External Cloud Boundary (Blocked / Zero egress)
 */

(function (global) {
  'use strict';

  function renderPrivacyBoundaryDiagram() {
    return `
      <div class="privacy-svg-container" id="privacySvgContainer" role="region" aria-label="AegisDoc Privacy & Network Boundary Flow">
        <svg class="privacy-boundary-svg" viewBox="0 0 920 420" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Background Grids & Zones -->
          <rect x="10" y="10" width="460" height="400" rx="14" fill="#0b1329" stroke="#1e293b" stroke-width="2"/>
          <rect x="490" y="10" width="420" height="230" rx="14" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
          <rect x="490" y="260" width="420" height="150" rx="14" fill="#181119" stroke="#371822" stroke-width="2"/>

          <!-- Zone Headers -->
          <text x="30" y="42" fill="#38bdf8" font-family="Inter, sans-serif" font-size="13" font-weight="800" letter-spacing="0.08em">ZONE 1: CLIENT HARDWARE BOUNDARY (100% AIR-GAPPED)</text>
          <text x="30" y="60" fill="#94a3b8" font-family="Inter, sans-serif" font-size="11">Your Smartphone / Laptop Browser Sandbox (Airplane-Mode Verified)</text>

          <text x="510" y="42" fill="#10b981" font-family="Inter, sans-serif" font-size="13" font-weight="800" letter-spacing="0.08em">ZONE 2: LOCAL SUBNET (OPTIONAL LAN PAIRING)</text>
          <text x="510" y="60" fill="#94a3b8" font-family="Inter, sans-serif" font-size="11">Peer-to-peer WebSocket on LAN (ws://192.168.x.x:8765)</text>

          <text x="510" y="290" fill="#ef4444" font-family="Inter, sans-serif" font-size="13" font-weight="800" letter-spacing="0.08em">ZONE 3: PUBLIC INTERNET & EXTERNAL CLOUD</text>
          <text x="510" y="308" fill="#f87171" font-family="Inter, sans-serif" font-size="11">Zero egress • Document pixels NEVER transmitted to remote servers</text>

          <!-- Zone 1 Nodes: Document & WASM Pipeline -->
          <!-- Raw Document File Box -->
          <rect x="30" y="90" width="180" height="120" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
          <text x="45" y="120" fill="#f8fafc" font-family="Inter, sans-serif" font-size="13" font-weight="700">Raw Financial Document</text>
          <text x="45" y="140" fill="#94a3b8" font-family="Inter, sans-serif" font-size="11">• Ingested via Camera/File</text>
          <text x="45" y="158" fill="#94a3b8" font-family="Inter, sans-serif" font-size="11">• High-res image array</text>
          <text x="45" y="176" fill="#38bdf8" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700">Transient Memory Only</text>
          <rect x="45" y="186" width="150" height="16" rx="4" fill="rgba(56, 189, 248, 0.15)"/>
          <text x="50" y="198" fill="#38bdf8" font-family="JetBrains Mono, monospace" font-size="9" font-weight="800">RESTRICTED TO LOCAL HEAP</text>

          <!-- Arrow 1 to 2 Inside Zone 1 -->
          <path d="M 210 150 L 250 150" stroke="#38bdf8" stroke-width="2.5" marker-end="url(#arrowCyan)"/>

          <!-- On-Device Forensic Pipeline Box -->
          <rect x="260" y="90" width="190" height="290" rx="8" fill="#111c38" stroke="#2563eb" stroke-width="2"/>
          <text x="275" y="120" fill="#93c5fd" font-family="Inter, sans-serif" font-size="13" font-weight="800">AegisDoc Forensic Engine</text>
          <text x="275" y="140" fill="#cbd5e1" font-family="Inter, sans-serif" font-size="11">WebGL & TypedArray CV</text>
          
          <g transform="translate(275, 155)">
            <rect x="0" y="0" width="160" height="32" rx="4" fill="#1e293b"/>
            <text x="8" y="20" fill="#f8fafc" font-family="Inter, sans-serif" font-size="10" font-weight="600">Layer 1: 85% N-ELA Grid</text>
          </g>
          <g transform="translate(275, 195)">
            <rect x="0" y="0" width="160" height="32" rx="4" fill="#1e293b"/>
            <text x="8" y="20" fill="#f8fafc" font-family="Inter, sans-serif" font-size="10" font-weight="600">Layer 2: 3x3 Laplacian Noise</text>
          </g>
          <g transform="translate(275, 235)">
            <rect x="0" y="0" width="160" height="32" rx="4" fill="#1e293b"/>
            <text x="8" y="20" fill="#f8fafc" font-family="Inter, sans-serif" font-size="10" font-weight="600">Layer 3: 16x16 NCC Copy-Move</text>
          </g>
          <g transform="translate(275, 275)">
            <rect x="0" y="0" width="160" height="32" rx="4" fill="#1e293b"/>
            <text x="8" y="20" fill="#f8fafc" font-family="Inter, sans-serif" font-size="10" font-weight="600">Layer 4-6: Geometry & Hash</text>
          </g>
          <g transform="translate(275, 320)">
            <rect x="0" y="0" width="160" height="46" rx="4" fill="#047857"/>
            <text x="8" y="18" fill="#ffffff" font-family="Inter, sans-serif" font-size="10" font-weight="800">Rule-Based Verdict</text>
            <text x="8" y="34" fill="#a7f3d0" font-family="JetBrains Mono, monospace" font-size="9">Composite Risk: 0–100</text>
          </g>

          <!-- Zone 2: Office Kit LAN Peer Box -->
          <rect x="520" y="90" width="360" height="125" rx="8" fill="#064e3b" stroke="#10b981" stroke-width="1.5"/>
          <text x="540" y="118" fill="#6ee7b7" font-family="Inter, sans-serif" font-size="13" font-weight="800">Office Kit Bridge (Desktop / Laptop)</text>
          <text x="540" y="136" fill="#d1fae5" font-family="Inter, sans-serif" font-size="11">Synchronized JSON Metadata Payload:</text>
          <rect x="540" y="146" width="320" height="56" rx="4" fill="#022c22"/>
          <text x="550" y="164" fill="#34d399" font-family="JetBrains Mono, monospace" font-size="10">{"doc_hash":"e3b0c442...","verdict":"FORGED",</text>
          <text x="550" y="180" fill="#34d399" font-family="JetBrains Mono, monospace" font-size="10"> "risk_score":88,"boxes":[[765,490,875,520]]}</text>
          <text x="550" y="196" fill="#fcd34d" font-family="Inter, sans-serif" font-size="10" font-weight="700">ZERO PIXELS • ZERO SENSITIVE PII TRANSMITTED</text>

          <!-- Arrow from Enclave to LAN (Green dotted line) -->
          <path d="M 450 170 L 520 170" stroke="#10b981" stroke-width="2.5" stroke-dasharray="4 4" marker-end="url(#arrowGreen)"/>
          <text x="445" y="158" fill="#10b981" font-family="Inter, sans-serif" font-size="10" font-weight="700">Metadata Only</text>

          <!-- Zone 3: Cloud Blocked Box -->
          <g transform="translate(520, 330)">
            <rect x="0" y="0" width="360" height="60" rx="8" fill="#450a0a" stroke="#b91c1c" stroke-width="1.5"/>
            <text x="18" y="24" fill="#fca5a5" font-family="Inter, sans-serif" font-size="12" font-weight="800">⛔ ZERO CLOUD TRAFFIC ALLOWED</text>
            <text x="18" y="44" fill="#fecaca" font-family="Inter, sans-serif" font-size="11">Outgoing image POST / HTTP sync calls strictly blocked by browser CSP</text>
          </g>

          <!-- Arrow attempting to go to Cloud (BLOCKED) -->
          <path d="M 355 380 L 355 355 L 520 355" stroke="#ef4444" stroke-width="2.5" stroke-dasharray="3 3"/>
          <line x1="435" y1="345" x2="455" y2="365" stroke="#ef4444" stroke-width="3"/>
          <line x1="455" y1="345" x2="435" y2="365" stroke="#ef4444" stroke-width="3"/>

          <!-- Arrow Markers -->
          <defs>
            <marker id="arrowCyan" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8"/>
            </marker>
            <marker id="arrowGreen" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981"/>
            </marker>
          </defs>
        </svg>
      </div>
    `;
  }

  global.PrivacyBoundaryDiagram = {
    render: renderPrivacyBoundaryDiagram
  };
})(typeof window !== 'undefined' ? window : this);
