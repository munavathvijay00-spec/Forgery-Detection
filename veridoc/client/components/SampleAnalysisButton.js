/**
 * SampleAnalysisButton Component
 * 
 * Provides an instant 1-click trigger to load a bundled synthetic benchmark
 * statement, populate all 6 forensic layers, and display the evidence ledger in <3 seconds.
 */

(function (global) {
  'use strict';

  function renderSampleAnalysisButton(options = {}) {
    const id = options.id || 'heroRunSampleBtn';
    const className = options.className || 'btn-sample-instant';
    const label = options.label || 'Run Sample Analysis';
    const sampleKey = options.sampleKey || 'sample_2_amount_forged';

    return `
      <button id="${id}" class="${className}" type="button" data-sample-key="${sampleKey}" aria-label="Run sample document analysis with pre-authorized synthetic bank statement">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        <span>${label}</span>
      </button>
    `;
  }

  function initSampleButton(buttonElement, onTrigger) {
    if (!buttonElement) return;
    buttonElement.addEventListener('click', (e) => {
      e.preventDefault();
      const sampleKey = buttonElement.getAttribute('data-sample-key') || 'sample_2_amount_forged';
      if (typeof onTrigger === 'function') {
        onTrigger(sampleKey);
      } else if (typeof window.triggerSampleAnalysis === 'function') {
        window.triggerSampleAnalysis(sampleKey);
      }
    });
  }

  global.SampleAnalysisButton = {
    render: renderSampleAnalysisButton,
    init: initSampleButton
  };
})(typeof window !== 'undefined' ? window : this);
