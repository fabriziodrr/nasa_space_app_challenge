# AEGIS data backend

Base Python/SQLite for observations, metrics, and shared context between agent and dashboard.

Startup, import, API, and agent contract: [DATA_BACKEND.md](../docs/DATA_BACKEND.md).

Synthetic test ready and longitudinal sleep analysis: [SLEEP_ANALYSIS.md](../docs/SLEEP_ANALYSIS.md).

LangChain tools and companion integration: [LANGCHAIN.md](../docs/LANGCHAIN.md).

The Next.js frontend and the agent are located at the repo root and communicate with this service via HTTP. The service's Python SQLite store remains separate from the agent's Prisma database. For integrated startup see the [main README](../README.md).
