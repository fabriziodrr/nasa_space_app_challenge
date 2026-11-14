# nasa_space_app_challenge

Prototipo ISS Mission Dashboard con Next.js, TypeScript e Prisma.

## Modulo agent

- [Descrizione della feature e divisione dei task](AGENT_FEATURE_PLAN.md)
- [Contratti v1 e accordi di integrazione (C0)](docs/agent/contracts-v1.md)
- [Setup, reset e avvio (N1)](docs/agent/setup.md)
- [Avvio, API e integrazione della conversazione testuale (T1)](docs/agent/t1-conversation.md)
- Schemi pubblici e tipi: `server/agent/contracts/index.ts`
- Interfacce dei provider e della persistenza: `server/agent/ports.ts`

C0 definisce contratti ed esempi. T1 e T2 implementano conversazione, check-in persistente, report operativo e diario privato; il provider reale configurato per T2 e NVIDIA Nemotron. La conversazione usa Prisma con sensori e programma dimostrativi. N1/N2 includono anche validatore e servizi di approvazione, ancora da collegare al programma autorevole e alla dashboard di Fabrizio. La voce resta a T3.

Per T2 vedere [guida report e diario](docs/agent/t2-report-diary.md). Il runtime demo genera anche proposte validate su una schedule persistente e versionata, applicabili solo dopo approvazione di Terra: [report, schedule e API](docs/agent/report-and-schedule.md).

```sh
npm ci
npm run db:generate
npm run db:push
npm run db:seed
npm run test:agent
npm run typecheck
npm run lint
```

Su PowerShell usare `npm.cmd` se la policy blocca `npm.ps1`.

## Visione palpebrale inclusa

La cartella [`feature-visione-palpebrale/`](feature-visione-palpebrale/README.md) contiene direttamente il prototipo, il modello e gli asset WASM. È inclusa nel normale clone/pull della repo principale: non serve accedere a un'altra repository o inizializzare sottomoduli.

Il prototipo Vite usa dipendenze proprie e richiede Node.js 24.15 o successivo della serie 24 e npm 11. Dalla root, installarle una volta:

```powershell
npm.cmd --prefix feature-visione-palpebrale/vision-prototype ci
```

Avviare `npm.cmd run dev` nella root per l'agent e, in un secondo terminale:

```powershell
npm.cmd --prefix feature-visione-palpebrale/vision-prototype run dev
```

Aprire `http://localhost:3000/voice-demo`; il prototipo palpebrale risponde su `http://127.0.0.1:5173`. Per acquisizione e invio diretto vedere [la guida I5](docs/agent/i5-direct-vision.md). La configurazione TypeScript e le verifiche del prototipo restano separate da quelle Next.js.

Per una prova live con NVIDIA: configurare `.env`, avviare `npm run dev` e, da un secondo terminale, eseguire `npm run test:agent:live`. Per un'altra porta usare `npm run test:agent:live -- --base-url http://127.0.0.1:3101`. Il test usa due messaggi fittizi e la quota del proprio account NVIDIA.
