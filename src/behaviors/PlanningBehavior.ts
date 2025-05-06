import type { World } from "hytopia";
import type { AgentBehavior, BaseAgent } from "../BaseAgent";
import type { GameWorld } from "../types/GameState";
import { logEvent } from "../logger";
import { TIME_CONFIG, DERIVED_TIME_CONFIG } from "../config/constants";
import { UIService } from "../services/UIService";

/**
 * Behavior responsible for processing harvest plans made during the PLANNING phase.
 */
export class PlanningBehavior implements AgentBehavior {
    // Static Map to track last trigger time for each agent across all instances
    private static lastTriggerTimes: Map<string, number> = new Map();
    private static lastMonologueUpdateTimes: Map<string, number> = new Map();
    private static harvestPlanSetTimes: Map<string, number> = new Map();
    
    // Configuration flags
    private readonly ENABLE_DELAYS = true; // Set to false to disable all timing delays
    
    // Timing constants (in ticks)
    private readonly TIMINGS = {
        TRIGGER_INTERVAL: Math.floor(DERIVED_TIME_CONFIG.planningDurationTicks / 10),
        MONOLOGUE_UPDATE_INTERVAL: TIME_CONFIG.TICKS_PER_SECOND * 10,
        INITIAL_WAIT: TIME_CONFIG.TICKS_PER_SECOND * 30
    };

    private shouldUpdate(currentTick: number, lastUpdateTime: number, interval: number): boolean {
        if (!this.ENABLE_DELAYS) return true;
        return (currentTick - lastUpdateTime) >= interval;
    }

    onUpdate(agent: BaseAgent, world: GameWorld): void {
        // Only process during PLANNING phase
        if (agent.currentAgentPhase !== 'PLANNING') {
            return;
        }

        // Check if we need to trigger harvest planning
        if (agent.plannedHarvestAmount === null) {
            const lastTriggerTime = PlanningBehavior.lastTriggerTimes.get(agent.name);
            
            // If no previous trigger, trigger immediately
            if (!lastTriggerTime) {
                console.log(`${agent.name} triggered initially at tick ${world.currentTick}`);
                agent.handleEnvironmentTrigger("It's time to plan your harvest amount for this cycle.");
                PlanningBehavior.lastTriggerTimes.set(agent.name, world.currentTick);
                return;
            }

            // For subsequent triggers, use the interval
            if (this.shouldUpdate(world.currentTick, lastTriggerTime, this.TIMINGS.TRIGGER_INTERVAL)) {
                console.log(`${agent.name} triggered at tick ${world.currentTick}`);
                agent.handleEnvironmentTrigger("It's time to plan your harvest amount for this cycle.");
                PlanningBehavior.lastTriggerTimes.set(agent.name, world.currentTick);
            }
        } else {
            const planSetTime = PlanningBehavior.harvestPlanSetTimes.get(agent.name) || 0;
            const lastUpdateTime = PlanningBehavior.lastMonologueUpdateTimes.get(agent.name) || 0;

            // Check if we've waited long enough after setting the plan
            if (this.shouldUpdate(world.currentTick, planSetTime, this.TIMINGS.INITIAL_WAIT) &&
                this.shouldUpdate(world.currentTick, lastUpdateTime, this.TIMINGS.MONOLOGUE_UPDATE_INTERVAL)) {
                
                const remainingTicks = this.getRemainingTicksInPhase(world.currentTick);
                if (remainingTicks > 0) {
                    const remainingSeconds = Math.floor(remainingTicks / TIME_CONFIG.TICKS_PER_SECOND);
                    const message = `I have decided to harvest ${agent.plannedHarvestAmount} fish. I will wait for ${remainingSeconds} seconds until the harvesting phase begins.`;
                    
                    // Only update if message changed
                    if (message !== agent.getLastMonologue()) {
                        agent.addInternalMonologue(message);
                        
                        // Update UI for all players
                        const playerEntities = world.entityManager.getAllPlayerEntities();
                        playerEntities.forEach(playerEntity => {
                            if (playerEntity?.player) {
                                UIService.sendAgentThoughts(playerEntity.player, world.agents);
                            }
                        });
                        
                        PlanningBehavior.lastMonologueUpdateTimes.set(agent.name, world.currentTick);
                    }
                }
            }
        }
    }

    getPromptInstructions(): string {
        return ``; 
    }

    getState(): string {
        return "Ready to process plans";
    }

    private getRemainingTicksInPhase(currentTick: number): number {
        const ticksInCurrentCycle = currentTick % DERIVED_TIME_CONFIG.totalCycleTicks;
        if (ticksInCurrentCycle < DERIVED_TIME_CONFIG.planningDurationTicks) {
            return DERIVED_TIME_CONFIG.planningDurationTicks - ticksInCurrentCycle;
        }
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

            // Store the plan and record when it was set
            agent.plannedHarvestAmount = amount;
            PlanningBehavior.harvestPlanSetTimes.set(agent.name, world.currentTick);
            console.log(`${agent.name} planned to harvest ${amount}`);
            
            logEvent({
                type: "agent_plan_harvest",
                agentId: agent.id,
                agentName: agent.name,
                plannedAmount: amount,
                tick: world.currentTick,
                phase: agent.currentAgentPhase
            });

            return `Harvest plan set to ${amount}.`;
        }
    }
} 