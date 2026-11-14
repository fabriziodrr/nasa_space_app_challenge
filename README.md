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

Per T2 vedere [guida report e diario](docs/agent/t2-report-diary.md). La generazione del report non propone ancora variazioni della giornata.

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

Per una prova live con NVIDIA: configurare `.env`, avviare `npm run dev` e, da un secondo terminale, eseguire `npm run test:agent:live`. Per un'altra porta usare `npm run test:agent:live -- --base-url http://127.0.0.1:3101`. Il test usa due messaggi fittizi e la quota del proprio account NVIDIA.
