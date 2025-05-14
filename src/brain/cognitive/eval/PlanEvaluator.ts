import { BaseEvaluator, type EvaluationResult } from "./BaseEvaluator";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import * as Constants from "../../../config/constants";
import { buildPlanEvaluationPrompt } from "../../../config/prompts";

export class PlanEvaluator extends BaseEvaluator {
  async evaluateWithRetry(messages: ChatCompletionMessageParam[]): Promise<EvaluationResult> {
    return this.handleRetries(messages);
  }

  protected async evaluate(messages: ChatCompletionMessageParam[]): Promise<EvaluationResult> {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.content) {
      return {
        accepted: false,
        feedback: "No content to evaluate"
      };
    }

    // Construct evaluation messages
    const evaluationMessages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: buildPlanEvaluationPrompt()
      },
      {
        role: "user",
        content: `Please evaluate this planning response:\n\n${lastMessage.content}`
      }
    ];

    // Get evaluation from LLM
    const evaluationResponse = await this.llm.generate(evaluationMessages);
    if (!evaluationResponse) {
      return {
        accepted: false,
        feedback: "Failed to get evaluation response"
      };
    }

    return this.parseEvaluationResponse(evaluationResponse);
  }

  validateFormat(messages: ChatCompletionMessageParam[]): boolean {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content || typeof lastMessage.content !== 'string') {
      return false;
    }

    const content = lastMessage.content;

    // Check for monologue tag
    const hasMonologue = /<monologue>.*?<\/monologue>/s.test(content);
    
    // Check for action tag with plan_harvest
    const hasAction = /<action type="plan_harvest">.*?<\/action>/s.test(content);

    // Check order - monologue should come before action
    const monologueIndex = content.indexOf('<monologue>');
    const actionIndex = content.indexOf('<action type="plan_harvest">');

    return hasMonologue && hasAction && monologueIndex < actionIndex;
  }

  validateContent(messages: ChatCompletionMessageParam[]): boolean {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content || typeof lastMessage.content !== 'string') {
      return false;
    }

    const content = lastMessage.content;

    // Extract harvest amount from action tag
    const actionMatch = content.match(/<action type="plan_harvest">\s*{\s*"amount"\s*:\s*(\d+)\s*}\s*<\/action>/);
    if (!actionMatch) {
      return false;
    }

    const harvestAmount = parseInt(actionMatch[1], 10);

    // Validate harvest amount
    if (isNaN(harvestAmount) || harvestAmount < 0) {
      return false;
    }

    // Check against lake capacity
    if (harvestAmount > Constants.SIMULATION_CONFIG.LAKE_CAPACITY) {
      return false;
    }

    return true;
  }
} 