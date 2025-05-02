import type { GameState, GameStateHistory } from "../../types/GameState";

interface Memory {
    type: string;
    content: any;
    timestamp: number;
}

export class ScratchMemory {
    private agentId: string;
    private memories: Memory[] = [];
    private gameStateHistory: GameStateHistory;
    private readonly MAX_MEMORIES = 1000;
    private readonly MAX_GAME_STATES = 5; // Store last 5 game states

    constructor(agentId: string) {
        this.agentId = agentId;
        this.gameStateHistory = {
            states: [],
            maxHistoryLength: this.MAX_GAME_STATES
        };
    }

    public addMemory(memory: Memory): void {
        this.memories.push(memory);
        if (this.memories.length > this.MAX_MEMORIES) {
            this.memories.shift(); // Remove oldest memory if we exceed max
        }
    }

    public getRecentMemories(options: { types?: string[]; maxCount?: number } = {}): Memory[] {
        let filtered = this.memories;
        if (options.types) {
            filtered = filtered.filter(m => options.types!.includes(m.type));
        }
        const count = options.maxCount || filtered.length;
        return filtered.slice(-count);
    }

    public updateGameState(newState: GameState): void {
        this.gameStateHistory.states.push(newState);
        if (this.gameStateHistory.states.length > this.gameStateHistory.maxHistoryLength) {
            this.gameStateHistory.states.shift(); // Remove oldest state if we exceed max
        }
    }

    public getLastGameState(): GameState | undefined {
        if (this.gameStateHistory.states.length === 0) return undefined;
        return this.gameStateHistory.states[this.gameStateHistory.states.length - 1];
    }

    public getGameStateHistory(): GameState[] {
        return [...this.gameStateHistory.states];
    }

    public getLakeState(): any {
        const lastState = this.getLastGameState();
        return lastState?.lake;
    }

    public clearMemories(): void {
        this.memories = [];
        this.gameStateHistory.states = [];
    }
}
