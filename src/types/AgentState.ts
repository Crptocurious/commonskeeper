import type { Lake } from "../Lake";
import type { GameContext, GamePhase } from "./GameState";
import { Vector3 } from "hytopia";
import type { CompleteState } from "../BaseAgent";
import type { FishingState } from "../behaviors/FishingBehavior";

export interface AgentConfig {
    name: string;
    systemPrompt: string;
    behaviorConfigs: BehaviorConfig[];
    spawnLocation: Vector3;
}

export interface BehaviorConfig {
    type: new (...args: any[]) => any;
    args?: (keyof GameContext)[];
}

export interface InventoryItem {
    name: string;
    quantity: number;
    metadata?: Record<string, any>; // For things like fish weight, mineral value, etc.
    // type: string;
    // position: Vector3;
}

export interface BehaviorState {
    name: string;
    state: string;
}

export interface CommunicationEntry {
    timestamp: number;
    type: 'SPEAK' | 'TOWNHALL' | 'INTERNAL_MONOLOGUE';
    content: string;
    sender?: string;
    receiver?: string;
}

export interface CommunicationHistory {
    messages: CommunicationEntry[];
    maxHistoryLength: number;
}

export interface MemoryState {
    type: string;
    content: any;
    timestamp: number;
}

export interface NearbyEntity {
    name: string;
    type: string;
    distance: number;
    position: Vector3;
}

export interface AgentState {
    name: string;
    position?: { x: number; y: number; z: number };
    inventory: InventoryItem[];
    behaviors: BehaviorState[];
    // communication: CommunicationHistory;
    // memories: MemoryState[];
    lastActionTick: number;
    lastReflectionTick: number;
    totalHarvested: number;
    internalMonologue: string[];
    nearbyEntities: NearbyEntity[];
    // fishingState?: FishingState;
    // scratchMemory: {
    //     getRecentActionMemories(count?: number): ActionHistoryEntry[];
    // }
}

// For storing historical agent states
export interface AgentStateHistory {
    states: AgentState[];
    maxHistoryLength: number;
} 

export interface AgentUpdateContext {
    currentTick: number;
    currentPhase: GamePhase;
    lake: Lake;
} 

export interface ActionHistoryEntry {
    tick: number;
    stateBeforeAction: CompleteState;
    action: {
        type: string;
        args: any;
    };
}

export interface ActionHistory {
    entries: ActionHistoryEntry[];
    maxHistoryLength: number;
} 