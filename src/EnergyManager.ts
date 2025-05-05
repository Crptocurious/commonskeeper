import { logEvent } from "./logger";
import type { EnergyState } from "./types/AgentState";
import { UIService } from "./services/UIService";
import type { BaseAgent } from "./BaseAgent";
import { SIMULATION_CONFIG, TIME_CONFIG } from "./config/constants";

export class EnergyManager {
    private currentEnergy: number;
    readonly maxEnergy: number;
    readonly decayRate: number;
    private lastUpdateTick: number;
    private agent?: BaseAgent;
    
    constructor(
        maxEnergy: number = SIMULATION_CONFIG.MAX_ENERGY,
        // Calculate decay rate to deplete energy over approximately 6 cycles
        decayRate: number = SIMULATION_CONFIG.MAX_ENERGY / (TIME_CONFIG.TICKS_PER_MINUTE * 60),
        agent?: BaseAgent
    ) {
        this.maxEnergy = maxEnergy;
        this.decayRate = decayRate;
        this.currentEnergy = this.maxEnergy;
        this.lastUpdateTick = 0;
        this.agent = agent;
    }

    /**
     * Applies one tick of energy decay.
     */
    decay(tick: number): void {
        if (this.currentEnergy <= 0) return;

        const previousEnergy = this.currentEnergy;
        this.currentEnergy -= this.decayRate;

        // Clamp to zero if the result is very close to zero or negative
        const epsilon = 1e-9;
        if (this.currentEnergy <= epsilon) {
            this.currentEnergy = 0;
        }

        this.lastUpdateTick = tick;

        // If energy changed and we have an agent with world reference, update UI
        if (this.currentEnergy !== previousEnergy) {
            this.updateUI();
        }
    }

    /**
     * Gains a specified amount of energy, capped at maxEnergy.
     */
    gainEnergy(amount: number, tick: number): void {
        if (amount <= 0) return;

        const previousEnergy = this.currentEnergy;
        this.currentEnergy += amount;
        if (this.currentEnergy > this.maxEnergy) {
            this.currentEnergy = this.maxEnergy;
        }
        this.lastUpdateTick = tick;

        // If energy changed and we have an agent with world reference, update UI
        if (this.currentEnergy !== previousEnergy) {
            this.updateUI();
        }
    }

    /**
     * Gets the current energy state.
     */
    getState(): EnergyState {
        return {
            currentEnergy: this.currentEnergy,
            maxEnergy: this.maxEnergy,
            isDepleted: this.currentEnergy <= 0,
            lastUpdateTick: this.lastUpdateTick,
        };
    }

    /**
     * Sets the agent reference for UI updates
     */
    setAgent(agent: BaseAgent): void {
        this.agent = agent;
    }

    /**
     * Updates the UI if an agent is available
     */
    private updateUI(): void {
        if (this.agent?.world) {
            UIService.sendAgentEnergyUpdate(this.agent.world, this.agent);
        } else {
            console.warn('Energy changed but no agent available for UI updates');
        }
    }
} 