PHS EVIDENCE CAMERA - FULL GOOGLE DRIVE UPDATE v9
=================================================

This package combines the current Save-a-Copy + machine-routing PWA update with the complete
Google Apps Script gateway needed to file evidence automatically in Google Drive.

FILES IN THIS PACKAGE
---------------------
1. pwa.js
   - Save-a-copy prompt after successful send.
   - Machine-readable routing fields.
   - Routing preserved for offline queued photos.

2. service-worker.js
   - Isolated PHSEvidence cache.
   - v8 routing/save-copy cache version.

3. Code.gs
   - Complete replacement Google Apps Script gateway.
   - Sends to selected teacher.
   - BCCs PHS Technology Evidence Teams channel.
   - Saves to Google Drive using Year > Class > Student.
   - Project/task appears in filename, NOT as a folder.

4. README-PWA-v8.txt
   - Notes from the routing/save-copy PWA update.

GOOGLE DRIVE STRUCTURE
----------------------
The Apps Script creates folders automatically:

PHS Technology Evidence
  / 2026
    / 9TTEC-RY
      / Joe Smith
        / PHS_Joe_Smith_Photo_Frame_2026-09-24_111705.jpg
        / PHS_Joe_Smith_Folding_Stool_2026-10-02_094422.jpg

There is deliberately no project folder.

ONE VALUE YOU MUST SET
----------------------
In Code.gs, find:

    DRIVE_FOLDER_ID: '',

Create or choose the top-level Google Drive folder you want to use, for example:

    PHS Technology Evidence

Open that folder in Google Drive. If its URL is:

    https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp

set:

    DRIVE_FOLDER_ID: '1AbCdEfGhIjKlMnOp',

The Google account that owns/runs the Apps Script must have Editor access to that folder.

DEPLOY - GOOGLE APPS SCRIPT
---------------------------
1. Open the existing PHS Evidence Apps Script project.
2. Replace the entire current Code.gs with the supplied Code.gs.
3. Paste in DRIVE_FOLDER_ID.
4. Save.
5. Google may request Drive permission the first time this version runs. Approve the Drive access.
6. Deploy > Manage deployments.
7. Edit the existing web-app deployment.
8. Choose New version.
9. Deploy.

Updating the existing deployment should keep the same /exec URL.

DEPLOY - PHSEVIDENCE GITHUB APP
-------------------------------
If you have already installed the v8 Save Copy + Routing files, you do NOT need to upload them again.

If not, replace these two files in the root of the PHSEvidence GitHub repository:

    pwa.js
    service-worker.js

No index.html change is required.

CURRENT EMAIL BEHAVIOUR
-----------------------
SEND_MODE remains:

    selected_teacher

So the teacher chosen by the user still receives the image.

A BCC copy is also sent to the Technology Evidence Teams channel:

    b656a75a.pukekohehigh.school.nz@apac.teams.ms

GOOGLE DRIVE ROUTING
--------------------
The PHSEvidence app supplies values such as:

    schoolYear=2026
    teacherId=ry
    subjectId=9ttec
    projectId=9ttec_photo_frame
    classKey=9TTEC-RY
    studentFolder=Joe Smith
    projectLabel=Photo Frame

The Apps Script uses:

    schoolYear / classKey / studentFolder

to create the Drive path.

Project/task is used in the filename instead of creating another folder.

FIRST TEST
----------
Take one test photo using a test student name and real teacher/subject/project selections.

Confirm:
1. Selected teacher receives the evidence.
2. Technology Evidence Teams channel receives the BCC copy.
3. Google Drive automatically creates:
      Year > Class > Student
4. The image appears in the student folder.
5. The project name is in the filename.
6. No project folder is created.

FAIL-SAFE BEHAVIOUR
-------------------
Email delivery and Drive filing are deliberately separated.
If Drive filing fails, the email can still be delivered.
The gateway status reports driveSaved=false and a short driveError message for troubleshooting.
