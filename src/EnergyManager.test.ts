import { describe, it, expect, beforeEach } from "bun:test";
import { EnergyManager } from "./EnergyManager";

describe("EnergyManager Simulation", () => {
    let energyManager: EnergyManager;
    const maxEnergy = 100;
    const decayRate = 0.01;
    const targetTicks = 10000;

    beforeEach(() => {
        // Create EnergyManager without an agent for testing
        energyManager = new EnergyManager(maxEnergy, decayRate);
    });

    it("should initialize with correct energy", () => {
        const state = energyManager.getState();
        expect(state.currentEnergy).toBe(maxEnergy);
        expect(state.maxEnergy).toBe(maxEnergy);
        expect(state.isDepleted).toBe(false);
    });

    it(`should deplete energy from ${maxEnergy} to 0 in approximately ${targetTicks} ticks`, () => {
        // Simulate ticks
        for (let i = 0; i < targetTicks; i++) {
            // Optional sanity check partway through
            if (i === targetTicks / 2) {
                const state = energyManager.getState();
                expect(state.isDepleted).toBe(false);
                expect(state.currentEnergy).toBeCloseTo(maxEnergy - (decayRate * i), 1);
            }
            energyManager.decay(i);
        }

        // Check energy after target ticks
        let finalState = energyManager.getState();
        expect(finalState.currentEnergy).toBeCloseTo(0, 1e-12);
        expect(finalState.isDepleted).toBe(true);

        // Check that further ticks don't change energy
        energyManager.decay(targetTicks + 1);
        finalState = energyManager.getState();
        expect(finalState.currentEnergy).toBeCloseTo(0, 1e-12);
        expect(finalState.isDepleted).toBe(true);
    });

    it("should gain energy correctly", () => {
        // Deplete some energy first
        for (let i = 0; i < 2000; i++) { energyManager.decay(i); }
        const energyAfterDecay = energyManager.getState().currentEnergy;
        expect(energyAfterDecay).toBeCloseTo(maxEnergy - (decayRate * 2000), 1);

        // Gain energy
        const gainAmount = 10;
        energyManager.gainEnergy(gainAmount, 2001);
        const stateAfterGain = energyManager.getState();
        expect(stateAfterGain.currentEnergy).toBeCloseTo(energyAfterDecay + gainAmount, 1);
        expect(stateAfterGain.isDepleted).toBe(false);
    });

    it("should not exceed max energy when gaining energy", () => {
        // Start near max energy by decaying slightly
        energyManager.decay(1);
        energyManager.decay(2);
        expect(energyManager.getState().currentEnergy).toBeLessThan(maxEnergy);

        // Gain energy that would exceed max
        const gainAmount = 10;
        energyManager.gainEnergy(gainAmount, 3);
        expect(energyManager.getState().currentEnergy).toBe(maxEnergy);

        // Try gaining more when already full
        energyManager.gainEnergy(gainAmount, 4);
        expect(energyManager.getState().currentEnergy).toBe(maxEnergy);
    });

    it("should not gain negative energy", () => {
        const initialState = energyManager.getState();
        energyManager.gainEnergy(-10, 1);
        expect(energyManager.getState().currentEnergy).toBe(initialState.currentEnergy);
    });
}); 