# nasa_space_app_challenge

Prototipo ISS Mission Dashboard con Next.js, TypeScript e Prisma.

## Modulo agent

- [Descrizione della feature e divisione dei task](AGENT_FEATURE_PLAN.md)
- [Contratti v1 e accordi di integrazione (C0)](docs/agent/contracts-v1.md)
- [Avvio, API e integrazione della conversazione testuale (T1)](docs/agent/t1-conversation.md)
- Schemi pubblici e tipi: `server/agent/contracts/index.ts`
- Interfacce dei provider e della persistenza: `server/agent/ports.ts`

C0 definisce contratti ed esempi. T1 implementa conversazione testuale e API di sessione/messaggi, con AI simulata o NVIDIA Nemotron tramite l'accesso gratuito per prototipazione del Developer Program, soggetto ai limiti NVIDIA. Per usare il modello reale impostare `AGENT_AI_PROVIDER=nvidia` e `NVIDIA_API_KEY` in `.env`; OpenAI rimane un'alternativa opzionale. La demo locale usa memoria temporanea; N1 colleghera la persistenza e i dati condivisi. Login condiviso e backend autorevole del programma restano da confermare con Fabrizio. Report/diario, proposte/approvazione e voce restano ai rispettivi task successivi.

```sh
npm ci
npm run test:agent
npm run typecheck
npm run lint
```

Su PowerShell usare `npm.cmd` se la policy blocca `npm.ps1`.

Per una prova live con NVIDIA: configurare `.env`, avviare `npm run dev` e, da un secondo terminale, eseguire `npm run test:agent:live`. Per un'altra porta usare `npm run test:agent:live -- --base-url http://127.0.0.1:3101`. Il test usa due messaggi fittizi e la quota del proprio account NVIDIA.
