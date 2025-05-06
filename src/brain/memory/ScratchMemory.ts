import type { ActionHistory, ActionHistoryEntry } from "../../types/AgentState";
import type { CompleteState } from "../../BaseAgent";

export interface ChatHistoryEntry {
    agentName: string;
    message: string;
    tick: number;
}

export interface TownhallHistory {
    messages: ChatHistoryEntry[];
    isDiscussionInProgress: boolean;
    currentSpeakerIndex: number;
    lastUpdateTick: number;
}

export class ScratchMemory {
    private actionHistory: ActionHistory;
    private townhallHistory: TownhallHistory;
    private readonly MAX_HISTORY_LENGTH = 100;
    private readonly MAX_CHAT_HISTORY_LENGTH = 100;

    constructor(agentName: string) {
        this.actionHistory = {
            entries: [],
            maxHistoryLength: this.MAX_HISTORY_LENGTH
        };
        this.townhallHistory = {
            messages: [],
            isDiscussionInProgress: false,
            currentSpeakerIndex: 0,
            lastUpdateTick: 0
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

    public updateTownhallHistory(newHistory: TownhallHistory) {
        this.townhallHistory = {
            ...newHistory,
            messages: newHistory.messages.slice(-this.MAX_CHAT_HISTORY_LENGTH) // Keep only the most recent messages
        };
    }

    public getTownhallHistory(): TownhallHistory {
        return this.townhallHistory;
    }

    public getActionHistory(): ActionHistory {
        return this.actionHistory;
    }

    public getRecentMemories(count: number = 5): ActionHistoryEntry[] {
        return this.actionHistory.entries.slice(0, count);
    }
} 