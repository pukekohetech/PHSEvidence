PHS Evidence Camera PWA v2 - Compact Camera Layout

WHAT CHANGED
- Student name moved into Settings.
- Main camera view now contains only the camera/photo and camera controls.
- The active app screen is locked to the device viewport: no page scrolling is required.
- Camera frame is fitted to both available width and height, so it remains visible on short phones, tablets, Chromebooks, desktops and landscape devices.
- Settings is the only panel allowed to scroll on very small screens.
- Existing direct Gmail/Apps Script backup and offline outbox behaviour are retained.

DEPLOYMENT
Upload all files in this folder together over HTTPS (for example GitHub Pages). Do not upload only index.html: installability and offline support require the manifest, service worker, PWA script and icons.

FIRST USE
1. Open the app.
2. Tap Activate camera.
3. Settings opens on a new device. Enter Student name, choose Teacher, Subject and Project/task, then tap Done.
4. Take the photo. It is stamped and backed up automatically.
5. For a different student, use the menu at top-right and change Student name.

Existing-photo upload follows the same stamped preview but requires pressing Send File.


PWA INSTALLATION
----------------
The app now has its own Install app button on the opening screen and in Settings.

Important: installation cannot work from a file opened by double-clicking index.html.
The files must be hosted on HTTPS (for example GitHub Pages).

Chrome / Edge / Android / Chromebook:
- Open the hosted HTTPS app.
- Tap Install app.
- If the browser has confirmed the PWA is installable, its native install dialog opens.

iPhone / iPad:
- Open the hosted app in Safari.
- Tap Add to Home Screen in the app, then follow Share > Add to Home Screen.

Once installed, the Install app buttons are hidden automatically.
