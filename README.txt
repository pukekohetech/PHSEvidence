PHS EVIDENCE CAMERA - GOOGLE DRIVE v10
======================================

This update fixes the Drive backup setup so a folder ID is no longer required.

WHAT CHANGED
------------
1. Google Drive backup remains ON.
2. If DRIVE_FOLDER_ID is blank, Apps Script automatically finds or creates:
      PHS Technology Evidence
   at the top of the My Drive belonging to the Google account running the web app.
3. Evidence is filed automatically as:
      PHS Technology Evidence / YEAR / CLASS / STUDENT / photos
4. Project/task stays in the filename; there is NO project folder.
5. If Drive saving fails, the PWA now reports that separately instead of making the whole operation look successful.
6. Existing selected-teacher email + Teams-channel BCC behaviour is retained.

RECOMMENDED INSTALL
-------------------
A. Apps Script
1. Open the existing PHS Evidence Apps Script project.
2. Replace Code.gs with the Code.gs in this package.
3. Save.
4. In the function selector, choose setupDrive and click Run ONCE.
5. Approve Google Drive permission if Google asks.
6. setupDrive should return/log the root folder name, ID and URL.
7. Deploy > Manage deployments > Edit > New version > Deploy.
   Keep the same existing web-app deployment so the /exec URL remains unchanged.

B. PHSEvidence GitHub repo
Replace:
- pwa.js
- service-worker.js

No index.html changes are required.

DRIVE ROOT OPTIONS
------------------
Default (recommended): leave this blank:
  DRIVE_FOLDER_ID: ''

The script will automatically create/use:
  PHS Technology Evidence

If you want a specific existing folder instead, paste its folder ID into DRIVE_FOLDER_ID.
The Apps Script account must have Editor access to that folder.

VERIFY
------
1. After deployment, open the existing Apps Script /exec URL directly in a browser.
2. Healthy Drive setup should include:
     driveBackupEnabled: true
     driveReady: true
     driveRootMode: "auto-root" (or "folder-id")
     driveRootFolderName: "PHS Technology Evidence"
3. Send one test photo.
4. Check Google Drive for:
     PHS Technology Evidence / <year> / <class> / <student> / <photo>.jpg

IMPORTANT
---------
The automatically created folder belongs to the Google account under which the Apps Script web app executes.
If you use a separate Gmail account for the mail gateway, look in THAT account's My Drive.
