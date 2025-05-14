import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { BaseAgent } from "../../../BaseAgent";
import type { GameWorld } from "../../../types/GameState";
import { BaseLLM } from "../../BaseLLM";

export interface EvaluationResult {
  accepted: boolean;
  feedback?: string;
  score?: number;
  attempt?: number;
  isLastAttempt?: boolean;
}

export abstract class BaseEvaluator {
  protected agent: BaseAgent;
  protected world: GameWorld;
  protected llm: BaseLLM;
  protected MAX_ATTEMPTS = 3;

  constructor(agent: BaseAgent, world: GameWorld) {
    this.agent = agent;
    this.world = world;
    this.llm = new BaseLLM();
  }

  /**
   * Evaluates a proposed solution/action using LLM with retry logic
   * @param messages The messages to evaluate
   * @returns EvaluationResult indicating if the solution is accepted and any feedback
   */
  abstract evaluateWithRetry(messages: ChatCompletionMessageParam[]): Promise<EvaluationResult>;

  /**
   * Single evaluation attempt
   * @param messages The messages to evaluate
   * @returns EvaluationResult for this attempt
   */
  protected abstract evaluate(messages: ChatCompletionMessageParam[]): Promise<EvaluationResult>;

  /**
   * Cleans the LLM response to extract just the JSON object
   * @param response The raw LLM response
   * @returns Cleaned response containing only the JSON object
   */
  protected cleanResponse(response: string): string {
    // Remove any markdown code block markers
    response = response.replace(/```json\n?|\n?```/g, '');
    
    // Find the first { and last } to extract just the JSON object
    const start = response.indexOf('{');
    const end = response.lastIndexOf('}');
    
    if (start === -1 || end === -1) {
      console.log('No JSON object found in response:', response);
      return '{}';
    }
    
    return response.slice(start, end + 1);
  }

  /**
   * Parses LLM evaluation response into EvaluationResult
   * @param response The LLM response string
   * @returns Parsed EvaluationResult
   */
  protected parseEvaluationResponse(response: string): EvaluationResult {
    try {
      // Clean the response before parsing
      const cleanedResponse = this.cleanResponse(response);
      console.log('Cleaned response:', cleanedResponse);
      
      const result = JSON.parse(cleanedResponse);
      
      // Validate the parsed result has required fields
      if (typeof result.accepted !== 'boolean') {
        throw new Error('Missing or invalid "accepted" field');
      }
      
      return {
        accepted: result.accepted === true,
        feedback: result.feedback || 'No feedback provided',
        score: result.accepted && typeof result.score === 'number' ? result.score : undefined
      };
    } catch (e: any) {
      console.error("Failed to parse evaluation response:", e);
      console.error("Original response:", response);
      return {
        accepted: false,
        feedback: `Failed to parse evaluation response: ${e.message || 'Unknown error'}`
      };
    }
  }

  /**
   * Handles retry logic for evaluation
   * @param messages The messages to evaluate
   * @returns EvaluationResult after retries
   */
  protected async handleRetries(messages: ChatCompletionMessageParam[]): Promise<EvaluationResult> {
    let lastResult: EvaluationResult | undefined;
    
    for (let attempt = 1; attempt <= this.MAX_ATTEMPTS; attempt++) {
      console.log(`${this.agent.name} Evaluation attempt ${attempt}/${this.MAX_ATTEMPTS}`);
      
      const result = await this.evaluate(messages);
      lastResult = { ...result, attempt };
      
      if (result.accepted) {
        console.log(`${this.agent.name} Response accepted on attempt ${attempt}`);
        return lastResult;
      }
      
      console.log(`${this.agent.name} Attempt ${attempt} failed:`, result.feedback);
      
      // If this was the last attempt, return the result but mark it as accepted
      if (attempt === this.MAX_ATTEMPTS) {
        console.log(`${this.agent.name} All attempts failed, using last response`);
        return {
          ...lastResult,
          accepted: true,
          isLastAttempt: true,
          feedback: `All ${this.MAX_ATTEMPTS} attempts failed. Using last response. Original feedback: ${result.feedback}`
        };
      }
    }

    // This should never happen due to the return in the loop
    return {
      accepted: false,
      feedback: "Unexpected error in retry logic"
    };
  }

  /**
   * Validates that the response follows required format/structure
   * @param messages The messages to validate
   * @returns true if format is valid, false otherwise
   */
  abstract validateFormat(messages: ChatCompletionMessageParam[]): boolean;

  /**
   * Evaluates the content/logic of the response
   * @param messages The messages to evaluate
   * @returns true if content is valid, false otherwise
   */
  abstract validateContent(messages: ChatCompletionMessageParam[]): boolean;
} 