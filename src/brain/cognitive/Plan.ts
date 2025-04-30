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
   * Now supports multiple actions in sequence.
   */
  private parseXmlResponse(text: string): PlanResult {
    let monologue = "";
    let actions: Array<{type: string, args?: Record<string, any>}> = [];
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

    // Extract all actions
    const actionRegex = /<action type="([^"]+)"(?:>({[\s\S]*?})<\/action>|><\/action>)/g;
    let actionMatch;
    while ((actionMatch = actionRegex.exec(text)) !== null) {
      const actionType = actionMatch[1];
      const actionArgs = actionMatch[2];
      
      if (actionType) {
        try {
          const action = {
            type: actionType,
            args: actionArgs ? JSON.parse(actionArgs) : undefined
          };
          actions.push(action);
        } catch (e) {
          console.error("Failed to parse action:", e);
        }
      }
    }

    // If no actions were found, provide a fallback
    if (actions.length === 0) {
      actions.push({
        type: "speak",
        args: { message: "I'm considering what to do next." }
      });
      reasoning = "Fallback due to parsing error";
    }

    // Return the first action as the main one, but include all actions in the args
    return {
      action: actions[0]?.type || "speak",
      args: actions[0] ? {
        ...(actions[0].args || {}),
        chainedActions: actions.slice(1)  // Include subsequent actions in the chain
      } : { message: "I'm considering what to do next." },
      reasoning,
      monologue: monologue || reasoning
    };
  }

  /**
   * Build the system prompt for the planning LLM
   */
  private buildPlanningSystemPrompt(): string {
    return `
You are the planning module for an AI agent in a video game.
You must never reveal your chain-of-thought publicly.
When you think internally, wrap that in <monologue>...</monologue>.

Always include your inner monologue before you take any actions.

To take actions, use one or more action tags:
<action type="XYZ">{...json args...}</action>

Each action must contain valid JSON with the required parameters.
If there are no arguments, you omit the {} empty object, like this:
<action type="XYZ"></action>

You may use multiple actions at once. For example, you can pathfind to a location and then start fishing:
<action type="pathfindTo">{"targetName": "Lake"}</action>
<action type="cast_rod"></action>

IMPORTANT RULES FOR MOVEMENT ACTIONS:
1. You cannot perform multiple movement-related actions at the same time (pathfindTo, follow)
2. Before starting a new movement action, you MUST stop your current movement:
   - If following someone, use: <action type="follow">{"targetPlayer": "player-name", "following": false}</action>
   - If pathfinding, wait until you arrive at your destination

Available actions include:
- speak: Say something to nearby agents or players (args: {message: string})
- pathfindTo: Move to a location (args: {targetName: string} or {position: {x, y, z}})
- follow: Follow an entity (args: {targetPlayer: string, following: boolean})
- gatherResource: Collect a resource (args: {resourceType: string})
- useItem: Use an item from inventory (args: {itemName: string})
- cast_rod: Start fishing (no arguments needed)

Be sure to use the action format perfectly with the correct XML tags.
Many tasks will require you to chain action calls. Moving to a location and then starting an activity is a common example.

You are given information about the world around you, and about your current state.
You should use this information to decide what to do next.

Depending on your current state, you might need to take certain actions before you continue.
For example, if you are following a player but you want to pathfind to a different location,
you should first stop following the player, then call your pathfinding action.

Make your decisions based on:
1. The current state of the agent (energy, inventory, etc.)
2. The environment trigger that initiated this planning
3. Nearby entities that might be interacted with
4. Recent memories and past experiences`;
  }

  /**
   * Get the scratch memory
   */
  getScratchMemory(): ScratchMemory {
    return this.scratchMemory;
  }
} 