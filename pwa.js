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

  function cleanFolderName(value) {
    return String(value || '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim()
      .slice(0, 120) || 'Student';
  }

  function getRoutingMeta(meta = {}) {
    const teacherId = String(meta.teacherId || (typeof teacherSelect !== 'undefined' ? teacherSelect?.value : '') || '').trim();
    const subjectId = String(meta.subjectId || (typeof subjectSelect !== 'undefined' ? subjectSelect?.value : '') || '').trim();
    const projectId = String(meta.projectId || (typeof projectSelect !== 'undefined' ? projectSelect?.value : '') || '').trim();
    const createdAt = meta.createdAt || new Date().toISOString();
    const createdDate = new Date(createdAt);
    const schoolYear = Number.isFinite(createdDate.getTime()) ? createdDate.getFullYear() : new Date().getFullYear();

    const subjectLabel = subjectId === '__custom'
      ? String((typeof customProjectInput !== 'undefined' ? customProjectInput?.value : '') || 'Custom subject').trim()
      : String((typeof selections !== 'undefined' ? selections?.subjects?.find?.((s) => s.id === subjectId)?.label : '') || subjectId).trim();

    const projectLabel = projectId === '__custom'
      ? String((typeof customProjectInput !== 'undefined' ? customProjectInput?.value : '') || 'Other project').trim()
      : String((typeof selections !== 'undefined' ? selections?.projects?.find?.((p) => p.id === projectId)?.label : '') || projectId).trim();

    const studentName = String(meta.student || (typeof nameInput !== 'undefined' ? nameInput?.value : '') || 'Student').trim();
    const classKey = [subjectId, teacherId]
      .filter(Boolean)
      .map((part) => part.replace(/^__|__$/g, ''))
      .join('-')
      .toUpperCase();

    return {
      routingVersion: 1,
      schoolYear,
      teacherId,
      subjectId,
      projectId,
      classKey,
      studentName,
      studentFolder: cleanFolderName(studentName),
      subjectLabel,
      projectLabel,
      createdAt
    };
  }

  function routingTextBlock(meta = {}) {
    const route = getRoutingMeta(meta);
    return [
      '[PHS_ROUTING]',
      `routingVersion=${route.routingVersion}`,
      `schoolYear=${route.schoolYear}`,
      `teacherId=${route.teacherId}`,
      `subjectId=${route.subjectId}`,
      `projectId=${route.projectId}`,
      `classKey=${route.classKey}`,
      `studentName=${route.studentName}`,
      `studentFolder=${route.studentFolder}`,
      `subjectLabel=${route.subjectLabel}`,
      `projectLabel=${route.projectLabel}`,
      `createdAt=${route.createdAt}`,
      '[/PHS_ROUTING]'
    ].join('\n');
  }

  function snapshotRoutingToLastMeta() {
    if (!lastMeta) return null;
    const route = getRoutingMeta(lastMeta);
    lastMeta.teacherId = route.teacherId;
    lastMeta.subjectId = route.subjectId;
    lastMeta.projectId = route.projectId;
    lastMeta.schoolYear = route.schoolYear;
    lastMeta.classKey = route.classKey;
    lastMeta.studentFolder = route.studentFolder;
    lastMeta.subjectLabel = route.subjectLabel;
    lastMeta.projectLabel = route.projectLabel;
    return route;
  }

  // Keep the existing human-readable email body, then append a predictable
  // key=value block that Power Automate can parse without interpreting prose.
  try {
    const originalGetEmailBody = getEmailBody;
    getEmailBody = function phsRoutingEmailBody() {
      const body = originalGetEmailBody();
      return `${body}\n\n${routingTextBlock(lastMeta || {})}`;
    };
  } catch (err) {
    console.warn('Could not add routing metadata to the email body', err);
  }

  async function sendViaConfiguredGatewayWithRouting() {
    const endpoint = getConfiguredMailEndpoint();
    if (!endpoint) return false;

    const routing = snapshotRoutingToLastMeta() || getRoutingMeta(lastMeta || {});
    const recipients = getEmailRecipients();
    const submissionId = makeSubmissionId();
    const emailBlob = await makeEmailAttachment(lastBlob);
    const dataUrl = await blobToDataUrl(emailBlob);
    const base64 = String(dataUrl).split(',')[1] || '';
    const jpgName = (lastMeta?.filename || 'PHS_Evidence.png').replace(/\.[^.]+$/, '.jpg');

    const payload = {
      appVersion: APP_CONFIG.appVersion || '',
      submissionId,
      filename: jpgName,
      mimeType: 'image/jpeg',
      base64,
      requestedRecipients: recipients,
      subject: getEmailSubject(),
      body: getEmailBody(),
      student: lastMeta?.student || routing.studentName,
      teacher: lastMeta?.teacher || 'Teacher',
      teacherId: routing.teacherId,
      teacherEmail: lastMeta?.teacherEmail || '',
      subjectId: routing.subjectId,
      projectId: routing.projectId,
      schoolYear: routing.schoolYear,
      classKey: routing.classKey,
      studentFolder: routing.studentFolder,
      subjectLabel: routing.subjectLabel,
      projectLabel: routing.projectLabel,
      routing,
      context: lastMeta?.context || 'Learning evidence',
      createdAt: routing.createdAt
    };

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
      cache: 'no-store'
    };

    if (EMAIL_CONFIG.provider === 'apps-script') options.mode = 'no-cors';

    const response = await fetch(endpoint, options);
    if (options.mode !== 'no-cors' && !response.ok) {
      throw new Error(`Mail gateway returned ${response.status}`);
    }

    if (EMAIL_CONFIG.provider === 'apps-script') {
      const status = await waitForMailGatewayStatus(endpoint, submissionId);
      return {
        submitted: true,
        confirmed: status.confirmed,
        gatewayStatus: status.result || null
      };
    }

    return { submitted: true, confirmed: true, gatewayStatus: null };
  }

  // Extend the existing sender without changing the student-facing app.
  try {
    sendViaConfiguredGateway = sendViaConfiguredGatewayWithRouting;
  } catch (err) {
    console.warn('Could not enable structured routing payload', err);
  }

  function makeQueuedPayload(meta, base64, mimeType, filename, submissionId) {
    const teacherEmail = String(meta?.teacherEmail || '').trim();
    const student = meta?.student || 'Student';
    const teacher = meta?.teacher || 'Teacher';
    const context = meta?.context || 'Learning evidence';
    const routing = getRoutingMeta(meta);
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
        'Stamped evidence photo attached.',
        '',
        routingTextBlock(meta)
      ].join('\n'),
      student,
      teacher,
      teacherId: routing.teacherId,
      teacherEmail,
      subjectId: routing.subjectId,
      projectId: routing.projectId,
      schoolYear: routing.schoolYear,
      classKey: routing.classKey,
      studentFolder: routing.studentFolder,
      subjectLabel: routing.subjectLabel,
      projectLabel: routing.projectLabel,
      routing,
      context,
      createdAt: routing.createdAt
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

  let saveCopyPromptEl = null;

  function ensureSaveCopyPrompt() {
    if (saveCopyPromptEl) return saveCopyPromptEl;

    if (!document.getElementById('phsSaveCopyStyles')) {
      const style = document.createElement('style');
      style.id = 'phsSaveCopyStyles';
      style.textContent = `
        .phs-save-copy-backdrop {
          position: fixed;
          inset: 0;
          z-index: 10050;
          display: grid;
          place-items: center;
          padding: max(18px, env(safe-area-inset-top)) 18px max(18px, env(safe-area-inset-bottom));
          background: rgba(0,0,0,.52);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .phs-save-copy-backdrop[hidden] { display: none !important; }
        .phs-save-copy-card {
          width: min(92vw, 360px);
          padding: 22px;
          border: 1px solid rgba(255,255,255,.16);
          border-radius: 22px;
          background: rgba(20,20,22,.96);
          color: #fff;
          box-shadow: 0 22px 70px rgba(0,0,0,.42);
          text-align: center;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        }
        .phs-save-copy-check {
          width: 54px;
          height: 54px;
          margin: 0 auto 12px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #16803a;
          font-size: 30px;
          font-weight: 800;
          line-height: 1;
        }
        .phs-save-copy-card h2 { margin: 0; font-size: 1.35rem; }
        .phs-save-copy-card p { margin: 8px 0 18px; color: rgba(255,255,255,.78); line-height: 1.35; }
        .phs-save-copy-actions { display: grid; gap: 10px; }
        .phs-save-copy-actions button {
          min-height: 50px;
          border: 0;
          border-radius: 15px;
          padding: 0 18px;
          font: inherit;
          font-weight: 750;
          cursor: pointer;
        }
        .phs-save-copy-save { background: #fff; color: #111; }
        .phs-save-copy-skip { background: rgba(255,255,255,.10); color: #fff; }
        .phs-save-copy-actions button:disabled { opacity: .58; cursor: default; }
      `;
      document.head.appendChild(style);
    }

    const backdrop = document.createElement('div');
    backdrop.id = 'phsSaveCopyPrompt';
    backdrop.className = 'phs-save-copy-backdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('role', 'presentation');
    backdrop.innerHTML = `
      <section class="phs-save-copy-card" role="dialog" aria-modal="true" aria-labelledby="phsSaveCopyTitle">
        <div class="phs-save-copy-check" aria-hidden="true">✓</div>
        <h2 id="phsSaveCopyTitle">Evidence sent</h2>
        <p>Save a copy of this stamped photo to this device?</p>
        <div class="phs-save-copy-actions">
          <button class="phs-save-copy-save" type="button">Save copy</button>
          <button class="phs-save-copy-skip" type="button">No thanks</button>
        </div>
      </section>`;
    document.body.appendChild(backdrop);

    const saveBtn = backdrop.querySelector('.phs-save-copy-save');
    const skipBtn = backdrop.querySelector('.phs-save-copy-skip');

    saveBtn?.addEventListener('click', async () => {
      if (!lastBlob || !lastMeta) {
        backdrop.hidden = true;
        returnToLiveCamera();
        return;
      }

      const original = saveBtn.textContent;
      saveBtn.disabled = true;
      skipBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      try {
        // File System Access gives Windows/Chromebook users a real Save As dialogue.
        if ('showSaveFilePicker' in window && window.isSecureContext) {
          const ext = (lastMeta.filename || '').toLowerCase().endsWith('.png') ? 'png' : 'jpg';
          const mime = lastBlob.type || (ext === 'png' ? 'image/png' : 'image/jpeg');
          const handle = await window.showSaveFilePicker({
            suggestedName: lastMeta.filename || `PHS_Evidence.${ext}`,
            types: [{ description: 'Evidence photo', accept: { [mime]: [`.${ext}`] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(lastBlob);
          await writable.close();
        } else {
          // Reliable fallback for Android, iOS, Safari and browsers without File System Access.
          downloadStamped();
        }
        if (typeof showToast === 'function') showToast('Copy saved to this device.');
        backdrop.hidden = true;
        setTimeout(returnToLiveCamera, 250);
      } catch (err) {
        if (err?.name === 'AbortError') {
          saveBtn.textContent = original;
          saveBtn.disabled = false;
          skipBtn.disabled = false;
          return;
        }
        console.warn('Save copy failed; trying browser download fallback.', err);
        try {
          downloadStamped();
          if (typeof showToast === 'function') showToast('Copy downloaded to this device.');
          backdrop.hidden = true;
          setTimeout(returnToLiveCamera, 250);
        } catch (fallbackErr) {
          console.error('Could not save local copy', fallbackErr);
          if (typeof showToast === 'function') showToast('Could not save a local copy on this device.', false, 4200);
          saveBtn.textContent = original;
          saveBtn.disabled = false;
          skipBtn.disabled = false;
        }
      }
    });

    skipBtn?.addEventListener('click', () => {
      backdrop.hidden = true;
      returnToLiveCamera();
    });

    saveCopyPromptEl = backdrop;
    return backdrop;
  }

  function showSaveCopyPrompt() {
    if (!lastBlob || !lastMeta) {
      returnToLiveCamera();
      return;
    }
    try { hideSendCurtain(); } catch (_) {}
    const prompt = ensureSaveCopyPrompt();
    const saveBtn = prompt.querySelector('.phs-save-copy-save');
    const skipBtn = prompt.querySelector('.phs-save-copy-skip');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save copy';
    }
    if (skipBtn) skipBtn.disabled = false;
    prompt.hidden = false;
    setTimeout(() => saveBtn?.focus(), 30);
  }

  // Replace the direct-send UI handler with one that can safely queue evidence offline.
  async function pwaEmailStamped(options = {}) {
    const automatic = options.automatic === true;
    if (!lastBlob) return showToast('Nothing to send.', false);

    // Freeze the user's routing choices with this photo before sending or queueing.
    snapshotRoutingToLastMeta();

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
          const gateway = sendResult.gatewayStatus || {};
          const driveFailed = gateway.driveExpected === true && gateway.driveSaved === false;
          if (driveFailed) {
            if (emailStatusEl) emailStatusEl.textContent = `✓ Evidence sent. Google Drive backup failed${gateway.driveError ? `: ${gateway.driveError}` : '.'}`;
            showSendCurtain('success', 'Evidence sent', 'Google Drive copy needs attention');
            if (typeof showToast === 'function') showToast('Evidence sent, but the Google Drive copy failed.', false, 5200);
            setTimeout(showSaveCopyPrompt, 900);
          } else {
            if (emailStatusEl) emailStatusEl.textContent = gateway.driveSaved === true
              ? `✓ Evidence sent and saved to Drive${gateway.drivePath ? ` • ${gateway.drivePath}` : ''}`
              : '✓ Evidence sent and confirmed.';
            showSendCurtain('success', 'Evidence sent', gateway.driveSaved === true ? 'Saved to Google Drive' : 'Backed up successfully');
            setTimeout(showSaveCopyPrompt, 420);
          }
        } else {
          if (emailStatusEl) emailStatusEl.textContent = 'Evidence submitted.';
          showSendCurtain('success', 'Evidence submitted', 'Returning to camera');
          setTimeout(showSaveCopyPrompt, 520);
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
      const registration = await navigator.serviceWorker.register('./service-worker.js?v=6', { scope: './' });
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
