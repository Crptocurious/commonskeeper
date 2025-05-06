import type { World } from "hytopia";
import type { AgentBehavior, BaseAgent } from "../BaseAgent";
import type { GameWorld } from "../types/GameState";
import { logEvent } from "../logger";
import { TIME_CONFIG, DERIVED_TIME_CONFIG } from "../config/constants";

/**
 * Behavior responsible for processing harvest plans made during the PLANNING phase.
 */
export class PlanningBehavior implements AgentBehavior {
    // Static Map to track last trigger time for each agent across all instances
    private static lastTriggerTimes: Map<string, number> = new Map();
    // Static Map to track last monologue update time for each agent
    private static lastMonologueUpdateTimes: Map<string, number> = new Map();
    // Minimum wait time between triggers (planning phase duration / 10)
    private readonly TRIGGER_COOLDOWN = Math.floor(DERIVED_TIME_CONFIG.planningDurationTicks / 10);
    // Update monologue every 5 seconds
    private readonly MONOLOGUE_UPDATE_COOLDOWN = TIME_CONFIG.TICKS_PER_SECOND * 5;

    onUpdate(agent: BaseAgent, world: GameWorld): void {
        // Only process during PLANNING phase
        if (agent.currentAgentPhase !== 'PLANNING') {
            return;
        }

        // Check if we need to trigger harvest planning
        if (agent.plannedHarvestAmount === null) {
            const lastTriggerTime = PlanningBehavior.lastTriggerTimes.get(agent.name);
            
            // If no previous trigger or last trigger was 0, trigger immediately
            if (!lastTriggerTime) {
                agent.handleEnvironmentTrigger("It's time to plan your harvest amount for this cycle.");
                PlanningBehavior.lastTriggerTimes.set(agent.name, world.currentTick);
                return;
            }

            // Otherwise check cooldown
            const timeSinceLastTrigger = world.currentTick - lastTriggerTime;
            if (timeSinceLastTrigger >= this.TRIGGER_COOLDOWN) {
                agent.handleEnvironmentTrigger("It's time to plan your harvest amount for this cycle.");
                PlanningBehavior.lastTriggerTimes.set(agent.name, world.currentTick);
            }
        } else {
            // Check if enough time has passed since last monologue update
            const lastUpdateTime = PlanningBehavior.lastMonologueUpdateTimes.get(agent.name) || 0;
            const timeSinceLastUpdate = world.currentTick - lastUpdateTime;
            
            // Only update if we have a valid planned amount and enough time has passed
            if (timeSinceLastUpdate >= this.MONOLOGUE_UPDATE_COOLDOWN && 
                typeof agent.plannedHarvestAmount === 'number' && 
                !isNaN(agent.plannedHarvestAmount)) {
                
                // Calculate remaining time
                const remainingTicks = this.getRemainingTicksInPhase(world.currentTick);
                if (remainingTicks > 0) {  // Only update if we have remaining time
                    const remainingSeconds = Math.floor(remainingTicks / TIME_CONFIG.TICKS_PER_SECOND);
                    const message = `I have decided to harvest ${agent.plannedHarvestAmount} fish. I will wait for ${remainingSeconds} seconds until the harvesting phase begins.`;
                    
                    // Only update if the message would be different (avoid unnecessary updates)
                    const currentMonologue = agent.getLastMonologue();
                    if (currentMonologue !== message) {
                        agent.addInternalMonologue(message);
                        console.log(`Updated ${agent.name}'s monologue:`, message); // Debug log
                        PlanningBehavior.lastMonologueUpdateTimes.set(agent.name, world.currentTick);
                    }
                }
            }
        }
    }

    getPromptInstructions(): string {
        // Instructions for this action are included in the main agent prompt
        return ``; 
    }

    getState(): string {
        // Could return the current planned amount if desired
        return "Ready to process plans";
    }

    private getRemainingTicksInPhase(currentTick: number): number {
        const ticksInCurrentCycle = currentTick % DERIVED_TIME_CONFIG.totalCycleTicks;
        // If we're in planning phase, ticksInCurrentCycle will be less than planningDurationTicks
        // So remaining ticks is just planningDurationTicks minus how far we are into the cycle
        if (ticksInCurrentCycle < DERIVED_TIME_CONFIG.planningDurationTicks) {
            return DERIVED_TIME_CONFIG.planningDurationTicks - ticksInCurrentCycle;
        }
        // If we're not in planning phase, something went wrong (this shouldn't happen due to phase checks)
        console.warn("Calculating remaining ticks while not in planning phase");
        return 0;
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