/**
 * AegisDoc Main Application Controller
 * Orchestrates:
 * - Camera capture & viewfinder
 * - Client-side forensic pipeline
 * - Interactive bounding box visualization & Inspector
 * - Voice commands & speech synthesis verdict
 * - Office Kit phone-laptop real-time bridge
 */

document.addEventListener('DOMContentLoaded', () => {
  // Core Subsystems
  const forensicEngine = new AegisForensicEngine();
  let latestReport = null;
  let currentSampleId = 'sample_1_authentic';
  let isCameraActive = false;
  let cameraStream = null;
  let originalImageObject = null;
  let viewMode = 'normal'; // 'normal' or 'ela'

  // DOM Elements
  const documentCanvas = document.getElementById('documentCanvas');
  const canvasCtx = documentCanvas.getContext('2d', { willReadFrequently: true });
  const cameraVideo = document.getElementById('cameraVideo');
  const cameraGuidelines = document.getElementById('cameraGuidelines');
  const scannerBeam = document.getElementById('scannerBeam');
  const viewfinderWrapper = document.getElementById('viewfinderWrapper');
  const regionLayer = document.getElementById('regionLayer');

  // Buttons & Controls
  const cameraBtn = document.getElementById('cameraBtn');
  const cameraBtnText = document.getElementById('cameraBtnText');
  const cameraNativeInput = document.getElementById('cameraNativeInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');
  const verdictToast = document.getElementById('verdictToast');
  const runAnalysisBtn = document.getElementById('runAnalysisBtn');
  const sampleButtons = document.querySelectorAll('.sample-btn');
  const viewNormalBtn = document.getElementById('viewNormalBtn');
  const viewElaBtn = document.getElementById('viewElaBtn');
  const processingBadge = document.getElementById('processingBadge');
  const latencyTag = document.getElementById('latencyTag');

  // Dial & Score
  const dialProgress = document.getElementById('dialProgress');
  const riskScoreNumber = document.getElementById('riskScoreNumber');
  const riskVerdictBadge = document.getElementById('riskVerdictBadge');
  const signalsList = document.getElementById('signalsList');

  // Inspector & Voice
  const regionInspector = document.getElementById('regionInspector');
  const inspectorTitle = document.getElementById('inspectorTitle');
  const inspectorConfidence = document.getElementById('inspectorConfidence');
  const inspectorBody = document.getElementById('inspectorBody');
  const inspectorMath = document.getElementById('inspectorMath');
  const listenVerdictBtn = document.getElementById('listenVerdictBtn');
  const voiceMicBtn = document.getElementById('voiceMicBtn');
  const voiceStatusText = document.getElementById('voiceStatusText');

  // Office Kit Bridge UI
  const tabPhone = document.getElementById('tabPhone');
  const tabLaptop = document.getElementById('tabLaptop');
  const openBridgeBtn = document.getElementById('openBridgeBtn');
  const bridgeStatusText = document.getElementById('bridgeStatusText');
  const syncOfficeKitBtn = document.getElementById('syncOfficeKitBtn');
  const bridgeModal = document.getElementById('bridgeModal');
  const closeBridgeModalBtn = document.getElementById('closeBridgeModalBtn');
  const customRoomInput = document.getElementById('customRoomInput');
  const joinRoomBtn = document.getElementById('joinRoomBtn');
  const modalBridgeStatus = document.getElementById('modalBridgeStatus');
  const pairPinDisplay = document.getElementById('pairPinDisplay');
  const auditorWorkstationPanel = document.getElementById('auditorWorkstationPanel');
  const auditorStreamBox = document.getElementById('auditorStreamBox');

  function showToast(text, durationMs = 4500) {
    if (!verdictToast) return;
    verdictToast.textContent = text;
    verdictToast.style.display = 'block';
    setTimeout(() => {
      verdictToast.style.display = 'none';
    }, durationMs);
  }

  // Initialize Voice Controller
  const voiceController = new AegisVoiceController({
    onListeningStateChange: (listening) => {
      if (listening) {
        voiceMicBtn.classList.add('listening');
        voiceStatusText.textContent = 'Voice Command: Listening...';
      } else {
        voiceMicBtn.classList.remove('listening');
        voiceStatusText.textContent = 'Voice Command: Idle';
      }
    },
    onSpeechNarrative: (narrative) => {
      showToast('🔊 Audio Verdict: ' + narrative, 6000);
    },
    onCommand: (phrase) => {
      voiceStatusText.textContent = `Heard: "${phrase}"`;
    },
    onScanTrigger: () => toggleCamera(),
    onAnalyzeTrigger: () => executeForensicAnalysis(),
    onReadVerdictTrigger: () => {
      if (latestReport) voiceController.speakVerdict(latestReport);
    },
    onBridgeTrigger: () => openBridgeModal(),
    onExplainTrigger: () => {
      if (latestReport && latestReport.suspiciousRegions.length > 0) {
        selectRegion(latestReport.suspiciousRegions[0]);
      }
    }
  });

  voiceMicBtn.addEventListener('click', () => {
    voiceController.toggleListening();
  });

  listenVerdictBtn.addEventListener('click', () => {
    if (latestReport) {
      voiceController.speakVerdict(latestReport);
    } else {
      alert('Please run forensic analysis first.');
    }
  });

  // Initialize Office Kit Bridge
  let currentRole = 'phone';
  let bridge = new AegisOfficeKitBridge({
    role: currentRole,
    roomId: 'IQOO-2026',
    onStatusChange: (status) => {
      if (status.isConnected) {
        bridgeStatusText.textContent = status.isPaired ? `Office Kit: Paired (${status.roomId})` : `Office Kit: Connected (${status.roomId})`;
        modalBridgeStatus.textContent = status.isPaired ? 'Paired with Terminal' : 'Waiting for Peer...';
        pairPinDisplay.textContent = status.roomId;
      } else {
        bridgeStatusText.textContent = 'Office Kit: Offline';
        modalBridgeStatus.textContent = 'Disconnected';
      }
    },
    onTelemetryReceived: (telemetry) => {
      if (currentRole === 'laptop') {
        logAuditorEvent(`Received live telemetry: Risk ${telemetry.compositeScore}% (${telemetry.riskLevel}) from ${telemetry.sampleTitle}`);
        updateScoreDial(telemetry.compositeScore, telemetry.riskLevel);
        renderSignalsList(telemetry.layerScores);
        if (telemetry.suspiciousRegions && telemetry.suspiciousRegions.length > 0) {
          selectRegion(telemetry.suspiciousRegions[0]);
        }
      }
    },
    onRemoteCommandReceived: (msg) => {
      if (msg.command === 'request_rescan') {
        executeForensicAnalysis();
      } else if (msg.command === 'spotlight_region' && latestReport) {
        const found = latestReport.suspiciousRegions.find(r => r.id === msg.regionId);
        if (found) selectRegion(found);
      }
    }
  });
  bridge.connect();

  // Role Tab Switching
  tabPhone.addEventListener('click', () => {
    setRole('phone');
  });

  tabLaptop.addEventListener('click', () => {
    setRole('laptop');
  });

  function setRole(role) {
    currentRole = role;
    if (role === 'phone') {
      tabPhone.classList.add('active');
      tabLaptop.classList.remove('active');
      auditorWorkstationPanel.style.display = 'none';
    } else {
      tabLaptop.classList.add('active');
      tabPhone.classList.remove('active');
      auditorWorkstationPanel.style.display = 'block';
      logAuditorEvent('Laptop Terminal activated. Ready to audit incoming telemetry stream.');
    }
    bridge.role = role;
    bridge.connect();
  }

  function logAuditorEvent(text) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString()}]</span> ${text}`;
    auditorStreamBox.prepend(entry);
  }

  // Office Kit Modal handlers
  openBridgeBtn.addEventListener('click', openBridgeModal);
  closeBridgeModalBtn.addEventListener('click', closeBridgeModal);
  joinRoomBtn.addEventListener('click', () => {
    const customPin = customRoomInput.value.trim();
    if (customPin) {
      bridge.connect(customPin);
    }
  });

  syncOfficeKitBtn.addEventListener('click', () => {
    if (!latestReport) {
      alert('Please select or scan a document first.');
      return;
    }
    const success = bridge.syncTelemetry(latestReport, currentSampleId);
    if (success) {
      logAuditorEvent(`Dispatched forensic telemetry to Office Kit bridge.`);
      showToast('⚡ Forensic telemetry synchronized to Laptop Terminal!');
    } else {
      showToast('Connecting to Office Kit Bridge... please retry in 2 seconds.');
    }
  });

  function openBridgeModal() {
    bridgeModal.classList.add('open');
  }

  function closeBridgeModal() {
    bridgeModal.classList.remove('open');
  }

  // Sample Preset Selection
  sampleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      sampleButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sampleId = btn.dataset.sample;
      loadSample(sampleId);
    });
  });

  function loadSample(sampleId) {
    currentSampleId = sampleId;
    stopCamera();
    clearRegions();

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `samples/${sampleId}.png`;
    img.onload = () => {
      originalImageObject = img;
      renderImageToCanvas(img);
      // Auto-trigger forensic analysis for instant demo wow
      executeForensicAnalysis();
    };
    img.onerror = () => {
      console.warn('Could not load sample image:', sampleId);
    };
  }

  function renderImageToCanvas(img) {
    documentCanvas.width = img.naturalWidth || img.width;
    documentCanvas.height = img.naturalHeight || img.height;
    canvasCtx.drawImage(img, 0, 0);
  }

  // File Upload Handlers
  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });
  }

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    stopCamera();
    clearRegions();
    currentSampleId = file.name;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        originalImageObject = img;
        renderImageToCanvas(img);
        executeForensicAnalysis(file);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  // Native Mobile Camera Input Fallback
  if (cameraNativeInput) {
    cameraNativeInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      stopCamera();
      clearRegions();
      currentSampleId = 'Camera Capture';

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          originalImageObject = img;
          renderImageToCanvas(img);
          executeForensicAnalysis(file);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
      cameraNativeInput.value = '';
    });
  }

  // Camera Management
  cameraBtn.addEventListener('click', toggleCamera);

  async function toggleCamera() {
    if (isCameraActive) {
      // Capture frame
      captureCameraFrame();
      stopCamera();
      return;
    }

    // Attempt live video stream (works on localhost / HTTPS)
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } }
        });
        cameraStream = stream;
        cameraVideo.srcObject = stream;
        cameraVideo.style.display = 'block';
        documentCanvas.style.display = 'none';
        cameraGuidelines.style.display = 'block';
        clearRegions();

        isCameraActive = true;
        cameraBtnText.textContent = 'Capture Document';
        cameraBtn.classList.remove('primary');
        cameraBtn.style.background = 'var(--color-danger)';
        return;
      } catch (err) {
        console.warn('Live stream unavailable, using native camera capture:', err);
      }
    }

    // Direct Native Camera intent (always works on all Android/iQOO devices over HTTP)
    if (cameraNativeInput) {
      cameraNativeInput.click();
    } else {
      fileInput.click();
    }
  }

  function captureCameraFrame() {
    documentCanvas.width = cameraVideo.videoWidth || 900;
    documentCanvas.height = cameraVideo.videoHeight || 1200;
    canvasCtx.drawImage(cameraVideo, 0, 0, documentCanvas.width, documentCanvas.height);
    
    // Create image snapshot object
    const snap = new Image();
    snap.src = documentCanvas.toDataURL('image/jpeg', 0.92);
    originalImageObject = snap;

    currentSampleId = 'Camera Capture';
    executeForensicAnalysis();
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    cameraVideo.style.display = 'none';
    cameraGuidelines.style.display = 'none';
    documentCanvas.style.display = 'block';
    isCameraActive = false;
    cameraBtnText.textContent = 'Open Camera';
    cameraBtn.classList.add('primary');
    cameraBtn.style.background = '';
  }

  // Forensic Analysis Pipeline
  runAnalysisBtn.addEventListener('click', () => {
    executeForensicAnalysis();
  });

  async function executeForensicAnalysis(fileContext = null) {
    if (!originalImageObject && !documentCanvas.width) {
      alert('Please load or capture a document first.');
      return;
    }

    // Activate scan beam animation
    viewfinderWrapper.classList.add('scanning-active');
    processingBadge.style.display = 'inline';
    clearRegions();

    try {
      // Execute 6-layer engine
      const report = await forensicEngine.analyzeDocument(originalImageObject || documentCanvas, {
        file: fileContext,
        ocrText: getSampleOCRText(currentSampleId)
      });

      latestReport = report;

      // Update HUD latency & scores
      latencyTag.textContent = `Local: ${report.executionTimeMs}ms`;
      updateScoreDial(report.compositeScore, report.riskLevel);
      renderSignalsList(report.layerScores);
      renderSuspiciousRegions(report.suspiciousRegions);

      // Auto-select primary region if flagged
      if (report.suspiciousRegions.length > 0) {
        selectRegion(report.suspiciousRegions[0]);
      } else {
        regionInspector.classList.remove('active');
      }

      // Sync via Office Kit if paired
      bridge.syncTelemetry(report, currentSampleId);

    } catch (err) {
      console.error('Forensic analysis error:', err);
    } finally {
      viewfinderWrapper.classList.remove('scanning-active');
      processingBadge.style.display = 'none';
    }
  }

  function updateScoreDial(score, riskLevel) {
    riskScoreNumber.textContent = `${score}%`;
    
    // SVG dial stroke-dashoffset: radius 60 => circumference = 2 * PI * 60 = 376.99
    const circumference = 377;
    const offset = circumference - (score / 100) * circumference;
    dialProgress.style.strokeDashoffset = offset;

    riskVerdictBadge.className = 'risk-verdict-badge';
    if (score >= 65) {
      dialProgress.style.stroke = 'var(--color-danger)';
      riskVerdictBadge.classList.add('risk-high');
      riskVerdictBadge.textContent = 'HIGH FORGERY RISK';
    } else if (score >= 35) {
      dialProgress.style.stroke = 'var(--color-warning)';
      riskVerdictBadge.classList.add('risk-medium');
      riskVerdictBadge.textContent = 'MEDIUM RISK';
    } else {
      dialProgress.style.stroke = 'var(--color-success)';
      riskVerdictBadge.classList.add('risk-low');
      riskVerdictBadge.textContent = 'AUTHENTIC / LOW RISK';
    }
  }

  function renderSignalsList(layerScores) {
    const definitions = [
      { key: 'ela', name: 'Error Level Analysis (ELA)', weight: '25%' },
      { key: 'noise', name: 'High-Pass Noise Discontinuity', weight: '20%' },
      { key: 'copyMove', name: 'Copy-Move Cloning Matcher', weight: '20%' },
      { key: 'geometry', name: 'Baseline Alignment & Font Jitter', weight: '15%' },
      { key: 'semantics', name: 'Financial Logic & Arithmetic Checksum', weight: '10%' },
      { key: 'metadata', name: 'Container & EXIF Signatures', weight: '10%' }
    ];

    signalsList.innerHTML = '';
    definitions.forEach(def => {
      const score = layerScores[def.key] || 0;
      const isFlagged = score > 45;
      const row = document.createElement('div');
      row.className = 'signal-row';
      row.innerHTML = `
        <div class="signal-meta">
          <span>${def.name}</span>
          <span style="font-size:0.7rem; color:var(--text-muted);">[w: ${def.weight}]</span>
        </div>
        <div class="signal-badge ${isFlagged ? 'flagged' : 'passed'}">
          ${isFlagged ? `FLAGGED (${score}%)` : `PASSED (${score}%)`}
        </div>
      `;
      signalsList.appendChild(row);
    });
  }

  function renderSuspiciousRegions(regions) {
    regionLayer.innerHTML = '';
    if (!regions || !regions.length) return;

    const scaleX = documentCanvas.clientWidth / documentCanvas.width;
    const scaleY = documentCanvas.clientHeight / documentCanvas.height;

    regions.forEach((r, idx) => {
      const box = document.createElement('div');
      box.className = 'suspicious-box';
      box.id = `box_${r.id}`;
      box.style.left = `${r.x * scaleX}px`;
      box.style.top = `${r.y * scaleY}px`;
      box.style.width = `${r.width * scaleX}px`;
      box.style.height = `${r.height * scaleY}px`;

      box.innerHTML = `<span class="box-tag">#${idx + 1} ${r.source}</span>`;
      box.addEventListener('click', () => {
        selectRegion(r);
        bridge.sendRemoteCommand('spotlight_region', r.id);
      });

      regionLayer.appendChild(box);
    });
  }

  function selectRegion(region) {
    // Unselect all boxes
    document.querySelectorAll('.suspicious-box').forEach(b => b.classList.remove('selected'));
    const activeBox = document.getElementById(`box_${region.id}`);
    if (activeBox) activeBox.classList.add('selected');

    // Populate Inspector Card
    inspectorTitle.textContent = `Region Flagged: ${region.signal}`;
    inspectorConfidence.textContent = `Confidence: ${Math.round((region.confidence || 0.9) * 100)}%`;
    inspectorBody.textContent = region.explanation;
    inspectorMath.textContent = `Location: [x:${region.x}, y:${region.y}, w:${region.width}, h:${region.height}] | Severity: ${region.severityScore || 75}/100`;

    regionInspector.classList.add('active');
  }

  function clearRegions() {
    regionLayer.innerHTML = '';
    regionInspector.classList.remove('active');
  }

  // View Mode: Normal vs ELA
  viewNormalBtn.addEventListener('click', () => {
    viewNormalBtn.classList.add('active');
    viewElaBtn.classList.remove('active');
    viewMode = 'normal';
    if (originalImageObject) {
      renderImageToCanvas(originalImageObject);
      regionLayer.style.display = 'block';
    }
  });

  viewElaBtn.addEventListener('click', () => {
    if (!latestReport || !latestReport.elaDataUrl) {
      alert('Please run forensics first to generate ELA recompression heatmap.');
      return;
    }
    viewElaBtn.classList.add('active');
    viewNormalBtn.classList.remove('active');
    viewMode = 'ela';
    
    const elaImg = new Image();
    elaImg.onload = () => {
      canvasCtx.drawImage(elaImg, 0, 0, documentCanvas.width, documentCanvas.height);
      regionLayer.style.display = 'block';
    };
    elaImg.src = latestReport.elaDataUrl;
  });

  // Synthetic Document OCR Context Helper
  function getSampleOCRText(sampleId) {
    if (sampleId.includes('sample_2')) {
      return 'global apex financial certified account transaction statement 9182 3019 4410 aarav s mehta 01-sep-2026 opening balance 1,18,500.00 03-sep-2026 tech corp salary 95,000.00 total credits inr 95,000.00 total debits inr 29,800.00 net closing inr 9,83,700.00 closing balance 9,83,700.00';
    } else if (sampleId.includes('sample_3')) {
      return 'global apex financial income salary certificate tax assessment 4820 9102 3318 pooja v nair 01-jul-2026 01-aug-2026 01-sep-2026 28-dec-2027 performance incentive bonus 31-dec-2028 expiry';
    } else if (sampleId.includes('sample_4')) {
      return 'commercial credit facility approval gaf-loan-77210 1029 4810 5519 apex horizon ventures inr 50,00,000.00 10-sep-2026 executive director endorsement';
    }
    return 'global apex financial certified account transaction statement 9182 3019 4410 aarav s mehta 01-sep-2026 opening balance 1,18,500.00 03-sep-2026 tech corp salary 95,000.00 12-sep-2026 closing balance 1,83,700.00 net closing inr 1,83,700.00';
  }

  // Load Initial Benchmark Sample
  loadSample('sample_1_authentic');
});
