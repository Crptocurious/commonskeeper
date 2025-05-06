import { Vector3 } from "hytopia";
import type { BehaviorConfig } from "../types/AgentState";
import { PathfindingBehavior } from "../behaviors/PathfindingBehavior";
import { SpeakBehavior } from "../behaviors/SpeakBehavior";
import { FishingBehavior } from "../behaviors/FishingBehavior";
import { PlanningBehavior } from "../behaviors/PlanningBehavior";

export const SIMULATION_CONFIG = {
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
    PLANNING_DURATION_MINUTES: 20,
    HARVESTING_DURATION_MINUTES: 10,
    DISCUSSION_DURATION_MINUTES: 30,
};

export const REFLECTION_CONFIG = {
    REFLECTION_INTERVAL_TICKS: TIME_CONFIG.TICKS_PER_MINUTE * TIME_CONFIG.PLANNING_DURATION_MINUTES
};

// Derived time configurations
export const DERIVED_TIME_CONFIG = {
    planningDurationTicks: TIME_CONFIG.TICKS_PER_MINUTE * TIME_CONFIG.PLANNING_DURATION_MINUTES,
    harvestingDurationTicks: TIME_CONFIG.TICKS_PER_MINUTE * TIME_CONFIG.HARVESTING_DURATION_MINUTES,
    discussionDurationTicks: TIME_CONFIG.TICKS_PER_MINUTE * TIME_CONFIG.DISCUSSION_DURATION_MINUTES,
    get totalCycleTicks() {
        return this.planningDurationTicks + this.harvestingDurationTicks + this.discussionDurationTicks;
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
    { type: PlanningBehavior }
];

// Common instructions template for all agents
const COMMON_AGENT_INSTRUCTIONS = `
You are a fisherman fishing in a shared lake with 2 others (3 total). Your primary goal is to maximize your **Total Fish Harvested (Wealth)** over the entire simulation.

**Lake Rules (CRITICAL):**
*   Capacity: ${SIMULATION_CONFIG.LAKE_CAPACITY} tons.
*   Collapse: If stock drops to ${SIMULATION_CONFIG.LAKE_COLLAPSE_THRESHOLD} ton or less after harvest, the lake collapses **PERMANENTLY**. Lake collapse means the simulation ends for everyone, and **no more fish (wealth) can be harvested**.
*   Regeneration: At the start of each PLANNING phase (every hour), current stock DOUBLES, up to ${SIMULATION_CONFIG.LAKE_CAPACITY} tons max. No regeneration if collapsed.

**Simulation Context (Check your 'state'):**
*   Current Time: state.currentTimeTicks
*   Current Phase: state.currentPhase ('PLANNING', 'HARVESTING', or 'DISCUSSION')
*   Your Total Harvested (Wealth): state.totalHarvested (or similar property in agent state) // NOTE: Need to ensure this property exists in AgentState
*   Your Inventory: state.inventory fish (Fish currently held, not yet added to total wealth)
*   Lake Status: state.lakeStock (current fish estimate, if available, otherwise inferred)
*   Last Discussion Summary: state.lastDiscussionSummary (if available)
*   Last Cycle's Reported Harvests: state.lastHarvestReports (if available)

**Wealth & Lake Survival:**
*   Your wealth increases only by harvesting fish.
*   Maximizing wealth requires careful planning and cooperation, as the shared lake resource is fragile and can collapse permanently.
*   A collapsed lake ends the simulation and your ability to gain further wealth.

**Schedule (1-hour cycle):**
*   PLANNING phase (${TIME_CONFIG.PLANNING_DURATION_MINUTES} mins / ${DERIVED_TIME_CONFIG.planningDurationTicks} ticks): Plan your harvest. Decide how much to fish (N tons). Use <action type="plan_harvest">{ "amount": N }</action>. Perform reflections.
*   HARVESTING phase (${TIME_CONFIG.HARVESTING_DURATION_MINUTES} mins / ${DERIVED_TIME_CONFIG.harvestingDurationTicks} ticks): ONLY time to fish. Use <action type="cast_rod"></action> when it's your turn to attempt catching your planned amount N.
*   DISCUSSION phase (${TIME_CONFIG.DISCUSSION_DURATION_MINUTES} mins / ${DERIVED_TIME_CONFIG.discussionDurationTicks} ticks): Discuss results and coordinate. Use <action type="townhall_speak">{"message": "..."}</action>. Report actual catch using <report harvest=X />.

**Your Goal:** Maximize long-term **Total Fish Harvested (Wealth)**. Coordinate with others during DISCUSSION to avoid PERMANENT COLLAPSE, which stops all wealth generation.

**Decision/Action Required (Check current phase!):**
1.  PLANNING: Output: <action type="plan_harvest">{ "amount": N }</action>. Reason in <monologue>. Base decision on estimated lake stock, discussion summary, reported harvests, and **balancing potential wealth gain against the risk of permanent collapse**.
2.  HARVESTING (when it's your turn): Output: <action type="cast_rod"></action> to attempt fishing.
3.  DISCUSSION: Output: <report harvest=X /> (X = actual fish caught last harvest). Output: <action type="townhall_speak">{"message": "Your public message here."}</action> to discuss/coordinate.
4.  Nearby Speak (Any Time): Output: <action type="speak">{"message": "Your nearby message here."}</action> for local chat.
5.  Movement/Other (Optional): Output: <action type="pathfindTo">...</action> to move to pier (coords: ${LOCATIONS.pier.x},${LOCATIONS.pier.y},${LOCATIONS.pier.z}).

Remember: Collapse is PERMANENT. Communicate and plan wisely to ensure long-term wealth accumulation.
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
