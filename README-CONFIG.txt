PHSEvidence configuration

Normal maintenance:
- teaching-data.json: teachers, classes and projects
- app-settings.json: branding, PhotoRerouter, image options, feature switches, routing patterns and labels

School year:
- automatic from the device date; do not add a year field

After editing JSON:
1. Keep valid JSON syntax.
2. Upload/commit the changed JSON file.
3. Reload the app or use Settings > Reload configuration.
4. Check the Configuration status shows Current.

Do not edit index.html for ordinary teacher/class/project changes.

Useful notes:
- Keep teacher and class codes unique. The app generates the internal IDs automatically.
- Each teacher's classes list controls exactly which Class/Subject options students see after choosing that teacher; the order in the teacher entry is preserved.
- configVersion is shown in Settings and is useful for confirming that a device has picked up an update.
- The installed PWA name and icons are still controlled by manifest.webmanifest; normal teaching-data changes do not require editing it.
- On the first deployment of this refactor, upload all files in the release package. After that, most routine updates only require teaching-data.json or app-settings.json.
- Keep the previous working release available for rollback until a real device has completed one online send and one offline retry successfully.

Image/storage defaults in this release:
- maximum stored image dimension: 1920 px on the longest edge
- JPEG quality: 0.78
- portrait and landscape are both handled automatically
- the stamped JPEG is reused for preview, upload, Drive and Save Copy instead of being converted twice

Background-send release notes:
- every stamped photo is first written to the local IndexedDB outbox, even when online
- the student-facing screen no longer waits for Gmail + Google Drive to finish
- queued evidence sends in the background and remains available for retry if the network is interrupted
- the live camera preview now preserves the camera aspect ratio; phone rotation no longer stretches landscape into portrait
- the current PhotoRerouter companion build is 2026-09-28-background-v14 and narrows the Apps Script lock to Drive folder-path creation only
