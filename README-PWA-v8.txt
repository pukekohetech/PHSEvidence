PHS EVIDENCE CAMERA - SAVE COPY + MACHINE-READABLE ROUTING
===========================================================

Replace these two files in the root of the PHSEvidence GitHub repository:
  - pwa.js
  - service-worker.js

No index.html change is required.

WHAT THIS ADDS
--------------
1. Keeps the existing post-send "Save a copy?" prompt.
2. Adds stable routing data to every direct submission and offline-queued submission.
3. Adds the same routing data as a marked key=value block at the bottom of the email body,
   so a future Power Automate flow can parse it even if the current Google Apps Script gateway
   ignores unknown JSON fields.
4. Freezes the user's routing choices with the photo before sending/queueing.

ROUTING FIELDS
--------------
routingVersion
schoolYear
teacherId
subjectId
projectId
classKey
studentName
studentFolder
subjectLabel
projectLabel
createdAt

EXAMPLE
-------
[PHS_ROUTING]
routingVersion=1
schoolYear=2026
teacherId=ry
subjectId=9ttec
projectId=9ttec_photo_frame
classKey=9TTEC-RY
studentName=Joe Smith
studentFolder=Joe Smith
subjectLabel=Year 9 Technology (9TTEC)
projectLabel=Photo Frame
createdAt=2026-09-24T01:23:45.000Z
[/PHS_ROUTING]

FUTURE SHAREPOINT ROUTE
-----------------------
Power Automate can use:
  schoolYear / classKey / studentFolder

For example:
  Technology Evidence / 2026 / 9TTEC-RY / Joe Smith / <photo.jpg>

The project remains metadata/filename information and does NOT create a project folder.

CACHE
-----
The service-worker cache is now:
  phs-evidence-camera-v8-routing-save-copy

The existing ?v=6 URLs are intentionally retained so this remains a drop-in two-file update
for the current index.html. Replacing service-worker.js changes the worker content and triggers
an update; the new cache then refreshes pwa.js.
