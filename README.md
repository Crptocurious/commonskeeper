Commons Keeper – Tragedy of the Commons Demo

This repository shows how to build a multi‑agent, resource‑sharing world with the [HYTOPIA SDK]. A society of AI fishers must harvest just enough fish each day to keep the lake alive for tomorrow. Use it as a starting point for research on cooperation, governance and emergent norms.

✨ Features

Renewable Lake with logistic growth and collapse mechanics

Multiple AI agents (Greedy, Random, Rule‑based Sustainable) with path‑finding & unique behaviour

LLM‑augmented brains (GPT‑4o via AutoGen/CrewAI) or pure TypeScript heuristics

Chat bubbles & global chat feed for agent speech

Sidebar UI showing real‑time agent actions, energy & inventory

JSONL logging for sustainability, efficiency & inequality metrics

🚀 Setup

1  Clone & install

```bash
bunx hytopia init --template ai-agents commons-keeper
cd commons-keeper
bun install
```

2  Environment variables

Agents call OpenAI for reasoning.  Create a .env at project root:

```
OPENAI_API_KEY=your_openai_api_key_here
```

You can copy the example:

```bash
cp .env.example .env
```

Note: GPT‑4o access is required.

3  Run the demo

```bash
bun --watch index.ts    # opens http://localhost:8080
```

Join as a player and watch the fishers negotiate (or not!).

🤖 How do agents work?

Agents combine world‑state snapshots, game actions, and LLM prompts.

World‑state representation

Each tick, an agent receives:

* Its own position & energy
* Nearby entities (fishers, lake)
* Inventory contents
* Status of any ongoing actions

This object is stringified and prepended to the LLM prompt.  See `src/BaseAgent.ts#getCurrentState()` for details.

Actions

Agents express intent by outputting XML tags that the game parses:

```xml
<action type="move" target="Lake" />
<action type="fish" amount="5" />
<action type="speak">Let's stick to 5 fish each!</action>
```

Why XML? It is small, language‑model‑friendly, and easy to regex out of natural text.

Large Language Models

Two trigger styles are demonstrated:

* Response Triggers – instant reply when a player talks to an agent.
* Game Steps – every 30 s idle, the agent wakes up to plan its next move.

Scale from 1 → 100 agents without flooding chat by tweaking the step interval.

📊 Core research questions

* Can self‑interested agents find harvesting norms that keep the lake alive?
* Does higher reasoning power increase selfishness?
* Does chat + reasoning improve governance?
* Which incentives (tax, spoilage, trade) raise cooperative equilibrium?

Run headless sims via:

```bash
bun run scripts/run-local.ts --ticks 1000 --agents 5 --policy greedy
```

Logs land in `experiments/<run‑id>/events.jsonl` and can be analysed in DuckDB / Pandas.

🔭 What's next?

* Self‑play PPO to learn quotas automatically
* Punishment & tax mechanics for institutional enforcement
* Trading post economy (fish ↔ coins) to study inequality
* Superset dashboards for live lake curves & Gini graphs

🪪 License

MIT.  Built with ❤️ on the HYTOPIA SDK.