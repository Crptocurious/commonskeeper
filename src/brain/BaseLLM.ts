import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/src/resources/index.js";

export class BaseLLM {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({
            baseURL: process.env.OPENAI_API_BASE_URL,
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    public async generate(messages: ChatCompletionMessageParam[]): Promise<string | undefined> {
        try {
            const completion = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: messages,
                temperature: 0.7,
            });

            const content = completion.choices[0]?.message?.content;
            return content ?? undefined;
        } catch (error) {
            console.error("OpenAI API error:", error);
            return undefined;
        }
    }
} 