Commons Keeper – Tragedy of the Commons Demo

This repository shows how to build a multi‑agent, resource‑sharing world with the [HYTOPIA SDK]. A society of AI fishers must harvest just enough fish each day to keep the lake alive for tomorrow. Use it as a starting point for research on cooperation, governance and emergent norms.

✨ Features

Renewable Lake with logistic growth and collapse mechanics

Multiple AI agents (Greedy, Random, Rule‑based Sustainable) with path‑finding & unique behaviour

Simple rule-based agent behaviors with customizable response patterns

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

2  Run the demo

```bash
bun --watch index.ts    # opens http://localhost:8080
```

Join as a player and watch the fishers negotiate (or not!).

🤖 How do agents work?

Agents combine world‑state snapshots and game actions to make decisions.

World‑state representation

Each tick, an agent receives:

* Its own position & energy
* Nearby entities (fishers, lake)
* Inventory contents
* Status of any ongoing actions

This object is used to determine the agent's next action. See `src/BaseAgent.ts#getCurrentState()` for details.

Actions

Agents express intent by outputting XML tags that the game parses:

```xml
<action type="move" target="Lake" />
<action type="fish" amount="5" />
<action type="speak">Let's stick to 5 fish each!</action>
```

Why XML? It is small, structured, and easy to parse out of text responses.

Agent Responses

Two trigger styles are demonstrated:

* Response Triggers – instant reply when a player talks to an agent.
* Game Steps – every 30 s idle, the agent wakes up to plan its next move.

Scale from 1 → 100 agents without flooding chat by tweaking the step interval.

📊 Core research questions

* Can self‑interested agents find harvesting norms that keep the lake alive?
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