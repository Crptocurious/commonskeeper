export interface EnergyState {
    currentEnergy: number;
    maxEnergy: number;
    isDepleted: boolean;
    lastUpdateTick: number;
}

export interface InventoryItem {
    name: string;
    quantity: number;
    metadata?: Record<string, any>; // For things like fish weight, mineral value, etc.
}

export interface InventoryState {
    items: Map<string, InventoryItem>;
    capacity?: number; // Optional inventory capacity limit
}

export interface BehaviorState {
    name: string;
    state: Record<string, any>; // Dynamic state specific to each behavior
    isActive: boolean;
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

export interface AgentState {
    name: string;
    energy: EnergyState;
    inventory: InventoryState;
    behaviors: BehaviorState[];
    communication: CommunicationHistory;
    memories: MemoryState[];
    position?: { x: number; y: number; z: number };
    currentPhase: 'HARVEST' | 'TOWNHALL';
    lastActionTick: number;
    lastReflectionTick: number;
    isDead: boolean;
}

// For storing historical agent states
export interface AgentStateHistory {
    states: AgentState[];
    maxHistoryLength: number;
} 