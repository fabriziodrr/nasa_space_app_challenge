# AEGIS data backend

Base Python/SQLite per osservazioni, metriche e contesto condiviso tra agente e dashboard.

Avvio, importazione, API e contratto per l'agente: [DATA_BACKEND.md](../docs/DATA_BACKEND.md).

Prova sintetica pronta e analisi longitudinale del sonno: [SLEEP_ANALYSIS.md](../docs/SLEEP_ANALYSIS.md).

Strumenti LangChain e integrazione con il compagno: [LANGCHAIN.md](../docs/LANGCHAIN.md).

Il frontend Next.js e l'agent si trovano nella radice della repo e comunicano con questo servizio tramite HTTP. L'archivio SQLite del servizio Python rimane separato dal database Prisma dell'agent. Per l'avvio integrato vedere il [README principale](../README.md).
