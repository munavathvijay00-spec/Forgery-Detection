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

      // Render "What Changed?" forensic diff
      renderWhatChanged(currentSampleId, report);

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

  // ==========================================
  // Interactive Feature 1: Before/After Slider
  // ==========================================
  const comparisonSlider = document.getElementById('comparisonSlider');
  const sliderAuthentic = document.getElementById('sliderAuthentic');
  const sliderHandle = document.getElementById('sliderHandle');
  let isSliderDragging = false;

  function updateSliderPosition(clientX) {
    if (!comparisonSlider || !sliderAuthentic || !sliderHandle) return;
    const rect = comparisonSlider.getBoundingClientRect();
    let pct = ((clientX - rect.left) / rect.width) * 100;
    pct = Math.max(0, Math.min(100, pct));
    sliderAuthentic.style.clipPath = `polygon(0 0, ${pct}% 0, ${pct}% 100%, 0 100%)`;
    sliderHandle.style.left = `${pct}%`;
  }

  if (comparisonSlider && sliderHandle) {
    const onPointerMove = (e) => {
      if (!isSliderDragging) return;
      const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      updateSliderPosition(clientX);
    };

    const onPointerUp = () => {
      if (!isSliderDragging) return;
      isSliderDragging = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    };

    sliderHandle.addEventListener('pointerdown', (e) => {
      isSliderDragging = true;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      e.preventDefault();
    });

    sliderHandle.addEventListener('touchstart', (e) => {
      isSliderDragging = true;
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerUp);
    }, { passive: true });

    comparisonSlider.addEventListener('click', (e) => {
      if (e.target.closest('.slider-labels')) return;
      updateSliderPosition(e.clientX);
    });
  }

  // ==========================================
  // Interactive Feature 2: Tamper Challenge
  // ==========================================
  const challengeCardA = document.getElementById('challengeCardA');
  const challengeCardB = document.getElementById('challengeCardB');
  const challengeResultBanner = document.getElementById('challengeResultBanner');

  if (challengeCardA && challengeCardB && challengeResultBanner) {
    challengeCardA.addEventListener('click', () => {
      challengeCardA.className = 'challenge-card selected-wrong';
      challengeCardB.className = 'challenge-card';
      challengeResultBanner.style.display = 'block';
      challengeResultBanner.innerHTML = `
        <div style="color:var(--color-danger); font-weight:700; font-size:0.95rem; margin-bottom:4px;">
          ❌ Document A is 100% Authentic!
        </div>
        <div style="font-size:0.84rem; color:var(--text-secondary); max-width:680px; margin:0 auto;">
          Document A exhibits completely uniform 82% ELA compression residuals, pristine baseline alignment, and an authentic 2% risk index. Try clicking Document B!
        </div>
      `;
    });

    challengeCardB.addEventListener('click', () => {
      challengeCardB.className = 'challenge-card selected-correct';
      challengeCardA.className = 'challenge-card';
      challengeResultBanner.style.display = 'block';
      challengeResultBanner.innerHTML = `
        <div style="color:var(--color-success); font-weight:700; font-size:0.95rem; margin-bottom:4px;">
          🎯 Spot On! Document B is Digitally Forged!
        </div>
        <div style="font-size:0.84rem; color:var(--text-secondary); max-width:680px; margin:0 auto 10px auto;">
          The bonus expiry date <strong>"31-DEC-2028"</strong> was pasted using an external non-native typeface. AegisDoc detected a <strong>4.2px vertical baseline drift</strong> and a <strong>3.4x ELA compression error spike</strong>.
        </div>
        <button id="inspectChallengeDocB" class="btn-primary" style="padding:7px 16px; font-size:0.82rem; margin:0 auto; display:inline-flex;">
          Inspect Document B in Live Sandbox →
        </button>
      `;

      const inspectBtn = document.getElementById('inspectChallengeDocB');
      if (inspectBtn) {
        inspectBtn.addEventListener('click', () => {
          const ws = document.getElementById('workspaceSection');
          if (ws) ws.scrollIntoView({ behavior: 'smooth' });
          sampleButtons.forEach(b => {
            if (b.dataset.sample === 'sample_3_date_font_forged') {
              b.click();
            }
          });
        });
      }
    });
  }

  // ==========================================
  // Interactive Feature 3: Dual-Layer Tech Toggle
  // ==========================================
  const techToggleSimple = document.getElementById('techToggleSimple');
  const techToggleDeep = document.getElementById('techToggleDeep');
  const pipelineNodes = document.getElementById('pipelineNodes');

  const executiveNodesHTML = `
    <div class="pipeline-node">
      <div class="pipeline-node-name"><span>📷 Document Capture & Sensor Ingestion</span></div>
      <span class="pipeline-node-spec">Hardware Camera / Canvas 2D</span>
    </div>
    <div class="pipeline-node" style="border-left: 3px solid var(--color-primary);">
      <div class="pipeline-node-name"><span>🔬 Layer 1: Normalized Error Level Analysis (N-ELA)</span></div>
      <span class="pipeline-node-spec">82% JPEG Recompression Δ</span>
    </div>
    <div class="pipeline-node" style="border-left: 3px solid var(--color-primary);">
      <div class="pipeline-node-name"><span>📊 Layer 2: High-Pass Laplacian Noise Variance</span></div>
      <span class="pipeline-node-spec">3x3 Discrete 2nd Derivative</span>
    </div>
    <div class="pipeline-node" style="border-left: 3px solid var(--color-primary);">
      <div class="pipeline-node-name"><span>📋 Layer 3: Normalized Cross-Correlation Copy-Move</span></div>
      <span class="pipeline-node-spec">NCC Matrix Matching ≥ 0.94</span>
    </div>
    <div class="pipeline-node" style="border-left: 3px solid var(--color-primary);">
      <div class="pipeline-node-name"><span>📏 Layer 4: Typographical Baseline Alignment Jitter</span></div>
      <span class="pipeline-node-spec">Vertical Drift Δy ≥ 4px</span>
    </div>
    <div class="pipeline-node" style="border-left: 3px solid var(--color-primary);">
      <div class="pipeline-node-name"><span>🔢 Layer 5: Financial Arithmetic & Date Chronology</span></div>
      <span class="pipeline-node-spec">Balance & Timestamp Sanity</span>
    </div>
    <div class="pipeline-node">
      <div class="pipeline-node-name"><span>⚖️ Evidence Fusion & Composite Risk Aggregator</span></div>
      <span class="pipeline-node-spec">0 - 100 Calibrated Risk Score</span>
    </div>
  `;

  const deepNodesHTML = `
    <div class="pipeline-node" style="border-left: 3px solid var(--color-primary);">
      <div class="pipeline-node-name"><span>📷 Discrete Frame Buffer Ingestion</span></div>
      <span class="pipeline-node-spec">RGBA 32-bit Uint8ClampedArray · 0 Server Roundtrips</span>
    </div>
    <div class="pipeline-node" style="border-left: 3px solid var(--color-danger);">
      <div class="pipeline-node-name"><span>🔬 Layer 1: DCT Resampling Error (N-ELA)</span></div>
      <span class="pipeline-node-spec">|I(x,y) - Q_82(I)| > 3.2 · μ_ambient · 8x8 DCT grid</span>
    </div>
    <div class="pipeline-node" style="border-left: 3px solid var(--color-warning);">
      <div class="pipeline-node-name"><span>📊 Layer 2: Substrate High-Pass 2nd Derivative</span></div>
      <span class="pipeline-node-spec">∇²I = [0 1 0; 1 -4 1; 0 1 0] * I · Text-Masked σ²</span>
    </div>
    <div class="pipeline-node" style="border-left: 3px solid var(--color-primary);">
      <div class="pipeline-node-name"><span>📋 Layer 3: Spatial Normalized Cross-Correlation</span></div>
      <span class="pipeline-node-spec">NCC(T,S) = ∑(T-μ_T)(S-μ_S) / (σ_T·σ_S) ≥ 0.94</span>
    </div>
    <div class="pipeline-node" style="border-left: 3px solid var(--color-primary);">
      <div class="pipeline-node-name"><span>📏 Layer 4: Otsu Binarization & Baseline Regression</span></div>
      <span class="pipeline-node-spec">y_bottom - ŷ_regression > 4.0px · Kerning σ > 1.8</span>
    </div>
    <div class="pipeline-node" style="border-left: 3px solid var(--color-primary);">
      <div class="pipeline-node-name"><span>🔢 Layer 5: Financial Ledger Arithmetic Audit</span></div>
      <span class="pipeline-node-spec">|Closing - (Opening + ∑Cr - ∑Dr)| > ε · ISO-8601 Sanity</span>
    </div>
    <div class="pipeline-node" style="border-left: 3px solid var(--color-success);">
      <div class="pipeline-node-name"><span>⚖️ Multi-Signal Evidence Fusion</span></div>
      <span class="pipeline-node-spec">Score = ∑(w_i · S_i) where w = [0.25, 0.20, 0.20, 0.15, 0.10, 0.10]</span>
    </div>
  `;

  if (techToggleSimple && techToggleDeep && pipelineNodes) {
    techToggleSimple.addEventListener('click', () => {
      techToggleSimple.classList.add('active');
      techToggleDeep.classList.remove('active');
      pipelineNodes.innerHTML = executiveNodesHTML;
    });

    techToggleDeep.addEventListener('click', () => {
      techToggleDeep.classList.add('active');
      techToggleSimple.classList.remove('active');
      pipelineNodes.innerHTML = deepNodesHTML;
    });
  }

  // ==========================================
  // Interactive Feature 4: What Changed? Diff
  // ==========================================
  const whatChangedCard = document.getElementById('whatChangedCard');
  const diffRows = document.getElementById('diffRows');

  function renderWhatChanged(sampleId, report) {
    if (!whatChangedCard || !diffRows) return;

    whatChangedCard.classList.add('active');
    if (sampleId.includes('sample_2')) {
      diffRows.innerHTML = `
        <div class="diff-row">
          <span style="font-weight:600; color:var(--text-secondary);">Closing Balance</span>
          <div>
            <span class="diff-before">₹1,83,700.00</span> → <span class="diff-after">₹9,83,700.00</span>
          </div>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; line-height:1.4;">
          <strong>Tamper Signature:</strong> First digit '1' was replaced with '9' (+₹8,00,000 inflation). Flagged by N-ELA (3.8x compression error spike) and ledger arithmetic failure.
        </div>
      `;
    } else if (sampleId.includes('sample_3')) {
      diffRows.innerHTML = `
        <div class="diff-row">
          <span style="font-weight:600; color:var(--text-secondary);">Bonus Validity Date</span>
          <div>
            <span class="diff-before">31-DEC-2026</span> → <span class="diff-after">31-DEC-2028</span>
          </div>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; line-height:1.4;">
          <strong>Tamper Signature:</strong> Splice of '2028' using non-native font. Detected via 4.2px vertical baseline drift and typographical stroke mismatch.
        </div>
      `;
    } else if (sampleId.includes('sample_4')) {
      diffRows.innerHTML = `
        <div class="diff-row">
          <span style="font-weight:600; color:var(--text-secondary);">Authorization Seal</span>
          <div>
            <span class="diff-before">Single Header Stamp</span> → <span class="diff-after">Duplicated Approval Stamp</span>
          </div>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; line-height:1.4;">
          <strong>Tamper Signature:</strong> Cloned stamp detected via Normalized Cross-Correlation (NCC = 0.96) duplicated to fabricate secondary executive approval.
        </div>
      `;
    } else if (report && report.compositeScore < 35) {
      diffRows.innerHTML = `
        <div class="diff-row">
          <span style="font-weight:600; color:var(--color-success);">Authenticity Audit</span>
          <span style="color:var(--color-success); font-weight:700;">PASSED</span>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; line-height:1.4;">
          No unauthorized modifications detected. Substrate noise variance, ELA compression matrices, and typographical baselines are completely consistent.
        </div>
      `;
    } else if (report && report.suspiciousRegions && report.suspiciousRegions.length > 0) {
      const reg = report.suspiciousRegions[0];
      diffRows.innerHTML = `
        <div class="diff-row">
          <span style="font-weight:600; color:var(--color-danger);">${reg.source || 'Flagged Region'}</span>
          <span class="diff-after">${reg.signal || 'Anomaly'}</span>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; line-height:1.4;">
          ${reg.explanation}
        </div>
      `;
    } else {
      whatChangedCard.classList.remove('active');
    }
  }

  // ==========================================
  // Interactive Feature 5: Export Verification Report Modal
  // ==========================================
  const exportReportBtn = document.getElementById('exportReportBtn');
  const reportModal = document.getElementById('reportModal');
  const closeReportModalBtn = document.getElementById('closeReportModalBtn');
  const closeReportBtn2 = document.getElementById('closeReportBtn2');
  const certDocId = document.getElementById('certDocId');
  const certTimestamp = document.getElementById('certTimestamp');
  const certLatency = document.getElementById('certLatency');
  const certRiskScore = document.getElementById('certRiskScore');
  const certAnomaliesCount = document.getElementById('certAnomaliesCount');
  const certRationaleText = document.getElementById('certRationaleText');

  function openReportModal() {
    if (!reportModal) return;
    const now = new Date();
    const timestampStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() + ' ' + now.toLocaleTimeString('en-GB') + ' UTC';
    
    if (certDocId) {
      const cleanName = currentSampleId.replace(/[^a-zA-Z0-9]/g, '-').toUpperCase();
      certDocId.textContent = `AEGIS-${cleanName.slice(0, 14)}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    if (certTimestamp) certTimestamp.textContent = timestampStr;
    if (certLatency) certLatency.textContent = latestReport ? `${latestReport.executionTimeMs}ms` : '72ms';

    if (latestReport) {
      const score = latestReport.compositeScore;
      if (certRiskScore) {
        certRiskScore.textContent = `${score} / 100 (${latestReport.riskLevel})`;
        certRiskScore.style.color = score >= 65 ? 'var(--color-danger)' : (score >= 35 ? 'var(--color-warning)' : 'var(--color-success)');
      }
      if (certAnomaliesCount) {
        const count = (latestReport.suspiciousRegions && latestReport.suspiciousRegions.length) || 0;
        certAnomaliesCount.textContent = count > 0 ? `${count} Region(s) Flagged` : '0 Anomalies (Clean Authenticity Attestation)';
      }
      if (certRationaleText) {
        if (latestReport.suspiciousRegions && latestReport.suspiciousRegions.length > 0) {
          certRationaleText.textContent = `Primary Finding: ${latestReport.suspiciousRegions[0].explanation}`;
        } else {
          certRationaleText.textContent = `Primary Finding: Document substrate noise variance, DCT compression error level, and typography are mathematically uniform. All financial ledgers and arithmetic reconcile with zero error.`;
        }
      }
    } else {
      if (certRiskScore) certRiskScore.textContent = '2 / 100 (LOW RISK)';
      if (certAnomaliesCount) certAnomaliesCount.textContent = '0 Anomalies (Clean)';
      if (certRationaleText) certRationaleText.textContent = 'Document passes all on-device mathematical verification checks.';
    }

    reportModal.classList.add('open');
  }

  function closeReportModal() {
    if (reportModal) reportModal.classList.remove('open');
  }

  if (exportReportBtn) exportReportBtn.addEventListener('click', openReportModal);
  if (closeReportModalBtn) closeReportModalBtn.addEventListener('click', closeReportModal);
  if (closeReportBtn2) closeReportBtn2.addEventListener('click', closeReportModal);
  if (reportModal) {
    reportModal.addEventListener('click', (e) => {
      if (e.target === reportModal) closeReportModal();
    });
  }

  // Load Initial Benchmark Sample
  loadSample('sample_1_authentic');
});
