import { World } from "hytopia";
import type { AgentBehavior, BaseAgent } from "../BaseAgent";
import { logEvent } from "../logger"; 
import { MAX_ENERGY, ENERGY_PER_FISH, LOW_ENERGY_THRESHOLD } from "../../index"; // Adjust path if constants are moved

/**
 * Autonomous behavior for Agents to eat fish when their energy is low.
 */
export class EatBehavior implements AgentBehavior {

    // EatBehavior is autonomous, doesn't need LLM instructions
    getPromptInstructions(): string {
        return ""; // No specific LLM action needed to trigger eating
    }

    // No persistent state to report
    getState(): string {
        return "";
    }

    // Not driven by tool calls
    onToolCall(agent: BaseAgent, world: World, toolName: string, args: any): string | void {
        // No tool calls handled by this behavior
    }

    /**
     * Called every tick. Checks if the agent should eat.
     */
    onUpdate(agent: BaseAgent, world: World): void {
        const energyState = agent.energyManager.getState(); // Corrected: Access energyManager directly
        const inventory = agent.getInventory();
        const fishItem = inventory.get('fish');
        const fishCount = fishItem ? fishItem.quantity : 0;

        // Check if agent needs energy and has fish
        if (energyState.currentEnergy < LOW_ENERGY_THRESHOLD && fishCount > 0) {
            
            // Consume one fish
            const consumed = agent.removeFromInventory('fish', 1);

            if (consumed) {
                 // Calculate energy gain (don't exceed max)
                const energyGained = Math.min(ENERGY_PER_FISH, MAX_ENERGY - energyState.currentEnergy);
                
                // Add energy via the agent's method (which should handle EnergyManager interaction)
                agent.gainEnergy(energyGained); 
                
                const newEnergyState = agent.energyManager.getState(); // Corrected: Get updated state from energyManager
                const fishRemaining = agent.getInventory().get('fish')?.quantity || 0;

                 // Log the event
                logEvent({
                    type: 'AGENT_EAT',
                    agentId: agent.id,
                    agentName: agent.name,
                    energyGained: energyGained, // Log actual gain
                    newEnergy: newEnergyState.currentEnergy,
                    fishRemaining: fishRemaining,
                    tick: (world as any).currentTimeTicks // Add tick if possible
                });
                console.log(`${agent.name} ate a fish. Energy: ${newEnergyState.currentEnergy}. Fish left: ${fishRemaining}`);
                
                // Maybe trigger an environment event for the LLM?
                // agent.handleEnvironmentTrigger("You felt hungry and ate a fish, restoring some energy.");

            } else {
                 console.warn(`${agent.name} tried to eat fish but removeFromInventory failed.`);
                 // Maybe trigger an environment event?
                 // agent.handleEnvironmentTrigger("You tried to eat a fish but couldn't find one in your inventory.");
            }
        }
    }
} 