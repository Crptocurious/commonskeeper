import { World } from "hytopia";
import { Lake } from "../Lake";
import { BaseAgent } from "../BaseAgent";
import { MetricsTracker } from "../MetricsTracker";

export type GamePhase = 'HARVEST' | 'TOWNHALL';

export interface PhaseChangeEvent {
    phase: GamePhase;
    currentTick: number;
}

export interface GameWorld extends World {
    currentTick: number;
    currentPhase: GamePhase;
    lake: Lake;
    agents: BaseAgent[];
    metricsTracker: MetricsTracker;
}

export interface GameContext {
    lake: Lake;
}

export interface LakeState {
    currentStock: number;
    maxCapacity: number;
    lastUpdateTick: number;
    isCollapsed: boolean;
    regenRate: number;
    collapseThreshold: number;  // As a percentage of maxCapacity
}

export interface PhaseState {
    currentPhase: GamePhase;
    lastPhase: GamePhase | null;
    phaseStartTick: number;
}

export interface GameState {
    lake: LakeState;
    phase: PhaseState;
    lastUpdateTick: number;
}

// For storing historical game states
export interface GameStateHistory {
    states: GameState[];
    maxHistoryLength: number;
}