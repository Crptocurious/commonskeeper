import { BaseAgent } from '../../BaseAgent';
import type { Memory, LakeObservation, AgentEnergyObservation } from '../memory/ScratchMemory';

// Core interfaces for state sections
export interface StateSection {
    title: string;
    content: any;
}

export interface AgentState {
    energy: number;
    maxEnergy: number;
    inventory: any[];
    behaviors: Record<string, any>;
}

export interface NearbyEntity {
    name: string;
    type: string;
    state?: Record<string, any>;
}

export interface CompleteState {
    agentName: string;
    agentState: AgentState;
    gameState: Record<string, any>;
    nearbyEntities: NearbyEntity[];
    recentMemories: Memory[];
    agentEnergies: AgentEnergyObservation[];
    lakeState?: LakeObservation;
    selfEnergy?: AgentEnergyObservation[];
}

export class StateCollector {
    public static collectCompleteState(agent: BaseAgent): CompleteState {
        const scratchMemory = agent.getScratchMemory();
        const lakeState = scratchMemory.getLakeState();
        const selfEnergy = scratchMemory.getSelfEnergy();
        
        return {
            agentName: agent.name,
            agentState: this.collectAgentState(agent),
            gameState: agent.getGameState(),
            nearbyEntities: this.collectNearbyEntities(agent),
            recentMemories: scratchMemory.getRecentMemories({
                maxCount: 10,
                maxAgeMs: 5 * 60 * 1000
            }),
            agentEnergies: scratchMemory.getFreshAgentEnergies(),
            lakeState: lakeState || undefined,
            selfEnergy: selfEnergy ? [selfEnergy] : undefined
        };
    }

    private static collectAgentState(agent: BaseAgent): AgentState {
        const state = agent.getAgentState();
        return {
            energy: state.energy,
            maxEnergy: state.maxEnergy,
            inventory: state.inventory,
            behaviors: Object.entries(state)
                .filter(([key]) => key !== 'energy' && key !== 'maxEnergy' && key !== 'inventory')
                .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
        };
    }

    private static collectNearbyEntities(agent: BaseAgent): NearbyEntity[] {
        return agent.getNearbyEntities().map((e) => ({
            name: e.name,
            type: e.type,
            state: e instanceof BaseAgent ? e.getCurrentState() : undefined,
        }));
    }

    // Helper method to format state sections (used by Reflect)
    public static formatAsSections(state: CompleteState): StateSection[] {
        const sections: StateSection[] = [];

        // Agent Status Section
        sections.push({
            title: "Agent Status",
            content: state.agentState
        });

        // Game Status Section
        sections.push({
            title: "Game Status",
            content: state.gameState
        });

        // Lake Status Section
        if (state.lakeState) {
            sections.push({
                title: "Lake Status",
                content: state.lakeState
            });
        }

        // Agent Energy States Section
        if (state.agentEnergies.length > 0) {
            sections.push({
                title: "Agent Energy States",
                content: state.agentEnergies
            });
        }

        // Recent Events Section
        if (state.recentMemories.length > 0) {
            sections.push({
                title: "Recent Events and Interactions",
                content: state.recentMemories
            });
        }

        return sections;
    }
} 