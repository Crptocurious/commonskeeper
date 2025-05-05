import type { World } from "hytopia";
import type { AgentBehavior, BaseAgent } from "../BaseAgent";
import type { GameWorld } from "../types/GameState";
import { logEvent } from "../logger";

/**
 * Behavior responsible for processing harvest plans made during the PLANNING phase.
 */
export class PlanningBehavior implements AgentBehavior {

    onUpdate(agent: BaseAgent, world: GameWorld): void {
        // This behavior is primarily reactive to tool calls
    }

    getPromptInstructions(): string {
        // Instructions for this action are included in the main agent prompt
        return ``; 
    }

    getState(): string {
        // Could return the current planned amount if desired
        return "Ready to process plans";
    }

    onToolCall(
        agent: BaseAgent,
        world: GameWorld,
        toolName: string,
        args: any
    ): string | void {
        if (toolName === "plan_harvest") {
            // Phase Check
            if (agent.currentAgentPhase !== 'PLANNING') {
                console.log(`${agent.name} tried to plan harvest during ${agent.currentAgentPhase} phase.`);
                return `You can only plan your harvest during the PLANNING phase. It is currently ${agent.currentAgentPhase}.`;
            }

            // Argument Validation
            const amount = args?.amount;
            if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0) {
                 console.warn(`${agent.name} provided invalid plan amount: ${amount}`);
                return `Invalid harvest plan amount. Please provide a non-negative integer amount (e.g., { "amount": 2 }).`;
            }

            // Store the plan
            agent.plannedHarvestAmount = amount;
            console.log(`${agent.name} planned to harvest ${amount}`);
            
             logEvent({
                type: "agent_plan_harvest",
                agentId: agent.id,
                agentName: agent.name,
                plannedAmount: amount,
                tick: world.currentTick,
                phase: agent.currentAgentPhase
            });

            // Return confirmation to the agent
            return `Harvest plan set to ${amount}.`;
        }
    }
} 