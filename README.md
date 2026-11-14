# nasa_space_app_challenge

Prototipo ISS Mission Dashboard con Next.js, TypeScript e Prisma.

## Modulo agent

- [Descrizione della feature e divisione dei task](AGENT_FEATURE_PLAN.md)
- [Contratti v1 e accordi di integrazione (C0)](docs/agent/contracts-v1.md)
- [Setup, reset e avvio (N1)](docs/agent/setup.md)
- Schemi pubblici e tipi: `server/agent/contracts/index.ts`
- Interfacce dei provider e della persistenza: `server/agent/ports.ts`

C0 definisce contratti ed esempi; T1 e N1 possono partire in parallelo. N1 (persistenza, provider simulati, scenari) e N2 (check-in, validatore, ciclo di approvazione) sono implementati in `server/agent/adapters/` e `server/agent/services/`. Login condiviso e backend autorevole del programma restano da confermare con Fabrizio.

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
