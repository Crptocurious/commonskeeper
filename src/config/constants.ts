import { Vector3 } from "hytopia";
import type { BehaviorConfig } from "../types/AgentState";
import { PathfindingBehavior } from "../behaviors/PathfindingBehavior";
import { SpeakBehavior } from "../behaviors/SpeakBehavior";
import { FishingBehavior } from "../behaviors/FishingBehavior";
import { PlanningBehavior } from "../behaviors/PlanningBehavior";
import { CommunicationBehavior } from "../behaviors/CommunicationBehavior";
import { buildCommonAgentPrompt } from "./prompts";

export const SIMULATION_CONFIG = {
    CHAT_RANGE: 10,
    FISH_RANGE: 5,
    LAKE_CAPACITY: 1000,
    LAKE_INITIAL_STOCK: 500,
    LAKE_COLLAPSE_THRESHOLD: 10
};

export const TIME_CONFIG = {
    TICKS_PER_SECOND: 60,
    TICKS_PER_MINUTE: 60 * 60,
    TICKS_PER_HOUR: 60 * 60 * 60,
    TICKS_PER_DAY: 60 * 60 * 60 * 24,
    PLANNING_DURATION_MINUTES: 1,
    HARVESTING_DURATION_MINUTES: 1,
    DISCUSSION_DURATION_MINUTES: 3,
};

export const REFLECTION_CONFIG = {
    REFLECTION_INTERVAL_TICKS: TIME_CONFIG.TICKS_PER_MINUTE * TIME_CONFIG.PLANNING_DURATION_MINUTES
};

export const COMMUNICATION_CONFIG = {
    TURN_DELAY_SECONDS: 10,
    get TURN_DELAY_TICKS() {
        return TIME_CONFIG.TICKS_PER_SECOND * this.TURN_DELAY_SECONDS;
    }
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

export const enum AgentName {
    JOHN = "John",
    KATE = "Kate",
    JACK = "Jack"
}

export const SPAWN_LOCATIONS = {
    player: { x: 0, y: 10, z: 0 },
    agents: {
        [AgentName.JOHN]: { x: 30, y: 3, z: 55 },
        [AgentName.KATE]: { x: 33, y: 3, z: 56 },
        [AgentName.JACK]: { x: 28, y: 3, z: 57 }
    }
};

// Agent behavior configurations
export const FISHERMAN_BEHAVIOR_CONFIGS: BehaviorConfig[] = [
    { type: PathfindingBehavior },
    { type: SpeakBehavior },
    { type: FishingBehavior, args: ['lake' as const] },
    { type: PlanningBehavior },
    { type: CommunicationBehavior }
];

// Agent-specific configurations
export const AGENT_CONFIGS = [
    {
        name: AgentName.JOHN,
        systemPrompt: buildCommonAgentPrompt(AgentName.JOHN),
        behaviorConfigs: FISHERMAN_BEHAVIOR_CONFIGS,
        spawnLocation: new Vector3(
            SPAWN_LOCATIONS.agents[AgentName.JOHN].x,
            SPAWN_LOCATIONS.agents[AgentName.JOHN].y,
            SPAWN_LOCATIONS.agents[AgentName.JOHN].z
        )
    },
    {
        name: AgentName.KATE,
        systemPrompt: buildCommonAgentPrompt(AgentName.KATE),
        behaviorConfigs: FISHERMAN_BEHAVIOR_CONFIGS,
        spawnLocation: new Vector3(
            SPAWN_LOCATIONS.agents[AgentName.KATE].x,
            SPAWN_LOCATIONS.agents[AgentName.KATE].y,
            SPAWN_LOCATIONS.agents[AgentName.KATE].z
        )
    },
    {
        name: AgentName.JACK,
        systemPrompt: buildCommonAgentPrompt(AgentName.JACK),
        behaviorConfigs: FISHERMAN_BEHAVIOR_CONFIGS,
        spawnLocation: new Vector3(
            SPAWN_LOCATIONS.agents[AgentName.JACK].x,
            SPAWN_LOCATIONS.agents[AgentName.JACK].y,
            SPAWN_LOCATIONS.agents[AgentName.JACK].z
        )
    }
];
