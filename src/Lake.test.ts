import { describe, it, expect, beforeEach } from "bun:test";
import { Lake } from "./Lake";

describe("Lake Simulation", () => {
    let lake: Lake;
    const capacity = 100;
    const initialStock = 50;
    const regenRate = 5;

    // Re-initialize lake before each test
    beforeEach(() => {
        lake = new Lake(capacity, initialStock, regenRate);
    });

    it("should initialize with correct stock and capacity", () => {
        expect(lake.getState().stock).toBe(initialStock);
        expect(lake.getState().capacity).toBe(capacity);
        expect(lake.isCollapsed()).toBe(false);
    });

    it("should initialize stock at capacity if initialStock exceeds capacity", () => {
        const highInitialStock = 150;
        lake = new Lake(capacity, highInitialStock, regenRate);
        expect(lake.getState().stock).toBe(capacity);
    });

    it("should initialize correctly with zero initial stock", () => {
        lake = new Lake(capacity, 0, regenRate);
        expect(lake.getState().stock).toBe(0);
        expect(lake.isCollapsed()).toBe(true);
    });

    // --- Regeneration Tests --- //
    describe("Regeneration", () => {
        it("should regenerate stock correctly below capacity", () => {
            lake.regenerate();
            expect(lake.getState().stock).toBe(initialStock + regenRate);
        });

        it("should not regenerate stock beyond capacity", () => {
            lake = new Lake(capacity, 98, regenRate); // Start near capacity
            lake.regenerate();
            expect(lake.getState().stock).toBe(capacity);
            lake.regenerate(); // Try regenerating again
            expect(lake.getState().stock).toBe(capacity); // Should still be at capacity
        });

        it("should not regenerate stock if already at capacity", () => {
            lake = new Lake(capacity, capacity, regenRate);
            lake.regenerate();
            expect(lake.getState().stock).toBe(capacity);
        });

        it("should (optionally) regenerate stock even if currently collapsed (stock is 0)", () => {
            lake = new Lake(capacity, 0, regenRate);
            expect(lake.isCollapsed()).toBe(true);
            lake.regenerate();
            expect(lake.getState().stock).toBe(regenRate);
            expect(lake.isCollapsed()).toBe(false);
        });
    });

    // --- Harvesting Tests --- //
    describe("Harvesting", () => {
        it("should allow harvesting when stock is available", () => {
            const harvestAmount = 10;
            const harvested = lake.harvest(harvestAmount);
            expect(harvested).toBe(harvestAmount);
            expect(lake.getState().stock).toBe(initialStock - harvestAmount);
            expect(lake.isCollapsed()).toBe(false);
        });

        it("should return only the available stock if harvest amount exceeds current stock", () => {
            const harvestAmount = 60; // More than initialStock
            const harvested = lake.harvest(harvestAmount);
            expect(harvested).toBe(initialStock);
            expect(lake.getState().stock).toBe(0);
            expect(lake.isCollapsed()).toBe(true);
        });

        it("should handle harvesting exactly the remaining stock", () => {
            const harvestAmount = initialStock;
            const harvested = lake.harvest(harvestAmount);
            expect(harvested).toBe(harvestAmount);
            expect(lake.getState().stock).toBe(0);
            expect(lake.isCollapsed()).toBe(true);
        });

        it("should return 0 when harvesting from a collapsed lake", () => {
            lake = new Lake(capacity, 0, regenRate); // Start collapsed
            const harvestAmount = 10;
            const harvested = lake.harvest(harvestAmount);
            expect(harvested).toBe(0);
            expect(lake.getState().stock).toBe(0);
            expect(lake.isCollapsed()).toBe(true);
        });

        it("should return 0 when attempting to harvest zero or negative amount", () => {
            let harvested = lake.harvest(0);
            expect(harvested).toBe(0);
            expect(lake.getState().stock).toBe(initialStock); // Stock should be unchanged

            harvested = lake.harvest(-5);
            expect(harvested).toBe(0);
            expect(lake.getState().stock).toBe(initialStock); // Stock should be unchanged
        });

        it("should become collapsed immediately after stock reaches zero from harvesting", () => {
            const harvestAmount = initialStock;
            lake.harvest(harvestAmount);
            expect(lake.isCollapsed()).toBe(true);
        });
    });

    // --- Combined Tests --- //
    describe("Combined Operations", () => {
        it("should handle multiple harvests and regenerations correctly", () => {
            // Harvest 10 -> Stock 40
            lake.harvest(10);
            expect(lake.getState().stock).toBe(40);
            // Regenerate -> Stock 45
            lake.regenerate();
            expect(lake.getState().stock).toBe(45);
            // Harvest 20 -> Stock 25
            lake.harvest(20);
            expect(lake.getState().stock).toBe(25);
            // Regenerate -> Stock 30
            lake.regenerate();
            expect(lake.getState().stock).toBe(30);
            // Harvest 30 -> Stock 0 (Collapsed)
            const harvested = lake.harvest(30);
            expect(harvested).toBe(30);
            expect(lake.getState().stock).toBe(0);
            expect(lake.isCollapsed()).toBe(true);
            // Regenerate -> Stock 5
            lake.regenerate();
            expect(lake.getState().stock).toBe(5);
            expect(lake.isCollapsed()).toBe(false);
        });
    });
}); 