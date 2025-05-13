# Commons Keeper: Multi-Agent Resource Management Simulation

This repository presents a modular, scalable simulation of resource management in a shared environment, focusing on multi-agent behavior and sustainability. The project progresses from basic agent interactions and environmental dynamics to more complex social and ecological modeling. The project is organized into several parts, each with a detailed technical plan:

**Part 1: Core Simulation Environment**

* Implements a simulated lake ecosystem with resource regeneration and collapse mechanics.
* Defines the core game loop, including distinct phases (PLANNING, HARVESTING, DISCUSSION).
* Includes the `Lake` class for modeling resource dynamics and `MetricsTracker` for logging simulation data.
* Key Features:
    * Lake with capacity, regeneration, and collapse threshold.
    * Discrete simulation phases with configurable durations.
    * Metrics tracking for resource levels, agent actions, and simulation outcomes.

**Part 2: Basic Agent Behavior**

* Introduces the `BaseAgent` class and fundamental agent behaviors (e.g., `FishingBehavior`, `PlanningBehavior`).
* Implements basic agent actions (e.g., `plan_harvest`, `cast_rod`).
* Enables agents to perceive their environment and maintain a simple inventory.
* Key Features:
    * Modular agent architecture with pluggable behaviors.
    * Action-based agent control using XML-like tags.
    * Basic agent perception and memory.

**Part 3: Agent Communication and Coordination**

* Focuses on enabling agents to communicate and coordinate during the `DISCUSSION` phase.
* Implements the `CommunicationBehavior` to manage turn-taking and message processing.
* Introduces prompts to guide agent conversations towards strategic decision-making.
* Key Features:
    * Round-robin turn-taking during discussions.
    * LLM-driven agent communication using `<monologue>` and `<speak>` tags.
    * Mechanisms for tracking and logging communication.

**Part 4: Enhanced Agent Cognition**

* Adds more sophisticated cognitive capabilities to agents, including reflection and planning.
* Implements the `CognitiveCycle` to orchestrate reflection (`Reflect`) and planning (`Plan`).
* Refines prompts to encourage deeper strategic reasoning and more effective use of past information.
* Key Features:
    * Agent reflection on past actions and game state.
    * LLM-driven plan generation based on reflection.
    * Framework for iterative agent decision-making.

**Part 5: Data Logging and Analysis**

* Focuses on the generation of logs and metrics to analyze simulation outcomes.
* Implements the `MetricsTracker` class to record key data points throughout the simulation.
* Logs are generated in JSONL format for easy parsing and analysis.
* Key Metrics and Logging:
    * Lake survival rate (time until collapse, if any).
    * Fish stock levels over time.
    * Total harvest per cycle.
    * Agent harvest amounts.
    * Gini coefficient to measure wealth inequality among agents.
    * Logs of agent actions, communication, and internal thoughts.

**Part 6: Local Setup and Execution**

* These instructions detail how to set up and run the "Commons Keeper" simulation locally.
* **Prerequisites:**
    * [Bun](https://bun.sh/) (or Node.js/npm) installed.
    * An OpenAI API key.
* **Steps:**
    1.  Clone the repository:
        ```bash
        git clone <repository_url>
        cd commons-keeper
        ```
    2.  Install dependencies:
        ```bash
        bun install  # Or: npm install
        ```
    3.  Create a `.env` file in the project root and add your OpenAI API key:
        ```
        OPENAI_API_KEY=<YOUR_OPENAI_API_KEY>
        ```
    4.  Run the simulation:
        ```bash
        bun --watch index.ts  # Or: bun run index.ts
        ```
    5.  The simulation will start a local server. You can access it in your browser at `http://localhost:8080`.

🔭 What's next?
* Expand the simulation to include more complex ecological and social factors. Add features like -
    * Variable regeneration rates.
    * Spatial distribution of resources.
    * Agent specialization or roles.
    * More nuanced social interactions (e.g., trust, reputation).
* Scale the simulation to larger numbers of agents and longer durations.
* Focus on in-depth analysis of emergent norms and governance strategies.
* Superset dashboards for live lake curves & Gini graphs

 Built with ❤️ using the HYTOPIA SDK.