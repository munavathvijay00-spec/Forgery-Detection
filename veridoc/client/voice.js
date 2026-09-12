/**
 * AegisDoc Voice Intelligence Subsystem
 * Satisfies iQOO HackTracker: "Creative phone use (Camera, Voice, On-Device AI in the build)"
 * 
 * Features:
 * 1. Speech Recognition for hands-free voice commands
 * 2. Speech Synthesis for audible forensic executive briefings
 */

class AegisVoiceController {
  constructor(callbacks = {}) {
    this.callbacks = callbacks; // onCommand, onListeningStateChange, onError
    this.isListening = false;
    this.isSpeaking = false;
    this.recognition = null;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.voiceEnabled = true;

    this.initSpeechRecognition();
  }

  initSpeechRecognition() {
    const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not available on this browser/webview.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.callbacks.onListeningStateChange) {
        this.callbacks.onListeningStateChange(true);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.callbacks.onListeningStateChange) {
        this.callbacks.onListeningStateChange(false);
      }
    };

    this.recognition.onerror = (e) => {
      console.warn('Speech recognition error:', e.error);
      this.isListening = false;
      if (this.callbacks.onListeningStateChange) {
        this.callbacks.onListeningStateChange(false);
      }
    };

    this.recognition.onresult = (event) => {
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex][0].transcript.trim().toLowerCase();
      console.log(`[Voice Command Heard]: "${transcript}"`);
      this.dispatchCommand(transcript);
    };
  }

  toggleListening() {
    if (!this.recognition) {
      alert('Speech Recognition is not supported in this browser. Please use Chrome/Edge or an Android browser.');
      return false;
    }
    if (this.isListening) {
      this.recognition.stop();
      return false;
    } else {
      try {
        this.recognition.start();
        return true;
      } catch (err) {
        console.warn('Could not start recognition:', err);
        return false;
      }
    }
  }

  dispatchCommand(phrase) {
    if (this.callbacks.onCommand) {
      this.callbacks.onCommand(phrase);
    }

    // Common command maps
    if (phrase.includes('scan') || phrase.includes('camera') || phrase.includes('capture')) {
      if (this.callbacks.onScanTrigger) this.callbacks.onScanTrigger();
    } else if (phrase.includes('analyze') || phrase.includes('run forensic') || phrase.includes('check')) {
      if (this.callbacks.onAnalyzeTrigger) this.callbacks.onAnalyzeTrigger();
    } else if (phrase.includes('verdict') || phrase.includes('read') || phrase.includes('report') || phrase.includes('summary')) {
      if (this.callbacks.onReadVerdictTrigger) this.callbacks.onReadVerdictTrigger();
    } else if (phrase.includes('pair') || phrase.includes('bridge') || phrase.includes('laptop')) {
      if (this.callbacks.onBridgeTrigger) this.callbacks.onBridgeTrigger();
    } else if (phrase.includes('explain') || phrase.includes('amount') || phrase.includes('detail')) {
      if (this.callbacks.onExplainTrigger) this.callbacks.onExplainTrigger();
    }
  }

  /**
   * Reads out forensic verdict with natural speech synthesis
   */
  speakVerdict(report) {
    const riskPercent = report.compositeScore;
    const riskLevel = report.riskLevel;
    const regionCount = report.suspiciousRegions ? report.suspiciousRegions.length : 0;

    let narrative = `AegisDoc forensic analysis complete. `;
    narrative += `Document classified as ${riskLevel}, with a forgery risk score of ${riskPercent} percent. `;

    if (regionCount === 0) {
      narrative += `No anomalies detected. Compression, noise, and baseline geometry are consistent with an authentic document.`;
    } else {
      narrative += `${regionCount} suspicious region${regionCount > 1 ? 's' : ''} detected. `;
      const primary = report.suspiciousRegions[0];
      narrative += `Primary finding: ${primary.signal}. ${primary.explanation.split('.')[0]}. `;
      narrative += `Recommended action: Flag for compliance review.`;
    }

    if (this.callbacks.onSpeechNarrative) {
      this.callbacks.onSpeechNarrative(narrative);
    }

    if (!this.synth || !this.voiceEnabled) return;
    try {
      this.synth.cancel();
      if (this.synth.resume) this.synth.resume();

      const utterance = new SpeechSynthesisUtterance(narrative);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      const voices = this.synth.getVoices();
      if (voices && voices.length > 0) {
        const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premium')));
        if (preferredVoice) utterance.voice = preferredVoice;
      }

      utterance.onstart = () => { this.isSpeaking = true; };
      utterance.onend = () => { this.isSpeaking = false; };
      utterance.onerror = (err) => { 
        console.warn('SpeechSynthesis error:', err);
        this.isSpeaking = false; 
      };

      this.synth.speak(utterance);
    } catch (err) {
      console.warn('Could not speak verdict:', err);
    }
  }

  stopSpeaking() {
    if (this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
    }
  }
}

if (typeof window !== 'undefined') {
  window.AegisVoiceController = AegisVoiceController;
}
