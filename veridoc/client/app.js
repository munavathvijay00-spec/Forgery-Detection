/**
 * AegisDoc Main Application Controller
 * Multi-Experience Single Page Architecture supporting 16 distinct visual views.
 * 
 * Orchestrates:
 * - Hash-based client router across 16 specialized page views
 * - 6-layer on-device forensic engine execution
 * - Interactive multi-mode Forensics Lab (Original, Analysis, Heatmap, Evidence)
 * - Before/After comparison draggable slider
 * - Interactive Tamper Challenge
 * - Risk Explorer signal explainers
 * - Financial ledger history log
 * - Web Speech voice commands & speech synthesis verdict
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
  let labMode = 'analysis'; // 'original', 'analysis', 'heatmap', 'evidence'

  // ========================================================================
  // ROUTER SUBSYSTEM (16 Specialized Views)
  // ========================================================================
  const pageViews = document.querySelectorAll('.page-view');
  const navLinks = document.querySelectorAll('.nav-link');
  const switcherItems = document.querySelectorAll('.switcher-item');
  const switcherToggleBtn = document.getElementById('switcherToggleBtn');
  const switcherMenu = document.getElementById('switcherMenu');

  function navigateToRoute(route) {
    if (!route) route = 'landing';
    const targetId = `view-${route}`;
    let found = false;

    pageViews.forEach(view => {
      if (view.id === targetId) {
        view.classList.add('active');
        found = true;
      } else {
        view.classList.remove('active');
      }
    });

    if (!found && pageViews.length > 0) {
      pageViews[0].classList.add('active');
    }

    // Update active states in navigation
    navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.route === route);
    });
    switcherItems.forEach(item => {
      item.classList.toggle('active', item.dataset.route === route);
    });

    // Close switcher dropdown
    if (switcherMenu) switcherMenu.classList.remove('open');

    // Scroll smoothly to top of view
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Specialized view hooks
    if (route === 'forensics') {
      renderLabView();
    } else if (route === 'scanner') {
      startMobileCamera();
    } else if (route !== 'scanner' && isCameraActive) {
      stopCamera();
    }
  }

  // Handle hash change events
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    navigateToRoute(hash);
  });

  // Switcher dropdown toggle
  if (switcherToggleBtn && switcherMenu) {
    switcherToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      switcherMenu.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.quick-switcher')) {
        switcherMenu.classList.remove('open');
      }
    });
  }

  // Initial Route
  const initialHash = window.location.hash.replace('#', '') || 'landing';
  navigateToRoute(initialHash);

  // ========================================================================
  // CORE DOM ELEMENTS
  // ========================================================================
  // Control Room Canvas & Video
  const documentCanvas = document.getElementById('documentCanvas');
  const canvasCtx = documentCanvas ? documentCanvas.getContext('2d', { willReadFrequently: true }) : null;
  const cameraVideo = document.getElementById('cameraVideo');
  const cameraGuidelines = document.getElementById('cameraGuidelines');
  const regionLayer = document.getElementById('regionLayer');

  // Control Room Buttons & HUD
  const cameraBtn = document.getElementById('cameraBtn');
  const cameraBtnText = document.getElementById('cameraBtnText');
  const cameraNativeInput = document.getElementById('cameraNativeInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');
  const runAnalysisBtn = document.getElementById('runAnalysisBtn');
  const sampleButtons = document.querySelectorAll('.sample-btn');
  const viewNormalBtn = document.getElementById('viewNormalBtn');
  const viewElaBtn = document.getElementById('viewElaBtn');
  const latencyTag = document.getElementById('latencyTag');
  const riskScoreNumber = document.getElementById('riskScoreNumber');
  const riskVerdictBadge = document.getElementById('riskVerdictBadge');
  const signalsList = document.getElementById('signalsList');
  const verdictToast = document.getElementById('verdictToast');

  // Voice & Bridge Controls
  const voiceMicBtn = document.getElementById('voiceMicBtn');
  const listenVerdictBtn = document.getElementById('listenVerdictBtn');
  const openBridgeBtn = document.getElementById('openBridgeBtn');
  const bridgeStatusText = document.getElementById('bridgeStatusText');
  const syncOfficeKitBtn = document.getElementById('syncOfficeKitBtn');
  const bridgeModal = document.getElementById('bridgeModal');
  const closeBridgeModalBtn = document.getElementById('closeBridgeModalBtn');
  const customRoomInput = document.getElementById('customRoomInput');
  const joinRoomBtn = document.getElementById('joinRoomBtn');
  const modalBridgeStatus = document.getElementById('modalBridgeStatus');
  const auditorStreamBox = document.getElementById('auditorStreamBox');

  // Forensics Lab Elements
  const labCanvas = document.getElementById('labCanvas');
  const labCtx = labCanvas ? labCanvas.getContext('2d', { willReadFrequently: true }) : null;
  const labRegionLayer = document.getElementById('labRegionLayer');
  const labModeOriginal = document.getElementById('labModeOriginal');
  const labModeAnalysis = document.getElementById('labModeAnalysis');
  const labModeHeatmap = document.getElementById('labModeHeatmap');
  const labModeEvidence = document.getElementById('labModeEvidence');
  const regionInspector = document.getElementById('regionInspector');
  const inspectorTitle = document.getElementById('inspectorTitle');
  const inspectorConfidence = document.getElementById('inspectorConfidence');
  const inspectorBody = document.getElementById('inspectorBody');
  const inspectorMath = document.getElementById('inspectorMath');

  // Audit Report Elements
  const repDocId = document.getElementById('repDocId');
  const repTimestamp = document.getElementById('repTimestamp');
  const repLatency = document.getElementById('repLatency');
  const repScoreText = document.getElementById('repScoreText');
  const repRiskLevel = document.getElementById('repRiskLevel');
  const repEvidenceList = document.getElementById('repEvidenceList');

  // Scanner & Processing Elements
  const scannerMobileVideo = document.getElementById('scannerMobileVideo');
  const scannerShutterBtn = document.getElementById('scannerShutterBtn');
  const procTicker = document.getElementById('procTicker');
  const ledgerTableBody = document.getElementById('ledgerTableBody');

  // Helper: Toast Notifications
  function showToast(text, durationMs = 4500) {
    if (!verdictToast) return;
    verdictToast.textContent = text;
    verdictToast.style.display = 'block';
    setTimeout(() => {
      verdictToast.style.display = 'none';
    }, durationMs);
  }

  // Helper: Auditor Stream Logger
  function logAuditorEvent(msg) {
    if (!auditorStreamBox) return;
    const now = new Date();
    const timeStr = `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;
    const entry = document.createElement('div');
    entry.className = 'terminal-entry';
    entry.innerHTML = `<span class="terminal-time">${timeStr}</span> ${msg}`;
    auditorStreamBox.appendChild(entry);
    auditorStreamBox.scrollTop = auditorStreamBox.scrollHeight;
  }

  // ========================================================================
  // VOICE COMMAND CONTROLLER
  // ========================================================================
  const voiceController = new AegisVoiceController({
    onListeningStateChange: (listening) => {
      if (voiceMicBtn) {
        voiceMicBtn.classList.toggle('listening', listening);
      }
    },
    onSpeechNarrative: (narrative) => {
      showToast('🔊 ' + narrative, 6000);
    },
    onCommand: (phrase) => {
      logAuditorEvent(`Voice Command recognized: "${phrase}"`);
      if (phrase.includes('scan')) {
        window.location.hash = '#scanner';
      } else if (phrase.includes('analyze')) {
        executeForensicAnalysis();
      } else if (phrase.includes('verdict')) {
        if (latestReport) voiceController.speakVerdict(latestReport);
      } else if (phrase.includes('pair') || phrase.includes('laptop')) {
        openBridgeModal();
      }
    }
  });

  if (voiceMicBtn) {
    voiceMicBtn.addEventListener('click', () => {
      voiceController.toggleListening();
    });
  }

  if (listenVerdictBtn) {
    listenVerdictBtn.addEventListener('click', () => {
      if (latestReport) {
        voiceController.speakVerdict(latestReport);
      } else {
        alert('Please run forensic analysis first.');
      }
    });
  }

  // ========================================================================
  // OFFICE KIT PHONE-LAPTOP BRIDGE
  // ========================================================================
  let currentRole = 'phone';
  let bridge = new AegisOfficeKitBridge({
    role: currentRole,
    roomId: 'IQOO-2026',
    onStatusChange: (status) => {
      if (bridgeStatusText) {
        bridgeStatusText.textContent = status.isPaired ? `Paired (${status.roomId})` : (status.isConnected ? `Connected (${status.roomId})` : 'Office Kit');
      }
      if (openBridgeBtn) {
        openBridgeBtn.classList.toggle('paired', status.isPaired);
      }
      if (modalBridgeStatus) {
        modalBridgeStatus.textContent = status.isPaired ? 'Paired with Terminal' : (status.isConnected ? 'Waiting for peer...' : 'Offline');
      }
    },
    onRemoteCommand: (command, data) => {
      logAuditorEvent(`Remote command received from Laptop: ${command}`);
      if (command === 'spotlight_region') {
        highlightRegionById(data);
      }
    }
  });

  function openBridgeModal() {
    if (bridgeModal) bridgeModal.classList.add('open');
  }
  function closeBridgeModal() {
    if (bridgeModal) bridgeModal.classList.remove('open');
  }

  if (openBridgeBtn) openBridgeBtn.addEventListener('click', openBridgeModal);
  if (closeBridgeModalBtn) closeBridgeModalBtn.addEventListener('click', closeBridgeModal);
  if (joinRoomBtn && customRoomInput) {
    joinRoomBtn.addEventListener('click', () => {
      const pin = customRoomInput.value.trim().toUpperCase();
      if (pin) bridge.connect(pin);
    });
  }
  if (syncOfficeKitBtn) {
    syncOfficeKitBtn.addEventListener('click', () => {
      if (!latestReport) {
        alert('Please select or scan a document first.');
        return;
      }
      const success = bridge.syncTelemetry(latestReport, currentSampleId);
      if (success) {
        logAuditorEvent('Dispatched telemetry payload to Office Kit peer.');
        showToast('⚡ Telemetry synchronized to Laptop Terminal!');
      } else {
        showToast('Connecting to Office Kit Bridge... retry in 2s.');
      }
    });
  }

  // ========================================================================
  // SAMPLE PRESET BENCHMARK SELECTION
  // ========================================================================
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
      executeForensicAnalysis();
    };
    img.onerror = () => {
      console.warn('Could not load sample:', sampleId);
    };
  }

  function renderImageToCanvas(img) {
    if (!documentCanvas || !canvasCtx) return;
    documentCanvas.width = img.naturalWidth || img.width;
    documentCanvas.height = img.naturalHeight || img.height;
    canvasCtx.drawImage(img, 0, 0);

    // Also draw on Forensics Lab canvas
    if (labCanvas && labCtx) {
      labCanvas.width = documentCanvas.width;
      labCanvas.height = documentCanvas.height;
      labCtx.drawImage(img, 0, 0);
    }
  }

  // ========================================================================
  // FILE UPLOAD & CAMERA CAPTURE
  // ========================================================================
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      currentSampleId = file.name;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => {
          originalImageObject = img;
          renderImageToCanvas(img);
          executeForensicAnalysis(file);
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
      fileInput.value = '';
    });
  }

  if (cameraBtn) {
    cameraBtn.addEventListener('click', toggleCamera);
  }

  async function toggleCamera() {
    if (isCameraActive) {
      captureCameraFrame();
      stopCamera();
      return;
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } }
        });
        cameraStream = stream;
        if (cameraVideo) {
          cameraVideo.srcObject = stream;
          cameraVideo.style.display = 'block';
        }
        if (documentCanvas) documentCanvas.style.display = 'none';
        if (cameraGuidelines) cameraGuidelines.style.display = 'block';
        clearRegions();

        isCameraActive = true;
        if (cameraBtnText) cameraBtnText.textContent = 'Capture Frame';
        return;
      } catch (err) {
        console.warn('Live stream unavailable, using native fallback:', err);
      }
    }

    if (cameraNativeInput) {
      cameraNativeInput.click();
    }
  }

  function captureCameraFrame() {
    if (!cameraVideo || !documentCanvas || !canvasCtx) return;
    documentCanvas.width = cameraVideo.videoWidth || 900;
    documentCanvas.height = cameraVideo.videoHeight || 1200;
    canvasCtx.drawImage(cameraVideo, 0, 0, documentCanvas.width, documentCanvas.height);

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
    if (cameraVideo) cameraVideo.style.display = 'none';
    if (cameraGuidelines) cameraGuidelines.style.display = 'none';
    if (documentCanvas) documentCanvas.style.display = 'block';
    isCameraActive = false;
    if (cameraBtnText) cameraBtnText.textContent = 'Open Camera';
  }

  // Mobile Scanner View (Page 11)
  async function startMobileCamera() {
    if (!scannerMobileVideo) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } }
      });
      scannerMobileVideo.srcObject = stream;
      isCameraActive = true;
    } catch (e) {
      console.warn('Mobile camera failed:', e);
    }
  }

  if (scannerShutterBtn) {
    scannerShutterBtn.addEventListener('click', () => {
      // Simulate cinematic scanning step
      window.location.hash = '#processing';
      if (procTicker) procTicker.textContent = '[STAGE 01/05] Ingesting Sensor Pixels...';

      setTimeout(() => {
        if (procTicker) procTicker.textContent = '[STAGE 03/05] Computing Error Level Analysis & Laplacian Derivatives...';
      }, 700);

      setTimeout(() => {
        if (procTicker) procTicker.textContent = '[STAGE 05/05] Synthesizing Calibrated Forensic Attestation...';
      }, 1400);

      setTimeout(() => {
        window.location.hash = '#control-room';
        loadSample('sample_2_amount_forged');
      }, 2100);
    });
  }

  // ========================================================================
  // 6-LAYER FORENSIC ENGINE EXECUTION
  // ========================================================================
  if (runAnalysisBtn) {
    runAnalysisBtn.addEventListener('click', () => executeForensicAnalysis());
  }

  async function executeForensicAnalysis(fileContext = null) {
    if (!originalImageObject && (!documentCanvas || !documentCanvas.width)) {
      alert('Please select or capture a document first.');
      return;
    }

    clearRegions();
    try {
      const report = await forensicEngine.analyzeDocument(originalImageObject || documentCanvas, {
        file: fileContext,
        ocrText: getSampleOCRText(currentSampleId)
      });

      latestReport = report;

      // Update Control Room HUD
      if (latencyTag) latencyTag.textContent = `LATENCY: ${report.executionTimeMs}ms`;
      if (riskScoreNumber) riskScoreNumber.textContent = `${report.compositeScore}%`;
      if (riskVerdictBadge) {
        riskVerdictBadge.textContent = report.riskLevel;
        if (report.compositeScore >= 65) {
          riskVerdictBadge.style.background = 'rgba(220, 38, 38, 0.2)';
          riskVerdictBadge.style.color = '#f87171';
          riskVerdictBadge.style.borderColor = '#ef4444';
          if (riskScoreNumber) riskScoreNumber.style.color = '#ef4444';
        } else if (report.compositeScore >= 35) {
          riskVerdictBadge.style.background = 'rgba(217, 119, 6, 0.2)';
          riskVerdictBadge.style.color = '#fbbf24';
          riskVerdictBadge.style.borderColor = '#d97706';
          if (riskScoreNumber) riskScoreNumber.style.color = '#fbbf24';
        } else {
          riskVerdictBadge.style.background = 'rgba(5, 150, 105, 0.2)';
          riskVerdictBadge.style.color = '#34d399';
          riskVerdictBadge.style.borderColor = '#059669';
          if (riskScoreNumber) riskScoreNumber.style.color = '#34d399';
        }
      }

      renderSignalsList(report.layerScores);
      renderSuspiciousRegions(report.suspiciousRegions);
      updateAuditReportView(report);
      appendHistoryLedger(currentSampleId, report);

      // Dispatched telemetry to bridge
      bridge.syncTelemetry(report, currentSampleId);
      logAuditorEvent(`Forensics complete in ${report.executionTimeMs}ms. Composite Risk: ${report.compositeScore}%.`);

    } catch (err) {
      console.error('Forensic analysis error:', err);
    }
  }

  function renderSignalsList(layerScores) {
    if (!signalsList) return;
    const defs = [
      { key: 'ela', name: 'Error Level Analysis (N-ELA)', weight: '25%' },
      { key: 'noise', name: 'High-Pass Noise Discontinuity', weight: '20%' },
      { key: 'copyMove', name: 'Copy-Move Matcher (NCC)', weight: '20%' },
      { key: 'geometry', name: 'Typographical Baseline Drift', weight: '15%' },
      { key: 'semantics', name: 'Financial Checksum & Ledger Math', weight: '10%' },
      { key: 'metadata', name: 'Container Signatures & EXIF', weight: '10%' }
    ];

    signalsList.innerHTML = '';
    defs.forEach(def => {
      const score = layerScores[def.key] || 0;
      const isFlagged = score > 45;
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '5px 8px';
      row.style.background = '#040711';
      row.style.borderRadius = '4px';
      row.style.fontFamily = 'var(--font-mono)';
      row.style.fontSize = '0.72rem';

      row.innerHTML = `
        <span>${def.name} <span style="color:#64748b;">[${def.weight}]</span></span>
        <span style="font-weight:700; color:${isFlagged ? '#f87171' : '#34d399'};">
          ${isFlagged ? `FLAGGED (${score}%)` : `PASSED (${score}%)`}
        </span>
      `;
      signalsList.appendChild(row);
    });
  }

  function renderSuspiciousRegions(regions) {
    if (!regionLayer) return;
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

    if (regions.length > 0) {
      selectRegion(regions[0]);
    }
  }

  function selectRegion(region) {
    document.querySelectorAll('.suspicious-box').forEach(b => b.classList.remove('selected'));
    const activeBox = document.getElementById(`box_${region.id}`);
    if (activeBox) activeBox.classList.add('selected');

    if (inspectorTitle) inspectorTitle.textContent = `Region Flagged: ${region.signal}`;
    if (inspectorConfidence) inspectorConfidence.textContent = `Confidence: ${Math.round((region.confidence || 0.9) * 100)}%`;
    if (inspectorBody) inspectorBody.textContent = region.explanation;
    if (inspectorMath) inspectorMath.textContent = `Coordinates: [x:${region.x}, y:${region.y}, w:${region.width}, h:${region.height}] · Severity: ${region.severityScore || 80}/100`;
  }

  function clearRegions() {
    if (regionLayer) regionLayer.innerHTML = '';
    if (labRegionLayer) labRegionLayer.innerHTML = '';
  }

  // ========================================================================
  // FORENSICS LAB MULTI-MODE TABS (Page 4)
  // ========================================================================
  function renderLabView() {
    if (!labCanvas || !labCtx || !originalImageObject) return;
    labCanvas.width = originalImageObject.naturalWidth || originalImageObject.width;
    labCanvas.height = originalImageObject.naturalHeight || originalImageObject.height;

    if (labMode === 'heatmap' && latestReport && latestReport.elaDataUrl) {
      const img = new Image();
      img.onload = () => {
        labCtx.drawImage(img, 0, 0, labCanvas.width, labCanvas.height);
      };
      img.src = latestReport.elaDataUrl;
    } else {
      labCtx.drawImage(originalImageObject, 0, 0);
    }
  }

  if (labModeOriginal && labModeAnalysis && labModeHeatmap && labModeEvidence) {
    const tabs = [labModeOriginal, labModeAnalysis, labModeHeatmap, labModeEvidence];
    tabs.forEach(t => {
      t.addEventListener('click', () => {
        tabs.forEach(tab => tab.classList.remove('active'));
        t.classList.add('active');
        if (t === labModeOriginal) labMode = 'original';
        else if (t === labModeAnalysis) labMode = 'analysis';
        else if (t === labModeHeatmap) labMode = 'heatmap';
        else if (t === labModeEvidence) labMode = 'evidence';
        renderLabView();
      });
    });
  }

  // ========================================================================
  // RESULTS AUDIT REPORT VIEW (Page 5)
  // ========================================================================
  function updateAuditReportView(report) {
    if (!repDocId) return;
    const now = new Date();
    const timeStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() + ' ' + now.toLocaleTimeString('en-GB') + ' UTC';

    repDocId.textContent = `AEGIS-${currentSampleId.toUpperCase().slice(0, 12)}-${Math.floor(1000 + Math.random()*9000)}`;
    repTimestamp.textContent = timeStr;
    repLatency.textContent = `${report.executionTimeMs}ms`;
    repScoreText.textContent = `${report.compositeScore} / 100`;
    repRiskLevel.textContent = report.riskLevel;

    if (repEvidenceList) {
      repEvidenceList.innerHTML = '';
      if (report.suspiciousRegions && report.suspiciousRegions.length > 0) {
        report.suspiciousRegions.forEach((r, idx) => {
          const item = document.createElement('div');
          item.style.padding = '8px 12px';
          item.style.background = '#f8fafc';
          item.style.border = '1px solid #e2e8f0';
          item.style.borderRadius = '6px';
          item.style.fontSize = '0.8rem';
          item.innerHTML = `<strong>#${idx + 1} ${r.source}:</strong> ${r.explanation}`;
          repEvidenceList.appendChild(item);
        });
      } else {
        const item = document.createElement('div');
        item.style.padding = '8px 12px';
        item.style.background = '#ecfdf5';
        item.style.border = '1px solid #a7f3d0';
        item.style.borderRadius = '6px';
        item.style.fontSize = '0.8rem';
        item.style.color = '#065f46';
        item.textContent = 'All mathematical and typographical checks passed. Zero anomalies detected.';
        repEvidenceList.appendChild(item);
      }
    }
  }

  // ========================================================================
  // RISK EXPLORER EXPLAINERS (Page 6)
  // ========================================================================
  const signalCards = document.querySelectorAll('.signal-viz-card');
  const explainerTitle = document.getElementById('explainerTitle');
  const explainerBody = document.getElementById('explainerBody');

  const signalExplanations = {
    ela: {
      title: 'Normalized Error Level Analysis (N-ELA)',
      desc: 'When an image is edited, pasted pixels carry a different JPEG compression history. By re-quantizing at 82% quality, tampered regions exhibit much higher residual differences compared to the ambient paper substrate.'
    },
    noise: {
      title: 'High-Pass Discrete Laplacian Noise Variance',
      desc: 'Physical sensors and scanners introduce uniform micro-noise across paper textures. Splicing an external number disrupts this continuous noise field, producing sudden statistical discontinuities.'
    },
    copymove: {
      title: 'Spatial Normalized Cross-Correlation (NCC)',
      desc: 'Cloned signatures and duplicated executive approval seals are located by computing cross-correlation sliding matrices across the document. Similarities exceeding 0.94 denote duplicated regions.'
    },
    baseline: {
      title: 'Typographical Baseline & Kerning Jitter',
      desc: 'Authentic financial forms maintain strict typesetting alignment. Digitally manipulated text blocks frequently exhibit vertical drift (Δy ≥ 4px) and irregular character spacing.'
    },
    ledger: {
      title: 'Ledger Arithmetic & Checksum Verification',
      desc: 'Reconciles the mathematical relationship: Opening Balance + Total Credits - Total Debits = Closing Balance. Altering a single digit introduces an irreconcilable ledger mismatch.'
    }
  };

  signalCards.forEach(card => {
    card.addEventListener('click', () => {
      signalCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const sigKey = card.dataset.signal;
      if (signalExplanations[sigKey]) {
        if (explainerTitle) explainerTitle.textContent = signalExplanations[sigKey].title;
        if (explainerBody) explainerBody.textContent = signalExplanations[sigKey].desc;
      }
    });
  });

  // ========================================================================
  // DOCUMENT COMPARISON DRAGGABLE SLIDER (Page 7)
  // ========================================================================
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
    const onMove = (e) => {
      if (!isSliderDragging) return;
      const x = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      updateSliderPosition(x);
    };
    const onUp = () => {
      isSliderDragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    sliderHandle.addEventListener('pointerdown', (e) => {
      isSliderDragging = true;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      e.preventDefault();
    });
    sliderHandle.addEventListener('touchstart', (e) => {
      isSliderDragging = true;
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
    }, { passive: true });

    comparisonSlider.addEventListener('click', (e) => {
      updateSliderPosition(e.clientX);
    });
  }

  // ========================================================================
  // TAMPER CHALLENGE GAME (Page 16)
  // ========================================================================
  const challengeCardA = document.getElementById('challengeCardA');
  const challengeCardB = document.getElementById('challengeCardB');
  const challengeResultBanner = document.getElementById('challengeResultBanner');

  if (challengeCardA && challengeCardB && challengeResultBanner) {
    challengeCardA.addEventListener('click', () => {
      challengeCardA.className = 'duel-card wrong';
      challengeCardB.className = 'duel-card';
      challengeResultBanner.style.display = 'block';
      challengeResultBanner.innerHTML = `
        <div style="color:var(--color-danger); font-weight:800; font-size:1rem; margin-bottom:4px;">
          ❌ Document A is 100% Authentic!
        </div>
        <div style="font-size:0.84rem; color:#475569; max-width:640px; margin:0 auto;">
          Document A possesses continuous camera noise, uniform ELA compression history, and valid arithmetic. Try selecting Document B!
        </div>
      `;
    });

    challengeCardB.addEventListener('click', () => {
      challengeCardB.className = 'duel-card correct';
      challengeCardA.className = 'duel-card';
      challengeResultBanner.style.display = 'block';
      challengeResultBanner.innerHTML = `
        <div style="color:var(--color-success); font-weight:800; font-size:1rem; margin-bottom:4px;">
          🎯 Spot On! Document B is Digitally Forged!
        </div>
        <div style="font-size:0.84rem; color:#475569; max-width:640px; margin:0 auto 12px auto;">
          The expiry date <strong>"31-DEC-2028"</strong> was pasted using an external typeface. AegisDoc detected a <strong>4.2px vertical baseline drift</strong> and a <strong>3.4x ELA compression spike</strong>.
        </div>
        <a href="#control-room" class="btn-primary" id="inspectDocBBtn" style="padding:6px 16px; font-size:0.8rem; display:inline-flex;">
          Inspect Document B in Control Room →
        </a>
      `;

      const inspectBtn = document.getElementById('inspectDocBBtn');
      if (inspectBtn) {
        inspectBtn.addEventListener('click', () => {
          sampleButtons.forEach(b => {
            if (b.dataset.sample === 'sample_3_date_font_forged') b.click();
          });
        });
      }
    });
  }

  // ========================================================================
  // HISTORY LEDGER (Page 13)
  // ========================================================================
  function appendHistoryLedger(name, report) {
    if (!ledgerTableBody) return;
    const now = new Date();
    const timeStr = `${String(now.getDate()).padStart(2, '0')}-SEP ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family:var(--font-mono);">${timeStr}</td>
      <td><strong>${name}</strong></td>
      <td style="font-family:var(--font-mono);">${report.executionTimeMs}ms</td>
      <td style="color:${report.compositeScore >= 65 ? 'var(--color-danger)' : 'var(--color-success)'}; font-weight:700;">
        ${report.compositeScore}% ${report.compositeScore >= 65 ? 'HIGH' : 'LOW'}
      </td>
      <td><a href="#results" class="btn-secondary" style="padding:4px 10px; font-size:0.72rem;">View Certificate</a></td>
    `;
    ledgerTableBody.insertBefore(tr, ledgerTableBody.firstChild);
  }

  // ========================================================================
  // OCR Context Helper
  // ========================================================================
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

  // Load Initial Benchmark
  loadSample('sample_1_authentic');
});
