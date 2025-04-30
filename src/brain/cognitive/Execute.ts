import { World } from "hytopia";
import type { BaseAgent } from "../../BaseAgent";
import type { PlanResult } from "./Plan";
import { logEvent } from "../../logger";

export class Execute {
  /**
   * Execute a planned action on the agent
   */
  executeAction(agent: BaseAgent, world: World, plan: PlanResult): void {
    const { action, args } = plan;
    
    try {
      // Log execution attempt
      logEvent({
        type: "agent_executing_action",
        agentId: agent.id,
        agentName: agent.name,
        action,
        args
      });
      
      // Execute the action via agent's handleToolCall method
      agent.handleToolCall(action, args);
      
      // Log successful execution
      logEvent({
        type: "agent_action_success",
        agentId: agent.id,
        agentName: agent.name,
        action,
      });
    } catch (error) {
      console.error(`Error executing action ${action}:`, error);
      
      // Log failed execution
      logEvent({
        type: "agent_action_error",
        agentId: agent.id,
        agentName: agent.name,
        action,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Fallback behavior in case of error - simple message
      try {
        agent.handleToolCall("speak", {
          message: `I tried to ${action} but something went wrong.`
        });
      } catch (fallbackError) {
        console.error("Even fallback action failed:", fallbackError);
      }
    }
  }
  
  /**
   * Chain multiple actions together in sequence
   * Useful for more complex behaviors
   */
  async executeActionChain(
    agent: BaseAgent,
    world: World,
    plans: PlanResult[]
  ): Promise<void> {
    for (const plan of plans) {
      this.executeAction(agent, world, plan);
      
      // Small delay between actions to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
} 