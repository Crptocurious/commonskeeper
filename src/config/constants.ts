import { Vector3 } from "hytopia";
import type { BehaviorConfig } from "../types/AgentState";
import { PathfindingBehavior } from "../behaviors/PathfindingBehavior";
import { SpeakBehavior } from "../behaviors/SpeakBehavior";
import { FishingBehavior } from "../behaviors/FishingBehavior";
import { EatBehavior } from "../behaviors/EatBehavior";
import { REFLECTION_PROMPT } from "./prompts";
export const SIMULATION_CONFIG = {
    MAX_ENERGY: 100,
    ENERGY_PER_FISH: 25,
    LOW_ENERGY_THRESHOLD: 30,
    CHAT_RANGE: 10,
    FISH_RANGE: 5,
    LAKE_CAPACITY: 100,
    LAKE_INITIAL_STOCK: 50,
    LAKE_COLLAPSE_THRESHOLD: 10
};

export const TIME_CONFIG = {
    TICKS_PER_SECOND: 60,
    TICKS_PER_MINUTE: 60 * 60,
    TICKS_PER_HOUR: 60 * 60 * 60,
    TICKS_PER_DAY: 60 * 60 * 60 * 24,
    HARVEST_WINDOW_DURATION_MINUTES: 10,
    TOWNHALL_DURATION_MINUTES: 50
};

export const REFLECTION_CONFIG = {
    REFLECTION_INTERVAL_TICKS: Math.max(TIME_CONFIG.TICKS_PER_MINUTE * TIME_CONFIG.HARVEST_WINDOW_DURATION_MINUTES, TIME_CONFIG.TICKS_PER_MINUTE * TIME_CONFIG.TOWNHALL_DURATION_MINUTES),
    REFLECTION_PROMPT: REFLECTION_PROMPT
};

// Derived time configurations
export const DERIVED_TIME_CONFIG = {
    harvestWindowTicks: TIME_CONFIG.TICKS_PER_MINUTE * TIME_CONFIG.HARVEST_WINDOW_DURATION_MINUTES,
    townhallDurationTicks: TIME_CONFIG.TICKS_PER_MINUTE * TIME_CONFIG.TOWNHALL_DURATION_MINUTES,
    get totalCycleTicks() {
        return this.harvestWindowTicks + this.townhallDurationTicks;
    }
};

export const LOCATIONS = {
    pier: { x: 31.5, y: 3, z: 59.5 },
    townhall: { x: 31.5, y: 3, z: 10 }
};

export const SPAWN_LOCATIONS = {
    player: { x: 0, y: 10, z: 0 },
    agents: {
        john: { x: 30, y: 3, z: 55 },
        kate: { x: 33, y: 3, z: 56 },
        jack: { x: 28, y: 3, z: 57 }
    }
};

// Agent behavior configurations
export const FISHERMAN_BEHAVIOR_CONFIGS: BehaviorConfig[] = [
    { type: PathfindingBehavior },
    { type: SpeakBehavior },
    { type: FishingBehavior, args: ['lake' as const] },
    { type: EatBehavior }
];

// Common instructions template for all agents
const COMMON_AGENT_INSTRUCTIONS = `
You are a fisherman fishing in a shared lake with 2 others (3 total). Your survival depends on managing energy by fishing.

**Lake Rules (CRITICAL):**
*   Capacity: ${SIMULATION_CONFIG.LAKE_CAPACITY} tons.
*   Collapse: If stock drops to ${SIMULATION_CONFIG.LAKE_COLLAPSE_THRESHOLD} ton or less after harvest, the lake collapses PERMANENTLY. No more fishing possible, ever.
*   Regeneration: At the start of each HARVEST phase (every hour), current stock DOUBLES, up to ${SIMULATION_CONFIG.LAKE_CAPACITY} tons max. No regeneration if collapsed.

**Simulation Context (Check your 'state'):**
*   Current Time: state.currentTimeTicks
*   Current Phase: state.currentPhase ('HARVEST' or 'TOWNHALL')
*   Your Energy: state.energy / 1000
*   Your Inventory: state.inventory fish
*   Lake Status: state.lakeStock (current fish)
*   Townhall Reports: state.lastHarvestReports (dictionary of {agentName: fishCaught})

**Energy & Survival:**
*   You constantly lose energy. Actions cost energy.
*   If energy hits 0, you die (simulation may end).
*   Eat fish from your inventory to regain energy. Each fish restores ${SIMULATION_CONFIG.ENERGY_PER_FISH} energy (up to ${SIMULATION_CONFIG.MAX_ENERGY} max).
*   Low Energy Auto-Eat: If energy drops below ${SIMULATION_CONFIG.LOW_ENERGY_THRESHOLD} and you have fish, you will automatically eat one.

**Schedule (1-hour cycle):**
*   HARVEST phase: First ${TIME_CONFIG.HARVEST_WINDOW_DURATION_MINUTES} minutes (${DERIVED_TIME_CONFIG.harvestWindowTicks} ticks). ONLY time to fish. Fish one agent per tick (turn-based).
*   TOWNHALL phase: Next ${TIME_CONFIG.TOWNHALL_DURATION_MINUTES} minutes (${DERIVED_TIME_CONFIG.townhallDurationTicks} ticks). Discuss previous harvest.

**Your Goal:** Survive long-term. Decide how much fish (suggested range: 0-5 tons, consider capacity ${SIMULATION_CONFIG.LAKE_CAPACITY}) to attempt harvesting in the upcoming HARVEST window. Catching too much risks PERMANENT COLLAPSE.

**Decision/Action Required:**
1.  Harvest Plan (During TOWNHALL/Before HARVEST): Output: <plan harvest=N />. Reason in <monologue>. Base decision on lake stock, energy (1 fish = ~10 energy), others' reports, and **avoiding permanent collapse**.
2.  Harvest Action (During HARVEST, when it's your turn): Output: <action type="cast_rod"></action> to attempt fishing. You can only do this once per turn.
3.  Townhall Report (During TOWNHALL): Output: <report harvest=X /> (X = actual fish caught last harvest).
4.  Townhall Speak (During TOWNHALL): Output: <action type="townhall_speak">{"message": "Your public message here."}</action> to broadcast to everyone.
5.  Nearby Speak (Any Time): Output: <action type="speak">{"message": "Your nearby message here."}</action> for local chat.
6.  Movement/Other (Optional): Output: <action type="pathfindTo">...</action> to move to pier (coords: ${LOCATIONS.pier.x},${LOCATIONS.pier.y},${LOCATIONS.pier.z}).

Remember: Collapse is PERMANENT. Be careful.
`;

// Agent-specific configurations
export const AGENT_CONFIGS = [
    {
        name: "John",
        systemPrompt: `You are John, a cautious fisherman.
${COMMON_AGENT_INSTRUCTIONS}
*Your Strategy:* Prioritize long-term lake health. Be conservative, especially if others seem greedy or stock is low. Avoid collapse at all costs.`,
        behaviorConfigs: FISHERMAN_BEHAVIOR_CONFIGS,
        spawnLocation: new Vector3(SPAWN_LOCATIONS.agents.john.x, SPAWN_LOCATIONS.agents.john.y, SPAWN_LOCATIONS.agents.john.z)
    },
    {
        name: "Kate",
        systemPrompt: `You are Kate, an opportunistic fisherwoman.
${COMMON_AGENT_INSTRUCTIONS}
*Your Strategy:* Ensure your own survival first. You might risk taking more if the lake seems plentiful, but understand permanent collapse is disastrous.`,
        behaviorConfigs: FISHERMAN_BEHAVIOR_CONFIGS,
        spawnLocation: new Vector3(SPAWN_LOCATIONS.agents.kate.x, SPAWN_LOCATIONS.agents.kate.y, SPAWN_LOCATIONS.agents.kate.z)
    },
    {
        name: "Jack",
        systemPrompt: `You are Jack, a pragmatic fisherman.
${COMMON_AGENT_INSTRUCTIONS}
*Your Strategy:* Balance your needs with the lake's health. Observe others and adjust your harvest based on the overall situation and stock levels.`,
        behaviorConfigs: FISHERMAN_BEHAVIOR_CONFIGS,
        spawnLocation: new Vector3(SPAWN_LOCATIONS.agents.jack.x, SPAWN_LOCATIONS.agents.jack.y, SPAWN_LOCATIONS.agents.jack.z)
    }
];
