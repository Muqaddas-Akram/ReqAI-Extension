
const $ = (id) => document.getElementById(id);

const statusPill = $('statusPill');
const logBox = $('log');
const startBtn = $('startBtn');
const stopBtn = $('stopBtn');

let displayStream = null;
let micStream = null;
let mediaRecorder = null;
let chunks = [];

function setStatus(text, tone = 'idle') {
  statusPill.textContent = text;
  if (tone === 'recording') {
    statusPill.style.background = 'rgba(31,122,255,.16)';
    statusPill.style.borderColor = 'rgba(31,122,255,.32)';
    statusPill.style.color = '#dbe9ff';
  } else if (tone === 'success') {
    statusPill.style.background = 'rgba(45,212,191,.12)';
    statusPill.style.borderColor = 'rgba(45,212,191,.25)';
    statusPill.style.color = '#c8fff6';
  } else if (tone === 'warn') {
    statusPill.style.background = 'rgba(245,158,11,.12)';
    statusPill.style.borderColor = 'rgba(245,158,11,.25)';
    statusPill.style.color = '#ffe6b2';
  } else if (tone === 'danger') {
    statusPill.style.background = 'rgba(251,113,133,.12)';
    statusPill.style.borderColor = 'rgba(251,113,133,.25)';
    statusPill.style.color = '#ffd1d9';
  } else {
    statusPill.style.background = 'rgba(45,212,191,.12)';
    statusPill.style.borderColor = 'rgba(45,212,191,.25)';
    statusPill.style.color = '#bff8ef';
  }
}

function log(message) {
  logBox.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
}

function safeName(input) {
  return (input || 'meeting').trim().replace(/[^\w\-]+/g, '_').slice(0, 80);
}

async function saveLocal(blob, projectName) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `${safeName(projectName)}_${ts}.webm`;
  const filename = `ReqAI/${name}`;

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download(
      { url, filename, saveAs: false },
      (downloadId) => {
        URL.revokeObjectURL(url);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve({ downloadId, filename });
      }
    );
  });
}

async function uploadToN8n(blob, metadata) {
  const webhookUrl = $('webhookUrl').value.trim();
  const form = new FormData();
  form.append('audio_file', blob, metadata.fileName);
  form.append('project_name', metadata.projectName);
  form.append('client_name', metadata.clientName);
  form.append('pm_name', metadata.pmName);
  form.append('pm_email', metadata.pmEmail);
  form.append('source', 'reqai-meeting-recorder');
  form.append('recorded_at', new Date().toISOString());

  const res = await fetch(webhookUrl, { method: 'POST', body: form });

  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${text.slice(0, 200)}`);
  return data;
}

async function startRecording() {
  try {
    log('Opening tab/share picker...');
    setStatus('Choosing tab', 'warn');

    // Step 1: Tab audio capture
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });

    const tabAudioTracks = displayStream.getAudioTracks();
    if (!tabAudioTracks.length) {
      setStatus('No tab audio detected', 'danger');
      log('No tab audio. Enable "Share tab audio" in the picker.');
      displayStream.getTracks().forEach((t) => t.stop());
      displayStream = null;
      return;
    }

    // Step 2: Microphone capture
    log('Requesting microphone...');
    setStatus('Mic permission...', 'warn');
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Step 3: Mix tab + mic using AudioContext
    const audioCtx = new AudioContext();
    const destination = audioCtx.createMediaStreamDestination();

    const tabSource = audioCtx.createMediaStreamSource(new MediaStream(tabAudioTracks));
    tabSource.connect(destination);

    const micSource = audioCtx.createMediaStreamSource(micStream);
    micSource.connect(destination);

    // Step 4: Record mixed stream
    chunks = [];
    mediaRecorder = new MediaRecorder(destination.stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      try {
        audioCtx.close();
        if (micStream) micStream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunks, { type: 'audio/webm' });
        const meta = {
          projectName: $('projectName').value || 'ReqAI Meeting',
          clientName: $('clientName').value || 'Client',
          pmName: $('pmName').value || '',
          pmEmail: $('pmEmail').value || '',
          fileName: `${safeName($('projectName').value || 'meeting')}_${Date.now()}.webm`
        };

        setStatus('Saving local copy...', 'warn');
        const saved = await saveLocal(blob, meta.projectName);
        log(`Saved locally: Downloads/${saved.filename}`);

        setStatus('Uploading to n8n...', 'warn');
        const response = await uploadToN8n(blob, meta);

        setStatus('Upload complete', 'success');
        log('Uploaded successfully to n8n.');
        console.log('n8n response:', response);
      } catch (err) {
        setStatus('Upload error', 'danger');
        log(err.message || String(err));
      } finally {
        startBtn.disabled = false;
        stopBtn.disabled = true;
      }
    };

    mediaRecorder.start(1000);
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus('Recording', 'recording');
    log('Recording started — Tab + Mic both active.');
  } catch (err) {
    setStatus('Permission denied', 'danger');
    log(err.message || String(err));
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

function stopRecording() {
  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (displayStream) displayStream.getTracks().forEach((track) => track.stop());
    displayStream = null;
    micStream = null;
    setStatus('Processing...', 'warn');
    log('Stopping recording...');
  } catch (err) {
    setStatus('Stop failed', 'danger');
    log(err.message || String(err));
  }
}

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

setStatus('Idle');
log('Ready. Open a browser meeting tab and start recording.');
