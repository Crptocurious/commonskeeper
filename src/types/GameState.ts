export interface LakeState {
    currentStock: number;
    maxCapacity: number;
    lastUpdateTick: number;
    isCollapsed: boolean;
    regenRate: number;
    collapseThreshold: number;  // As a percentage of maxCapacity
}

export interface PhaseState {
    currentPhase: 'HARVEST' | 'TOWNHALL';
    lastPhase: 'HARVEST' | 'TOWNHALL' | null;
    phaseStartTick: number;
}

export interface CycleState {
    currentCycle: number;
    lastCycle: number;
    cycleStartTick: number;
}

export interface GameState {
    lake: LakeState;
    phase: PhaseState;
    cycle: CycleState;
    lastUpdateTick: number;
}

// For storing historical game states
export interface GameStateHistory {
    states: GameState[];
    maxHistoryLength: number;
} 