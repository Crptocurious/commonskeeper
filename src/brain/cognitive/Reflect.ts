import type { BaseAgent } from '../../BaseAgent';
import { BaseLLM } from '../BaseLLM';
import { buildReflectSystemPrompt, buildReflectUserMessage } from '../../config/prompts';

export class Reflect {
    private llm: BaseLLM;

    constructor() {
        this.llm = new BaseLLM();
    }

    public async reflect(agent: BaseAgent): Promise<string | undefined> {
        
        // Generate reflection using LLM
        const messages = [
            {
                role: "system" as const,
                content: buildReflectSystemPrompt()
            },
            {
                role: "user" as const,
                content: buildReflectUserMessage(agent)
            }
        ];

        const reflection = await this.llm.generate(messages);
        return reflection;
    }
} 