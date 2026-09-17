/**
 * UploadModal Component
 * 
 * Enforces production upload workflow:
 * - Formats: JPEG, PNG, WEBP, PDF (p. 1)
 * - Limits: Max 20 MB, Min 1000px short edge (150 DPI)
 * - Features: Drag & Drop, Progress Bar with Cancel, Blur / Resolution Pre-flight
 * - Link: "Try with pre-loaded sample" inside the modal
 */

(function (global) {
  'use strict';

  function renderUploadModal() {
    return `
      <div class="upload-modal-backdrop" id="uploadModalBackdrop" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="uploadModalTitle">
        <div class="upload-modal-card">
          <div class="upload-modal-header">
            <div class="um-title-wrap">
              <div class="um-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div>
                <h3 class="um-title" id="uploadModalTitle">Ingest Document for Forensic Audit</h3>
                <span class="um-subtitle">100% On-Device Processing • Zero Upload to Servers</span>
              </div>
            </div>
            <button class="um-close-btn" id="uploadModalCloseBtn" aria-label="Close Ingestion Modal">✕</button>
          </div>

          <div class="upload-modal-body">
            <!-- Format & Constraint Pills -->
            <div class="um-spec-pills">
              <span class="um-pill">JPEG, PNG, WEBP</span>
              <span class="um-pill">PDF (p. 1 only)</span>
              <span class="um-pill highlight">Max 20 MB</span>
              <span class="um-pill">Min 1000px / 150 DPI</span>
            </div>

            <!-- Drag & Drop Zone -->
            <div class="um-dropzone" id="umDropzone" tabindex="0" role="button" aria-label="Drop financial document here or click to browse">
              <input type="file" id="umFileInput" accept="image/jpeg,image/png,image/webp,application/pdf" class="visually-hidden-input">
              <div class="um-dropzone-content">
                <div class="um-drop-icon">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2">
                    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
                    <path d="M12 12v9"/>
                    <path d="m8 16 4-4 4 4"/>
                  </svg>
                </div>
                <h4 class="um-drop-heading">Drag & drop document here, or <span class="um-browse-link">browse device</span></h4>
                <p class="um-drop-help">Statements, invoices, payroll certificates, loan agreements</p>
              </div>
            </div>

            <!-- Pre-Flight Error Alert Box -->
            <div class="um-alert-box" id="umAlertBox" style="display:none;" role="alert">
              <div class="um-alert-icon">⚠️</div>
              <div class="um-alert-text" id="umAlertText">Error message here</div>
            </div>

            <!-- Cancelable Progress Bar -->
            <div class="um-progress-wrap" id="umProgressWrap" style="display:none;">
              <div class="um-progress-header">
                <span class="um-progress-step" id="umProgressStepText">Ingesting document...</span>
                <span class="um-progress-pct" id="umProgressPct">0%</span>
              </div>
              <div class="um-progress-track">
                <div class="um-progress-bar" id="umProgressBar" style="width: 0%;"></div>
              </div>
              <div class="um-progress-footer">
                <span class="um-progress-sub">Running in-memory WebGL convolution</span>
                <button type="button" class="um-cancel-btn" id="umCancelBtn">Cancel Analysis</button>
              </div>
            </div>

            <!-- Sample Document Quick Fallback -->
            <div class="um-sample-fallback">
              <span>Don't have a document handy?</span>
              <button type="button" class="um-sample-link" id="umTrySampleLink">
                ⚡ Try with pre-authorized synthetic sample (instant verify)
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  global.UploadModal = {
    render: renderUploadModal
  };
})(typeof window !== 'undefined' ? window : this);
