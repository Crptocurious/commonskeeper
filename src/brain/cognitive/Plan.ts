import { World } from "hytopia";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/src/resources/index.js";
import type { BaseAgent } from "../../BaseAgent";
import { ScratchMemory } from "../memory/ScratchMemory";
import { logEvent } from "../../logger";

export interface PlanResult {
  action: string;
  args: Record<string, any>;
  reasoning: string;
  monologue?: string; // Internal thought process
}

export class Plan {
  private openai: OpenAI;
  private planningHistory: ChatCompletionMessageParam[] = [];
  private scratchMemory: ScratchMemory;

  constructor(agentId: string) {
    this.openai = new OpenAI({
      baseURL: process.env.OPENAI_API_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.scratchMemory = new ScratchMemory(agentId);
  }

  /**
   * Plan what to do next based on an environment trigger
   */
  async planNextAction(
    agent: BaseAgent,
    world: World,
    trigger: string
  ): Promise<PlanResult> {
    // Retrieve agent state and context
    const agentState = agent.getCurrentState();
    const nearbyEntities = agent.getNearbyEntities().map((e) => ({
      name: e.name,
      type: e.type,
      distance: e.distance,
    }));

    // Get memory data
    const memories = this.scratchMemory.getRecentMemories();
    
    // Build the system prompt
    if (this.planningHistory.length === 0) {
      this.planningHistory.push({
        role: "system",
        content: this.buildPlanningSystemPrompt(),
      });
    }

    // Build the user message with context
    const userMessage = `
      Environment Trigger: ${trigger}
      
      Agent State: ${JSON.stringify(agentState)}
      
      Nearby Entities: ${JSON.stringify(nearbyEntities)}
      
      Recent Memories: ${JSON.stringify(memories)}
      
      Think through what the agent should do next. Include your thought process in <monologue> tags.
      Then return your decision as valid JSON wrapped in <action> tags.
    `;

    this.planningHistory.push({ role: "user", content: userMessage });

    try {
      // Call the OpenAI API
      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
        messages: this.planningHistory,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message;
      if (!response || !response.content) {
        throw new Error("No response from AI planning system");
      }

      // Parse the XML response to extract monologue and action
      const result = this.parseXmlResponse(response.content);

      // Add the assistant's response to history
      this.planningHistory.push(response);

      // Store the plan in memory
      this.scratchMemory.addMemory({
        type: "plan",
        content: result,
        timestamp: Date.now(),
      });

      // Log the planning event
      logEvent({
        type: "agent_planning",
        agentId: this.scratchMemory.getSelfId(),
        trigger,
        action: result.action,
        hasMonologue: !!result.monologue
      });

      return result;
    } catch (error) {
      console.error("Error in AI planning:", error);
      // Return a fallback plan if there's an error
      return {
        action: "speak",
        args: { message: "I'm thinking about what to do next." },
        reasoning: "Fallback plan due to AI planning error",
      };
    }
  }

  /**
   * Parse the LLM's response for <monologue> and <action> tags.
   */
  private parseXmlResponse(text: string): PlanResult {
    let monologue = "";
    let action = "";
    let args = {};
    let reasoning = "Default reasoning";

    // Extract monologue
    const monologueRegex = /<monologue>([\s\S]*?)<\/monologue>/g;
    let monologueMatch;
    while ((monologueMatch = monologueRegex.exec(text)) !== null) {
      const thought = monologueMatch[1]?.trim();
      if (thought) {
        monologue = thought;
      }
    }

    // Extract action with JSON
    const actionRegex = /<action>([\s\S]*?)<\/action>/g;
    let actionMatch;
    while ((actionMatch = actionRegex.exec(text)) !== null) {
      const actionBody = actionMatch[1]?.trim();
      if (actionBody) {
        try {
          const parsed = JSON.parse(actionBody);
          action = parsed.action || "speak";
          args = parsed.args || {};
          reasoning = parsed.reasoning || "No reasoning provided";
        } catch (e) {
          console.error("Failed to parse action JSON:", e);
        }
      }
    }

    // If no action was found in the correct format, try to extract just JSON
    if (!action) {
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          action = parsed.action || "speak";
          args = parsed.args || {};
          reasoning = parsed.reasoning || "No reasoning provided";
        }
      } catch (e) {
        console.error("Failed to parse JSON fallback:", e);
      }
    }

    // If still no action, provide a fallback
    if (!action) {
      action = "speak";
      args = { message: "I'm considering what to do next." };
      reasoning = "Fallback due to parsing error";
    }

    return {
      action,
      args,
      reasoning,
      monologue: monologue || reasoning, // Use reasoning as fallback monologue
    };
  }

  /**
   * Build the system prompt for the planning LLM
   */
  private buildPlanningSystemPrompt(): string {
    return `
    You are the planning module for an AI agent in a virtual world. 
    Your job is to decide what action the agent should take next.
    
    Based on the agent's current state, nearby entities, and recent memories,
    you will decide the most appropriate next action.
    
    IMPORTANT: First think through your reasoning within <monologue> tags.
    Then provide your decision as a JSON object wrapped in <action> tags.
    
    Example:
    <monologue>
    I see the agent's energy is low at 30%, and there's a lake nearby with fish.
    The agent should go to the lake to fish and restore energy.
    </monologue>
    
    <action>
    {
      "action": "pathfindTo",
      "args": {
        "targetName": "Lake"
      },
      "reasoning": "The agent needs to replenish energy and the lake has fish."
    }
    </action>
    
    The JSON object should have these fields:
    - action: The name of the action to take (must be a valid action in the game)
    - args: An object containing any arguments needed for the action
    - reasoning: A brief explanation of why you chose this action
    
    Available actions include:
    - speak: Say something to nearby agents or players (args: {message: string})
    - pathfindTo: Move to a location (args: {targetName: string} or {position: {x, y, z}})
    - follow: Follow an entity (args: {targetPlayer: string, following: boolean})
    - gatherResource: Collect a resource (args: {resourceType: string})
    - useItem: Use an item from inventory (args: {itemName: string})
    
    Make your decision based on:
    1. The current state of the agent (energy, inventory, etc.)
    2. The environment trigger that initiated this planning
    3. Nearby entities that might be interacted with
    4. Recent memories and past experiences
    `;
  }

  /**
   * Get the scratch memory
   */
  getScratchMemory(): ScratchMemory {
    return this.scratchMemory;
  }
} 