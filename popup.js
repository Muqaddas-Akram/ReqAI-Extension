document.getElementById('openRecorder').addEventListener('click', async () => {
  const url = chrome.runtime.getURL('recorder.html');
  await chrome.tabs.create({ url });
  window.close();
});
