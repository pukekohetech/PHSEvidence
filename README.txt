PHS Evidence Camera - Save a Copy Update

WHAT THIS UPDATE DOES
- After an evidence photo is successfully sent/backed up, the photo stays on screen.
- A compact popup appears: "Evidence sent - Save a copy of this stamped photo to this device?"
- Save copy:
  * Windows / supported Chromium browsers: opens a Save As dialog.
  * Other browsers/devices: uses the browser's normal download/save behaviour.
- No thanks: returns directly to the live camera.
- Works for both newly captured photos and uploaded files.
- The prompt appears only after an immediate successful/submitted send. Offline-queued photos do not show a false "sent" save prompt.
- Existing mail gateway, offline outbox, install behaviour and camera workflow remain unchanged.

DEPLOYMENT
Replace ONLY these two files in the root of the PHSEvidence GitHub repository:
  pwa.js
  service-worker.js

The service-worker cache version has been bumped to phs-evidence-camera-v7-save-copy so installed devices can pick up the new PWA layer.

After GitHub Pages deploys, reopen the app. If an already-installed copy does not refresh immediately, fully close and reopen the PWA once.
