import type { ActionHistory, ActionHistoryEntry } from "../../types/AgentState";
import type { CompleteState } from "../../BaseAgent";

export class ScratchMemory {
    private actionHistory: ActionHistory;
    private readonly MAX_HISTORY_LENGTH = 100;

    constructor(agentName: string) {
        this.actionHistory = {
            entries: [],
            maxHistoryLength: this.MAX_HISTORY_LENGTH
        };
    }

    public addActionMemory(tick: number, stateBeforeAction: CompleteState, actionType: string, actionArgs: any) {
        const entry: ActionHistoryEntry = {
            tick,
            stateBeforeAction,
            action: {
                type: actionType,
                args: actionArgs
            }
        };

        this.actionHistory.entries.unshift(entry);

        // Maintain history length
        if (this.actionHistory.entries.length > this.actionHistory.maxHistoryLength) {
            this.actionHistory.entries.pop();
        }
    }

    public getActionHistory(): ActionHistory {
        return this.actionHistory;
    }

    public getRecentMemories(count: number = 5): ActionHistoryEntry[] {
        return this.actionHistory.entries.slice(0, count);
    }
} 