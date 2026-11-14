# Asset di inferenza locali

Questi file sono serviti dall'app senza CDN. Provenienza e verifiche sono in
[`docs/inference.md`](../../docs/inference.md).

## Modello

- File: `face_landmarker.task`
- Modello: MediaPipe Face Landmarker, float16
- Identificativo: `face_landmarker/float16/1/face_landmarker.task`
- Dimensione: 3 758 596 byte
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- Licenza: Apache-2.0
- Origine:
  `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`

## Runtime WASM

File copiati dal pacchetto npm `@mediapipe/tasks-vision@1.2.3` (Apache-2.0):
`vision_wasm_internal.*` e `vision_wasm_module_internal.*`.

Per verificare il modello:

```powershell
(Get-FileHash face_landmarker.task -Algorithm SHA256).Hash.ToLower()
(Get-Item face_landmarker.task).Length
```
