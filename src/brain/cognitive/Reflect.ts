import type { BaseAgent } from '../../BaseAgent';
import { BaseLLM } from '../BaseLLM';
import type { CompleteState } from '../../BaseAgent';

// Interface for the complete reflection state
interface ReflectionState {
    agentName: string;
    state: CompleteState;
}

export class Reflect {
    private llm: BaseLLM;

    constructor() {
        this.llm = new BaseLLM();
    }

    private buildReflectionPrompt(state: ReflectionState): string {
        let prompt = `You are ${state.agentName}, an AI agent in a multiplayer fishing game focused on resource management and social dynamics.
You must balance personal gain with lake sustainability while interacting with other agents.

The game alternates between HARVEST phase (where agents can fish) and TOWNHALL phase (where agents discuss and strategize).
Your decisions affect both your survival (through energy management) and the lake's health.

Your current state and observations:

=== Agent State ===
${JSON.stringify(state.state.agent, null, 2)}

=== Game State ===
${JSON.stringify(state.state.game, null, 2)}

Based on this information, analyze the current situation and provide strategic insights.
Consider:
- Resource management (both personal energy and lake sustainability)
- Social dynamics and cooperation opportunities
- Short-term tactics and long-term strategy
- Risks and opportunities in the current phase

Provide a concise analysis that can inform your next actions.`;

        return prompt;
    }

    public async reflect(agent: BaseAgent): Promise<string | undefined> {
        // Get complete state directly from agent
        const completeState = agent.getCompleteState();
        
        // Create reflection state
        const reflectionState: ReflectionState = {
            agentName: agent.name,
            state: completeState
        };

        // Build the reflection prompt
        const prompt = this.buildReflectionPrompt(reflectionState);

        // Generate reflection using LLM
        const messages = [
            {
                role: "system" as const,
                content: "You are an AI agent in a multiplayer fishing game. Your goal is to survive and thrive while maintaining lake sustainability through strategic fishing and social cooperation. Analyze your current state and provide actionable insights."
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