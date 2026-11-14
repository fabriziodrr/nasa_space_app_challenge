# AEGIS data backend

Base Python/SQLite per osservazioni, metriche e contesto condiviso tra agente e dashboard.

Avvio, importazione, API e contratto per l'agente: [DATA_BACKEND.md](../docs/DATA_BACKEND.md).

Prova sintetica pronta e analisi longitudinale del sonno: [SLEEP_ANALYSIS.md](../docs/SLEEP_ANALYSIS.md).

Strumenti LangChain e integrazione con il compagno: [LANGCHAIN.md](../docs/LANGCHAIN.md).

Il frontend Next.js rimane nella radice della repo. Questo backend non è ancora collegato al frontend o a Prisma; l'archivio SQLite del servizio Python è separato dalla configurazione Prisma.
