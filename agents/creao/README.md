# CREAO department agents

1. Sign up with the hackathon link: https://creao.ai/signup?hackathon=ucla-ai&utm_source=ucla-ai&utm_medium=hackathon&utm_campaign=hackathons-oct-2026
2. Create the agents in this order at agent.creao.ai: **Scout** (`scout.md`), then **Maker** (`maker.md`), then **Herald** (`herald.md`). Maker and Herald test inputs use Scout-style research output.
3. For each one, enable the tools listed in the file header, paste everything below `---- PASTE BELOW THIS LINE INTO CREAO ----` into the chat, run the test input once, check it ends with a single valid ```json block, then click **Create Agent**.
4. Run `npm run keys` (or edit the root `.env`) and set `CREAO_SCOUT_AGENT_ID`, `CREAO_MAKER_AGENT_ID`, `CREAO_HERALD_AGENT_ID`. Then `npm run check`.
5. If you edit an instruction file later, recreate (or update) that agent and refresh its ID in `.env`.

Agent links (for judges): Scout <url> · Maker <url> · Herald <url>
