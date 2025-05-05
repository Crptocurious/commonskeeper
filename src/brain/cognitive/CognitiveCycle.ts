import type { BaseAgent } from '../../BaseAgent';
import { Reflect } from './Reflect';
import { Plan } from './Plan';
import type { ChatOptions } from './Plan';
import { REFLECTION_CONFIG } from '../../config/constants';

export class CognitiveCycle {
    private reflect: Reflect;
    private plan: Plan;
    private readonly REFLECTION_INTERVAL_TICKS: number = REFLECTION_CONFIG.REFLECTION_INTERVAL_TICKS;

    constructor(systemPrompt: string) {
        this.reflect = new Reflect();
        this.plan = new Plan(systemPrompt);
    }

    /**
     * Determines if reflection is needed based on:
     * 1. Time since last reflection (> 10 minutes)
     * 2. Phase changes
     */
    private shouldReflect(agent: BaseAgent): boolean {

        // Skip reflection during HARVEST phase
        if (agent.currentAgentPhase === 'HARVEST') {
            return false;
        }

        const currentTick = agent.currentAgentTick;
        const timeSinceLastReflection = currentTick - agent.lastReflectionTick;
        const phaseChanged = agent.currentAgentPhase !== agent.lastAgentPhase;

        return timeSinceLastReflection >= this.REFLECTION_INTERVAL_TICKS || phaseChanged;
    }

    /**
     * Execute a cognitive cycle:
     * 1. Determine if reflection is needed
     * 2. If needed, reflect on current state and recent history
     * 3. Use reflection insights (or original trigger) to inform planning
     */
    public async execute(agent: BaseAgent, trigger: string): Promise<void> {
        try {
            const currentTick = agent.currentAgentTick;
           
            const needsReflection = this.shouldReflect(agent);
            
            if (!needsReflection) {
                console.log(`${agent.name}: Skipping reflection - proceeding directly to planning`);
                // Skip reflection, proceed directly to planning
                this.plan.chat(agent, {
                    type: "Environment",
                    message: trigger
                });
                return;
            }

            console.log(`${agent.name}: Performing reflection at tick ${currentTick}`);
            // Perform reflection
            const reflection = await this.reflect.reflect(agent);
            
            // Update last reflection time
            agent.updateLastReflectionTick(currentTick);
            
            if (!reflection) {
                console.warn(`${agent.name}: Reflection failed to generate insights`);
                // Fall back to direct planning without reflection
                this.plan.chat(agent, {
                    type: "Environment",
                    message: trigger
                });
                return;
            }

            // Combine reflection with trigger for enhanced planning
            const enhancedTrigger = `
Current Reflection:
${reflection}

Original Trigger:
${trigger}

Consider the above reflection when deciding your next actions.`;

            // Forward to planning with enhanced context
            this.plan.chat(agent, {
                type: "Environment",
                message: enhancedTrigger
            });

        } catch (error) {
            console.error(`${agent.name}: Cognitive cycle error:`, error);
            // Fall back to direct planning without reflection
            this.plan.chat(agent, {
                type: "Environment",
                message: trigger
            });
        }
    }

    /**
     * Handle external chat messages through the cognitive cycle
     */
    public handleChat(agent: BaseAgent, options: ChatOptions): void {
        this.plan.chat(agent, options);
    }
} 