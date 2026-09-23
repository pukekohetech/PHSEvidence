/* PHS Evidence Camera - PWA layer
 * Adds installability, offline app shell, and a local outbox for evidence
 * that could not reach the mail gateway immediately.
 */
(() => {
  const DB_NAME = 'phs-evidence-camera';
  const DB_VERSION = 1;
  const STORE = 'outbox';
  let flushing = false;

  const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('Offline storage is not supported on this browser.'));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open offline evidence storage.'));
    });
  }

  async function idbRequest(mode, action) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let req;
        try { req = action(store); } catch (err) { reject(err); return; }
        tx.oncomplete = () => resolve(req?.result);
        tx.onerror = () => reject(tx.error || req?.error || new Error('Offline storage failed.'));
        tx.onabort = () => reject(tx.error || new Error('Offline storage was interrupted.'));
      });
    } finally {
      db.close();
    }
  }

  const putRecord = (record) => idbRequest('readwrite', (store) => store.put(record));
  const deleteRecord = (id) => idbRequest('readwrite', (store) => store.delete(id));
  const getAllRecords = () => idbRequest('readonly', (store) => store.getAll()).then((x) => x || []);
  const countRecords = () => idbRequest('readonly', (store) => store.count()).then((x) => Number(x || 0));

  async function updateBackupStatus() {
    const target = document.getElementById('backupStatusText') || document.querySelector('.settings-status span:last-child');
    if (!target) return;
    let pending = 0;
    try { pending = await countRecords(); } catch (_) {}
    if (!navigator.onLine) {
      target.textContent = pending
        ? `Offline • ${pending} photo${pending === 1 ? '' : 's'} waiting to back up`
        : 'Offline • new photos will be held safely on this device';
      return;
    }
    target.textContent = pending
      ? `Connected • ${pending} photo${pending === 1 ? '' : 's'} waiting to back up`
      : 'Direct evidence backup connected';
  }

  function makeQueuedPayload(meta, base64, mimeType, filename, submissionId) {
    const teacherEmail = String(meta?.teacherEmail || '').trim();
    const student = meta?.student || 'Student';
    const teacher = meta?.teacher || 'Teacher';
    const context = meta?.context || 'Learning evidence';
    return {
      appVersion: APP_CONFIG.appVersion || '',
      submissionId,
      filename,
      mimeType,
      base64,
      requestedRecipients: teacherEmail ? [teacherEmail] : [],
      subject: `PHS Evidence - ${student}`,
      body: [
        `Student: ${student}`,
        `Teacher: ${teacher}`,
        `Context: ${context}`,
        '',
        'Stamped evidence photo attached.'
      ].join('\n'),
      student,
      teacher,
      teacherId: meta?.teacherId || '',
      teacherEmail,
      context,
      createdAt: meta?.createdAt || new Date().toISOString()
    };
  }

  async function queueCurrentEvidence() {
    if (!lastBlob || !lastMeta) throw new Error('There is no evidence image to queue.');
    const emailBlob = await makeEmailAttachment(lastBlob);
    const dataUrl = await blobToDataUrl(emailBlob);
    const base64 = String(dataUrl).split(',')[1] || '';
    const submissionId = makeSubmissionId();
    const filename = (lastMeta.filename || 'PHS_Evidence.png').replace(/\.[^.]+$/, '.jpg');
    const payload = makeQueuedPayload(lastMeta, base64, 'image/jpeg', filename, submissionId);
    await putRecord({ id: submissionId, createdAt: Date.now(), payload });
    await updateBackupStatus();
    return submissionId;
  }

  async function sendQueuedRecord(record) {
    const endpoint = getConfiguredMailEndpoint();
    if (!endpoint) throw new Error('Mail gateway is not configured.');

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(record.payload),
      cache: 'no-store'
    };
    if (EMAIL_CONFIG.provider === 'apps-script') options.mode = 'no-cors';

    const response = await fetch(endpoint, options);
    if (options.mode !== 'no-cors' && !response.ok) {
      throw new Error(`Mail gateway returned ${response.status}`);
    }

    if (EMAIL_CONFIG.provider === 'apps-script') {
      const status = await waitForMailGatewayStatus(endpoint, record.id);
      if (status?.confirmed === false) {
        // The POST completed but status polling could not confirm it. Treat it as submitted
        // to avoid duplicate evidence emails on the next reconnect.
        return true;
      }
    }
    return true;
  }

  async function flushOutbox({ announce = true } = {}) {
    if (flushing || !navigator.onLine) return;
    flushing = true;
    let sent = 0;
    try {
      const records = await getAllRecords();
      for (const record of records) {
        try {
          await sendQueuedRecord(record);
          await deleteRecord(record.id);
          sent += 1;
        } catch (err) {
          console.warn('Queued evidence still waiting', err);
          break;
        }
      }
    } finally {
      flushing = false;
      await updateBackupStatus();
      if (announce && sent > 0 && typeof showToast === 'function') {
        showToast(`${sent} queued photo${sent === 1 ? '' : 's'} backed up.`);
      }
    }
  }

  // Replace the direct-send UI handler with one that can safely queue evidence offline.
  async function pwaEmailStamped(options = {}) {
    const automatic = options.automatic === true;
    if (!lastBlob) return showToast('Nothing to send.', false);

    const endpoint = getConfiguredMailEndpoint();
    if (!endpoint) {
      if (emailStatusEl) emailStatusEl.textContent = 'Direct evidence backup is unavailable.';
      showSendCurtain('error', 'Backup unavailable', 'Ask a teacher to check this device');
      return;
    }

    const sendKey = lastObjectUrl || `${lastMeta?.createdAt || ''}:${lastMeta?.filename || ''}`;
    if (automatic && sendKey && sendKey === lastDirectSendKey) return;

    if (!navigator.onLine) {
      try {
        await queueCurrentEvidence();
        lastDirectSendKey = sendKey;
        showSendCurtain('success', 'Saved safely', 'Will back up automatically when internet returns');
        setTimeout(returnToLiveCamera, 950);
      } catch (err) {
        console.error('Could not save evidence offline', err);
        showSendCurtain('error', 'Could not save', 'Keep this photo open and try again');
      }
      return;
    }

    const originalText = emailBtn?.textContent || 'Send';
    if (emailBtn) {
      emailBtn.disabled = true;
      emailBtn.textContent = automatic ? 'Backing up...' : 'Sending...';
    }
    if (emailStatusEl) emailStatusEl.textContent = 'Backing up the stamped photo directly to the teacher...';

    try {
      const sendResult = await sendViaConfiguredGateway();
      if (sendResult?.submitted) {
        lastDirectSendKey = sendKey;
        if (sendResult.confirmed) {
          if (emailStatusEl) emailStatusEl.textContent = '✓ Evidence sent and confirmed.';
          showSendCurtain('success', 'Evidence sent', 'Backed up successfully');
          setTimeout(returnToLiveCamera, 700);
        } else {
          if (emailStatusEl) emailStatusEl.textContent = 'Evidence submitted.';
          showSendCurtain('success', 'Evidence submitted', 'Returning to camera');
          setTimeout(returnToLiveCamera, 900);
        }
      }
    } catch (err) {
      console.warn('Direct send failed; moving evidence to local outbox.', err);
      try {
        await queueCurrentEvidence();
        lastDirectSendKey = sendKey;
        if (emailStatusEl) emailStatusEl.textContent = 'Send interrupted; evidence saved locally for automatic retry.';
        showSendCurtain('success', 'Saved for retry', 'Will back up automatically when connection is available');
        setTimeout(returnToLiveCamera, 1100);
      } catch (queueErr) {
        console.error('Could not queue evidence after send failure', queueErr);
        if (emailStatusEl) emailStatusEl.textContent = 'Send failed. Keep the photo on screen and try again.';
        showSendCurtain('error', 'Send failed', 'The photo is still on this screen');
      }
    } finally {
      if (emailBtn) {
        emailBtn.textContent = originalText;
        emailBtn.disabled = !lastBlob;
      }
      updateBackupStatus();
    }
  }

  // emailStamped is declared by the main app as a mutable global function binding.
  try { emailStamped = pwaEmailStamped; } catch (err) { console.warn('Could not enable PWA outbox layer', err); }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js?v=4', { scope: './' });
      registration.update().catch(() => {});
    } catch (err) {
      console.warn('Service worker registration failed', err);
    }
  }

  const iosDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safariDesktop = () => /^((?!chrome|android).)*safari/i.test(navigator.userAgent) && !iosDevice();

  function installButtons() {
    return [document.getElementById('startInstallBtn'), document.getElementById('installBtn')].filter(Boolean);
  }

  function showInstallGuide(title, message) {
    const backdrop = document.getElementById('installGuideBackdrop');
    const titleEl = document.getElementById('installGuideTitle');
    const textEl = document.getElementById('installGuideText');
    if (!backdrop) {
      if (typeof showToast === 'function') showToast(message, true, 5200);
      return;
    }
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = message;
    backdrop.hidden = false;
    backdrop.setAttribute('aria-hidden', 'false');
  }

  function hideInstallGuide() {
    const backdrop = document.getElementById('installGuideBackdrop');
    if (!backdrop) return;
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
  }

  function updatePwaInstallUi() {
    const installed = isStandalone();
    const promptReady = !!window.__phsDeferredPrompt;
    document.documentElement.classList.toggle('pwa-standalone', installed);
    for (const btn of installButtons()) {
      if (installed) {
        btn.hidden = true;
        btn.style.display = 'none';
        continue;
      }
      btn.hidden = false;
      btn.style.display = '';
      if (iosDevice()) btn.textContent = 'Add to Home Screen';
      else if (safariDesktop()) btn.textContent = 'Add to Dock';
      else btn.textContent = promptReady ? 'Install app' : 'Install app';
      btn.dataset.installReady = promptReady ? '1' : '0';
    }
  }

  async function requestPwaInstall() {
    if (isStandalone()) {
      if (typeof showToast === 'function') showToast('Evidence Camera is already installed.');
      return;
    }

    const promptEvent = window.__phsDeferredPrompt;
    if (promptEvent) {
      try {
        const result = await promptEvent.prompt();
        window.__phsDeferredPrompt = null;
        try { deferredPrompt = null; } catch (_) {}
        updatePwaInstallUi();
        if (result?.outcome === 'dismissed' && typeof showToast === 'function') {
          showToast('Installation cancelled.', true, 2600);
        }
      } catch (err) {
        console.warn('Install prompt failed', err);
        showInstallGuide('Install Evidence Camera', 'Use your browser menu and choose Install app or Add to Home Screen.');
      }
      return;
    }

    if (location.protocol === 'file:') {
      showInstallGuide('Open the hosted app first', 'A PWA cannot be installed from a downloaded HTML file. Open the HTTPS GitHub Pages version, then tap Install app.');
      return;
    }

    if (iosDevice()) {
      showInstallGuide('Add to Home Screen', 'In Safari, tap the Share button, choose Add to Home Screen, then tap Add.');
      return;
    }

    if (safariDesktop()) {
      showInstallGuide('Add to Dock', 'In Safari on Mac, use File → Add to Dock to install Evidence Camera.');
      return;
    }

    showInstallGuide('Install from your browser', 'Chrome or Edge has not exposed its install prompt yet. Refresh this page once after the new PWA files finish deploying. If it still does not appear, use the browser menu and choose Install page as app / Apps > Install this site as an app.');
  }

  function configureInstallHints() {
    updatePwaInstallUi();
    document.getElementById('installGuideCloseBtn')?.addEventListener('click', hideInstallGuide);
    document.getElementById('installGuideBackdrop')?.addEventListener('click', (event) => {
      if (event.target?.id === 'installGuideBackdrop') hideInstallGuide();
    });
  }

  window.requestPwaInstall = requestPwaInstall;
  window.updatePwaInstallUi = updatePwaInstallUi;
  window.addEventListener('phspwa-install-ready', updatePwaInstallUi);
  window.addEventListener('phs-install-ready', updatePwaInstallUi);

  window.addEventListener('online', () => {
    updateBackupStatus();
    flushOutbox({ announce: true });
  });
  window.addEventListener('offline', () => {
    updateBackupStatus();
    if (typeof showToast === 'function') showToast('Offline mode: new photos will be saved for later backup.', true, 3600);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) flushOutbox({ announce: false });
  });

  window.addEventListener('load', () => {
    registerServiceWorker();
    configureInstallHints();
    updateBackupStatus();
    if (navigator.onLine) setTimeout(() => flushOutbox({ announce: true }), 1000);
  });
})();
