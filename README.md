# ReqAI Meeting Recorder

A Chrome Extension for browser-based meetings.

## What it does
- Records tab audio from Google Meet / WhatsApp Web / browser-based Zoom
- Saves the recording locally into `Downloads/ReqAI/`
- Uploads the same audio blob to your n8n webhook

## Important limitation
This records the **browser tab audio**. For the other side of the call to be captured, the meeting must be in a browser tab and the user must enable **Share tab audio** in the picker.

Desktop Zoom / Skype apps are not guaranteed to work with this extension.

## Install
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder

## n8n webhook
Default webhook:
`http://localhost:5678/webhook-test/reqai-start`

The extension sends `multipart/form-data` with:
- `audio_file`
- `project_name`
- `client_name`
- `pm_email`

## Notes
- The recording is saved locally first.
- The upload step posts the same blob to n8n.
- If your current workflow expects `audio_url`, update the webhook path in n8n to accept the uploaded binary file, then send it to n8n.
