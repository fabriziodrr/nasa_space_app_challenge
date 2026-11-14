# CrewReady — Visione palpebrale

Prototipo locale di osservazione palpebrale. Il piano di lavoro è in
[docs/CrewReady_Piano_Implementazione_Visione_Palpebrale.md](docs/CrewReady_Piano_Implementazione_Visione_Palpebrale.md).

Il progetto applicativo è in [`vision-prototype/`](vision-prototype/README.md).
Per avviarlo, con Node.js 24.15 o successivo della serie 24 e npm 11:

```powershell
cd vision-prototype
npm.cmd ci
npm.cmd run dev
```

Stato: **T01–T05 implementati**, con acquisizione webcam, replay sintetico,
inferenza, calibrazione, motore e esportazione collegati alla UI. Il contratto
applicativo corrente è C01 v2; N05 registra le prestazioni e prepara report.

Restano il collaudo T06 con webcam e modello reale e le sessioni annotate per
la validazione quantitativa N05. Le prove manuali sono a carico dell'utente.
