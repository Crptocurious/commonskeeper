import { logEvent } from "./logger";

export interface EnergyState {
    currentEnergy: number;
    maxEnergy: number;
    isDepleted: boolean;
}

export class EnergyManager {
    private currentEnergy: number;
    readonly maxEnergy: number;
    readonly decayRate: number;

    constructor(maxEnergy: number = 100, decayRate: number = 0.001) {
        this.maxEnergy = maxEnergy;
        this.decayRate = decayRate;
        this.currentEnergy = this.maxEnergy; // Start full
    }

    /**
     * Applies one tick of energy decay.
     */
    decayTick(): void {
        if (this.currentEnergy <= 0) return; // No decay if already depleted

        const previousEnergy = this.currentEnergy;
        this.currentEnergy -= this.decayRate;

        // Clamp to zero if the result is very close to zero or negative
        const epsilon = 1e-9; // A small tolerance for floating point checks
        if (this.currentEnergy <= epsilon) {
            this.currentEnergy = 0;
        }

        // Log only if energy actually changed
        if (this.currentEnergy !== previousEnergy) {
           // Note: Logging agent ID/Name here would require passing it in
           // For now, keep logging agent-specific to BaseAgent
           // logEvent({ type: "energy_decay", ... });
        }
    }

    /**
     * Gains a specified amount of energy, capped at maxEnergy.
     * @param amount The amount of energy to gain.
     */
    gainEnergy(amount: number): void {
        if (amount <= 0) return;

        const previousEnergy = this.currentEnergy;
        this.currentEnergy += amount;
        if (this.currentEnergy > this.maxEnergy) {
            this.currentEnergy = this.maxEnergy;
        }
        // Note: Logging agent ID/Name here would require passing it in
        // For now, keep logging agent-specific to BaseAgent
        // if (this.currentEnergy !== previousEnergy) {
        //    logEvent({ type: "energy_gain", ... });
        // }
    }

    /**
     * Gets the current energy state.
     * @returns An object containing energy details.
     */
    getState(): EnergyState {
        return {
            currentEnergy: this.currentEnergy,
            maxEnergy: this.maxEnergy,
            isDepleted: this.currentEnergy <= 0,
        };
    }
} 