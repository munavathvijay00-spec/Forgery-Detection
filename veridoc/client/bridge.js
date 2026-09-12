/**
 * AegisDoc Office Kit Bridge Client
 * Connects Phone (Scanner Enclave) <-> Laptop (Auditor Terminal) via local WebSocket
 */

class AegisOfficeKitBridge {
  constructor(options = {}) {
    this.options = options;
    this.role = options.role || 'phone'; // 'phone' or 'laptop'
    this.roomId = options.roomId || 'AEGIS-IQOO';
    this.ws = null;
    this.isConnected = false;
    this.isPaired = false;
    this.onTelemetryReceived = options.onTelemetryReceived || null;
    this.onRemoteCommandReceived = options.onRemoteCommandReceived || null;
    this.onStatusChange = options.onStatusChange || null;
  }

  connect(customRoomId = null) {
    if (customRoomId) this.roomId = customRoomId.toUpperCase().trim();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:8765';
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.updateStatus();
        this.ws.send(JSON.stringify({
          action: 'join',
          roomId: this.roomId,
          role: this.role
        }));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (e) {
          console.warn('Malformed WS message:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.isPaired = false;
        this.updateStatus();
        // Retry connection after 3 seconds
        setTimeout(() => {
          if (!this.isConnected) this.connect();
        }, 3000);
      };

      this.ws.onerror = (err) => {
        console.warn('Bridge WS error:', err);
        this.isConnected = false;
        this.updateStatus();
      };
    } catch (err) {
      console.warn('Bridge connection failed:', err);
    }
  }

  handleMessage(msg) {
    if (msg.event === 'joined') {
      this.isPaired = msg.paired;
      this.updateStatus();
    } else if (msg.event === 'peer_connected') {
      this.isPaired = true;
      this.updateStatus();
    } else if (msg.event === 'peer_disconnected') {
      this.isPaired = false;
      this.updateStatus();
    } else if (msg.event === 'telemetry_update') {
      if (this.onTelemetryReceived) {
        this.onTelemetryReceived(msg.data);
      }
    } else if (msg.event === 'remote_command') {
      if (this.onRemoteCommandReceived) {
        this.onRemoteCommandReceived(msg);
      }
    }
  }

  /**
   * Phone sends forensic telemetry to Laptop
   */
  syncTelemetry(report, sampleTitle = 'Scanned Document') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Bridge WS not open (state: ' + (this.ws ? this.ws.readyState : 'none') + '), reconnecting...');
      this.connect();
      return false;
    }

    // Send zero-knowledge summary (NO raw image bytes!)
    const payload = {
      action: 'sync_telemetry',
      data: {
        roomId: this.roomId,
        timestamp: new Date().toLocaleTimeString(),
        sampleTitle,
        compositeScore: report.compositeScore,
        riskLevel: report.riskLevel,
        layerScores: report.layerScores,
        executionTimeMs: report.executionTimeMs,
        suspiciousRegions: (report.suspiciousRegions || []).map(r => ({
          id: r.id,
          signal: r.signal,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          confidence: r.confidence,
          explanation: r.explanation
        }))
      }
    };

    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch (err) {
      console.warn('Failed to send telemetry:', err);
      return false;
    }
  }

  /**
   * Laptop commands phone to spotlight region or rescan
   */
  sendRemoteCommand(command, regionId = null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      action: 'remote_command',
      command,
      regionId
    }));
  }

  updateStatus() {
    if (this.onStatusChange) {
      this.onStatusChange({
        isConnected: this.isConnected,
        isPaired: this.isPaired,
        roomId: this.roomId,
        role: this.role
      });
    }
  }
}

if (typeof window !== 'undefined') {
  window.AegisOfficeKitBridge = AegisOfficeKitBridge;
}
