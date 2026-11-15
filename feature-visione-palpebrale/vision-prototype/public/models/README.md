# Local inference assets

These files are served by the app without CDN. Provenance and verifications are in
[`docs/inference.md`](../../docs/inference.md).

## Model

- File: `face_landmarker.task`
- Model: MediaPipe Face Landmarker, float16
- Identifier: `face_landmarker/float16/1/face_landmarker.task`
- Size: 3 758 596 bytes
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- License: Apache-2.0
- Origin:
  `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`

## WASM runtime

Files copied from the npm package `@mediapipe/tasks-vision@1.2.3` (Apache-2.0):
`vision_wasm_internal.*` and `vision_wasm_module_internal.*`.

To verify the model:

```powershell
(Get-FileHash face_landmarker.task -Algorithm SHA256).Hash.ToLower()
(Get-Item face_landmarker.task).Length
```
