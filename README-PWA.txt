PHS EVIDENCE CAMERA - PWA PACKAGE
=================================

This folder is the installable Progressive Web App version of the PHS Evidence Camera.

WHAT IS INCLUDED
- index.html              Main camera app
- manifest.webmanifest    App name, colours and icons
- sw.js                   Service worker / offline app shell
- pwa.js                  PWA install support + offline evidence outbox
- icon-192.png / icon-512.png
- icon-maskable-192.png / icon-maskable-512.png
- apple-touch-icon.png
- favicon-32.png

IMPORTANT
A PWA must be served over HTTPS (or localhost for development). Double-clicking index.html will still show the page, but installation, service worker caching and normal live-camera permissions require HTTPS.

GITHUB PAGES
Upload all files in this folder together to the same site folder/repository. The existing Google Apps Script mail gateway is already built into index.html.

INSTALLING
Android / Chrome / Edge / Chromebook:
- Open the HTTPS site.
- Open the three-line Settings menu.
- Use "Install this app" when offered by the browser.

Windows / Edge or Chrome:
- Open the HTTPS site.
- Install from the browser install icon or the Settings menu.

Apple iPhone / iPad:
- Open the HTTPS site in Safari.
- Share -> Add to Home Screen.

OFFLINE BEHAVIOUR
- The app shell opens after it has been loaded once online.
- If a stamped photo cannot reach the mail gateway, the PWA stores a prepared evidence message in IndexedDB on that device.
- When internet access returns, queued evidence is retried automatically.
- Do not clear browser/site data while evidence is waiting to send.

MAIL
The Gmail / Apps Script secret is NOT stored in this PWA. The app only contains the deployed gateway URL. Recipient selection remains controlled by the server-side Apps Script.
