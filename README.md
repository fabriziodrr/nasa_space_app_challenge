# nasa_space_app_challenge

Prototipo ISS Mission Dashboard con Next.js, TypeScript e Prisma.

## Modulo agent

- [Descrizione della feature e divisione dei task](AGENT_FEATURE_PLAN.md)
- [Contratti v1 e accordi di integrazione (C0)](docs/agent/contracts-v1.md)
- [Setup, reset e avvio (N1)](docs/agent/setup.md)
- [Avvio, API e integrazione della conversazione testuale (T1)](docs/agent/t1-conversation.md)
- Schemi pubblici e tipi: `server/agent/contracts/index.ts`
- Interfacce dei provider e della persistenza: `server/agent/ports.ts`

C0 definisce contratti ed esempi. T1 implementa conversazione testuale e API di sessione/messaggi, con AI simulata o OpenAI configurabile. N1/N2 implementano persistenza (Prisma), provider simulati, scenari, check-in, validatore e ciclo di approvazione in `server/agent/adapters/` e `server/agent/services/`. Report/diario, voce e demo restano ai task successivi. Login condiviso e backend autorevole del programma restano da confermare con Fabrizio.

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
