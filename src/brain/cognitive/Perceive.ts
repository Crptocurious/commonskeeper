import type { Lake } from "../../Lake";
import type { GameState, LakeState, PhaseState, CycleState } from "../../types/GameState";
import type { ScratchMemory } from "../memory/ScratchMemory";

export class Perceive {
    private agentId: string;
    private lastPerceptionTick: number = 0;
    private readonly PERCEPTION_INTERVAL = 100; // Update every 100 ticks
    private scratchMemory: ScratchMemory;

    constructor(agentId: string, scratchMemory: ScratchMemory) {
        this.agentId = agentId;
        this.scratchMemory = scratchMemory;
    }

    public perceiveLake(lake: Lake): void {
        const lakeState: LakeState = {
            currentStock: lake.getCurrentStock(),
            maxCapacity: lake.getMaxCapacity(),
            lastUpdateTick: lake.getLastUpdateTick()
        };
        this.updateGameState({ lake: lakeState });
    }

    public perceivePhase(currentPhase: 'HARVEST' | 'TOWNHALL', currentTick: number): void {
        const lastPhaseState = this.scratchMemory.getLastGameState()?.phase;
        
        const phaseState: PhaseState = {
            currentPhase,
            lastPhase: lastPhaseState?.currentPhase || null,
            phaseStartTick: currentTick
        };
        this.updateGameState({ phase: phaseState });
    }

    public perceiveCycle(currentCycle: number, currentTick: number): void {
        const lastCycleState = this.scratchMemory.getLastGameState()?.cycle;
        
        const cycleState: CycleState = {
            currentCycle,
            lastCycle: lastCycleState?.currentCycle || currentCycle - 1,
            cycleStartTick: currentTick
        };
        this.updateGameState({ cycle: cycleState });
    }

    public shouldUpdate(currentTick: number): boolean {
        return currentTick - this.lastPerceptionTick >= this.PERCEPTION_INTERVAL;
    }

    private updateGameState(partialState: Partial<GameState>): void {
        const currentState = this.scratchMemory.getLastGameState() || {
            lake: { currentStock: 0, maxCapacity: 0, lastUpdateTick: 0 },
            phase: { currentPhase: 'TOWNHALL', lastPhase: null, phaseStartTick: 0 },
            cycle: { currentCycle: 0, lastCycle: 0, cycleStartTick: 0 },
            lastUpdateTick: 0
        };

        const newState: GameState = {
            ...currentState,
            ...partialState,
            lastUpdateTick: Date.now()
        };

        this.scratchMemory.updateGameState(newState);
        this.lastPerceptionTick = newState.lastUpdateTick;
    }

    // Force an immediate update of all game state components
    public forceGameStateUpdate(lake: Lake, currentPhase: 'HARVEST' | 'TOWNHALL', currentCycle: number, currentTick: number): void {
        this.perceiveLake(lake);
        this.perceivePhase(currentPhase, currentTick);
        this.perceiveCycle(currentCycle, currentTick);
    }
}
