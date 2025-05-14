import type { BaseAgent } from '../../BaseAgent';
import { BaseLLM } from '../BaseLLM';
import { buildReflectSystemPrompt, buildReflectUserMessage } from '../../config/prompts';
import { ReflectEvaluator } from './eval';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export class Reflect {
    private llm: BaseLLM;
    private evaluator: ReflectEvaluator;

    constructor() {
        this.llm = new BaseLLM();
        this.evaluator = new ReflectEvaluator(null as any, null as any); // Will be initialized with proper values during reflection
    }

    public async reflect(agent: BaseAgent): Promise<string | undefined> {
        // Initialize evaluator with current context
        this.evaluator = new ReflectEvaluator(agent, agent.getGameWorld());
        
        // Generate reflection using LLM
        const messages: ChatCompletionMessageParam[] = [
            {
                role: "system",
                content: buildReflectSystemPrompt()
            },
            {
                role: "user",
                content: buildReflectUserMessage(agent)
            }
        ];

        const reflection = await this.llm.generate(messages);
        if (!reflection) return;

        // Add response to messages for evaluation
        messages.push({
            role: "assistant",
            content: reflection
        });

        // Evaluate response with retries
        const evaluationResult = await this.evaluator.evaluateWithRetry(messages);
        
        if (!evaluationResult.accepted) {
            console.log(`${agent.name} Reflection rejected:`, evaluationResult.feedback);
            return;
        }

        if (evaluationResult.isLastAttempt) {
            console.log(`${agent.name} Using last attempt reflection after ${evaluationResult.attempt} failed attempts`);
        } else {
            console.log(`${agent.name} Reflection accepted with score:`, evaluationResult.score);
        }

        return reflection;
    }
} 