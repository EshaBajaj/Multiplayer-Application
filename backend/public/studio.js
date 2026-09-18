/**
 * ROXSTAR Web Audio Studio & Sound Effects Engine (Light Theme Edition)
 * Provides Web Audio API Echo DSP Filter, Live Mic Volume Meter,
 * & Synthesizer Sound Effects (Spin Ticks, Elimination Thud, Victory Chime)
 */
class WebAudioStudio {
  constructor() {
    this.audioCtx = null;
    this.micStream = null;
    this.micSource = null;
    this.delayNode = null;
    this.feedbackGain = null;
    this.dryGain = null;
    this.wetGain = null;
    this.analyser = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordedBlob = null;
    this.isRecording = false;
    this.isMicActive = false;
    this.animFrameId = null;

    // Default Echo DSP Params
    this.delayTime = 0.25;
    this.feedback = 0.4;
    this.echoEnabled = true;
  }

  async initMic() {
    if (this.isMicActive) return true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });

      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.micStream = stream;
      this.micSource = this.audioCtx.createMediaStreamSource(stream);

      // Create Nodes
      this.delayNode = this.audioCtx.createDelay();
      this.delayNode.delayTime.value = this.delayTime;

      this.feedbackGain = this.audioCtx.createGain();
      this.feedbackGain.gain.value = this.feedback;

      this.dryGain = this.audioCtx.createGain();
      this.wetGain = this.audioCtx.createGain();
      this.dryGain.gain.value = 1.0;
      this.wetGain.gain.value = this.echoEnabled ? 0.6 : 0.0;

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;

      // Connect DSP Graph
      this.micSource.connect(this.dryGain);
      this.dryGain.connect(this.analyser);

      this.micSource.connect(this.delayNode);
      this.delayNode.connect(this.feedbackGain);
      this.feedbackGain.connect(this.delayNode);

      this.delayNode.connect(this.wetGain);
      this.wetGain.connect(this.analyser);

      this.isMicActive = true;
      this.startVisualizer();
      this.startMicMeter();
      return true;
    } catch (err) {
      console.error('Failed to initialize microphone stream:', err);
      return false;
    }
  }

  setDelayTime(seconds) {
    this.delayTime = parseFloat(seconds);
    if (this.delayNode) {
      this.delayNode.delayTime.setTargetAtTime(this.delayTime, this.audioCtx.currentTime, 0.05);
    }
  }

  setFeedback(gainVal) {
    this.feedback = parseFloat(gainVal);
    if (this.feedbackGain) {
      this.feedbackGain.gain.setTargetAtTime(this.feedback, this.audioCtx.currentTime, 0.05);
    }
  }

  toggleEcho(enabled) {
    this.echoEnabled = enabled;
    if (this.wetGain && this.audioCtx) {
      this.wetGain.gain.setTargetAtTime(enabled ? 0.6 : 0.0, this.audioCtx.currentTime, 0.05);
    }
  }

  startMicMeter() {
    if (!this.analyser) return;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    const updateMeter = () => {
      if (!this.isMicActive) return;
      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      const meterFill = document.getElementById('micVolumeFill');
      if (meterFill) {
        const scalePct = Math.min(1.0, (average / 128));
        meterFill.style.transform = `scaleX(${scalePct.toFixed(2)})`;
      }
      requestAnimationFrame(updateMeter);
    };
    updateMeter();
  }

  startVisualizer() {
    const canvas = document.getElementById('waveformCanvas');
    if (!canvas || !this.analyser) return;

    const ctx = canvas.getContext('2d');
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.animFrameId = requestAnimationFrame(draw);

      this.analyser.getByteTimeDomainData(dataArray);

      // Light background fill
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = this.isRecording ? '#db2777' : '#2563eb';
      ctx.beginPath();

      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
  }

  async startRecording() {
    if (!this.isMicActive) {
      const ok = await this.initMic();
      if (!ok) return false;
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.recordedChunks = [];

    const dest = this.audioCtx.createMediaStreamDestination();
    this.analyser.connect(dest);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(dest.stream, { mimeType });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.recordedBlob = new Blob(this.recordedChunks, { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(this.recordedBlob);
      const previewAudio = document.getElementById('studioPreviewAudio');
      if (previewAudio) {
        previewAudio.src = audioUrl;
        previewAudio.style.display = 'block';
      }
    };

    this.mediaRecorder.start(100);
    this.isRecording = true;
    return true;
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
  }

  async uploadRecording(userId, title) {
    if (!this.recordedBlob) {
      alert('No recorded take found. Record audio first.');
      return null;
    }

    const formData = new FormData();
    formData.append('audio', this.recordedBlob, `take_${Date.now()}.wav`);
    formData.append('user_id', userId);
    formData.append('title', title || 'Web Echo Studio Take');
    formData.append('effect_applied', this.echoEnabled ? 'ECHO_DSP' : 'CLEAN');

    try {
      const res = await fetch('/api/drafts/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('Audio upload failed:', err);
      alert('Upload failed. Check network connection.');
      return null;
    }
  }

  // Synthesizer Sound Effects (Zero External Files)
  playSpinTick() {
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, this.audioCtx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.04);
    } catch (e) {}
  }

  playEliminationSound() {
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, this.audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.3);
    } catch (e) {}
  }

  playVictoryChime() {
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const startTime = this.audioCtx.currentTime + idx * 0.12;
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.4);
      });
    } catch (e) {}
  }
}

// Global Studio Instance
window.webStudio = new WebAudioStudio();
