import { BaseEvaluator, type EvaluationResult } from "./BaseEvaluator";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { buildReflectEvaluationPrompt } from "../../../config/prompts";

export class ReflectEvaluator extends BaseEvaluator {
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
        content: buildReflectEvaluationPrompt()
      },
      {
        role: "user",
        content: `Please evaluate this reflection:\n\n${lastMessage.content}`
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

    // Check for numbered points format
    const hasNumberedPoints = /\d+\.\s+.*(\n|$)/.test(content);

    // Should have at least 3 points
    const pointCount = (content.match(/\d+\.\s+/g) || []).length;
    
    return hasNumberedPoints && pointCount >= 3;
  }

  validateContent(messages: ChatCompletionMessageParam[]): boolean {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content || typeof lastMessage.content !== 'string') {
      return false;
    }

    const content = lastMessage.content.toLowerCase();

    // Check for required topics
    const hasLakeSustainability = content.includes('lake') && 
      (content.includes('sustainability') || content.includes('health') || content.includes('stock'));
    
    const hasPerformance = content.includes('performance') || 
      content.includes('harvest') || content.includes('success');
    
    const hasGroupDynamics = content.includes('group') || 
      content.includes('cooperation') || content.includes('competition');
    
    const hasStrategy = content.includes('strategy') || 
      content.includes('plan') || content.includes('adjust');

    return hasLakeSustainability && hasPerformance && hasGroupDynamics && hasStrategy;
  }
} 