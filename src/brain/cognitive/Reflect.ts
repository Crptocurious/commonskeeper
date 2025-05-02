import type { BaseAgent } from '../../BaseAgent';
import { BaseLLM } from '../BaseLLM';
import type { Memory, LakeObservation, AgentEnergyObservation } from '../memory/ScratchMemory';

export class Reflect {
    private llm: BaseLLM;

    constructor() {
        this.llm = new BaseLLM();
    }

    private buildReflectionPrompt(
        agent: BaseAgent,
        lakeState: LakeObservation | null,
        agentEnergies: AgentEnergyObservation[],
        recentMemories: Memory[],
        currentPhase: string
    ): string {
        return `You are ${agent.name}, analyzing your recent observations and experiences.
Focus on understanding patterns, consequences, and strategic implications.

Current Phase: ${currentPhase}

Lake Status:
${lakeState ? JSON.stringify(lakeState, null, 2) : 'No lake data available'}

Agent Energy States:
${JSON.stringify(agentEnergies, null, 2)}

Recent Events and Interactions:
${JSON.stringify(recentMemories, null, 2)}

Based on this information:
1. What patterns do you notice in fishing behavior and lake health?
2. How are other agents behaving? Are they cooperative or competitive?
3. What are the implications for lake sustainability?
4. What strategic adjustments might be needed?

Provide a concise analysis that can inform decision-making.
Focus on actionable insights rather than just summarizing data.
Consider both immediate tactical needs and long-term strategic goals.`;
    }

    public async reflect(agent: BaseAgent): Promise<string | undefined> {
        const scratchMemory = agent.getScratchMemory();
        
        // Gather all relevant state information
        const lakeState = scratchMemory.getLakeState();
        const agentEnergies = scratchMemory.getFreshAgentEnergies();
        const recentMemories = scratchMemory.getRecentMemories({
            maxCount: 10,
            maxAgeMs: 5 * 60 * 1000 // Last 5 minutes
        });
        const currentPhase = agent.currentPhase;

        // Build the reflection prompt
        const prompt = this.buildReflectionPrompt(
            agent,
            lakeState,
            agentEnergies,
            recentMemories,
            currentPhase
        );

        // Generate reflection using LLM
        const messages = [
            {
                role: "system" as const,
                content: "You are an AI agent reflecting on your observations and experiences. Provide clear, actionable insights."
            },
            {
                role: "user" as const,
                content: prompt
            }
        ];

        const reflection = await this.llm.generate(messages);
        return reflection;
    }
} 