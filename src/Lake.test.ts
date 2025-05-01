import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Lake } from "./Lake";
import * as logger from "./logger";

// No top-level mock factory needed

describe("Lake Simulation", () => {
    let lake: Lake;
    let logSpy: ReturnType<typeof spyOn>; // Variable to hold the spy instance

    const capacity = 100;
    const initialStock = 50;
    const regenRate = 1; // Arbitrary value for constructor

    beforeEach(() => {
        // Spy on the logEvent function before each test
        // We assume logEvent is an exported function from ./logger
        logSpy = spyOn(logger, 'logEvent');
        lake = new Lake(capacity, initialStock, regenRate);
    });

    afterEach(() => {
        // Restore the original function after each test
        logSpy.mockRestore();
    });

    // --- Initialization Tests --- //
    describe("Initialization", () => {
        it("should initialize with correct stock and capacity (above threshold)", () => {
            expect(lake.getState().stock).toBe(initialStock);
            expect(lake.getState().capacity).toBe(capacity);
            expect(lake.isCollapsed()).toBe(false);
        });

        it("should initialize stock at capacity if initialStock exceeds capacity", () => {
            const highInitialStock = 150;
            lake = new Lake(capacity, highInitialStock, regenRate);
            expect(lake.getState().stock).toBe(capacity);
            expect(lake.isCollapsed()).toBe(false);
        });

        it("should initialize as collapsed if initialStock is at collapse threshold (10%)", () => {
            const thresholdStock = capacity * 0.10; // 10
            lake = new Lake(capacity, thresholdStock, regenRate);
            expect(lake.getState().stock).toBe(0); // Stock set to 0 on collapse
            expect(lake.isCollapsed()).toBe(true);
            // Use the logSpy for assertions
            expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: "lake_collapse",
                reason: "Initial stock below threshold" // Or similar based on implementation
            }));
        });

        it("should initialize as collapsed if initialStock is below collapse threshold", () => {
            const belowThresholdStock = 5;
            lake = new Lake(capacity, belowThresholdStock, regenRate);
            expect(lake.getState().stock).toBe(0); // Stock set to 0 on collapse
            expect(lake.isCollapsed()).toBe(true);
            expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: "lake_collapse",
                reason: "Initial stock below threshold" // Or similar
            }));
        });

         it("should initialize as collapsed if initialStock is zero", () => {
            lake = new Lake(capacity, 0, regenRate);
            expect(lake.getState().stock).toBe(0);
            expect(lake.isCollapsed()).toBe(true);
             // Check which reason is logged (below threshold or zero/negative)
             expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: "lake_collapse"
            }));
        });

         it("should initialize as collapsed if initialStock is negative", () => {
            lake = new Lake(capacity, -10, regenRate);
            expect(lake.getState().stock).toBe(0);
            expect(lake.isCollapsed()).toBe(true);
            expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: "lake_collapse",
                reason: "Initial stock below threshold" 
            }));
        });
    });


    // --- Regeneration Tests (Doubling Rule) --- //
    describe("Regeneration", () => {
        it("should double the stock correctly when below capacity", () => {
            lake = new Lake(capacity, 25, regenRate);
            lake.regenerate();
            expect(lake.getState().stock).toBe(50);
            lake.regenerate();
            expect(lake.getState().stock).toBe(100); // Reaches capacity
        });

        it("should cap regeneration at capacity", () => {
            lake = new Lake(capacity, 60, regenRate);
            lake.regenerate();
            expect(lake.getState().stock).toBe(capacity); // 60*2=120 > 100, so capped at 100
        });

         it("should not regenerate stock if already at capacity", () => {
            lake = new Lake(capacity, capacity, regenRate);
            lake.regenerate();
            expect(lake.getState().stock).toBe(capacity);
        });

        it("should not regenerate if the lake is collapsed", () => {
            // Make the lake collapsed
            lake = new Lake(capacity, 5, regenRate); // Starts collapsed
            expect(lake.isCollapsed()).toBe(true);
            expect(lake.getState().stock).toBe(0);

            lake.regenerate();
            expect(lake.getState().stock).toBe(0); // Stock remains 0
            expect(lake.isCollapsed()).toBe(true); // Stays collapsed
        });

        it("should not regenerate if stock is 0 but not collapsed (edge case, possibly unreachable)", () => {
            // Manually setting stock to 0 without collapsing (hard to achieve naturally)
             const lakeWithZeroStock = new Lake(capacity, 20, regenRate); // Start non-collapsed
             (lakeWithZeroStock as any).currentStock = 0; // Force stock to 0 internally
             (lakeWithZeroStock as any)._isCollapsed = false; // Ensure not marked collapsed

             lakeWithZeroStock.regenerate();
             expect(lakeWithZeroStock.getState().stock).toBe(0);
        });

        // Test for the new regeneration log event
        it("should log the lake_regenerate event when stock increases", () => {
            lake = new Lake(capacity, 25, regenRate);
            lake.regenerate(); // Stock goes from 25 to 50
            expect(logSpy).toHaveBeenCalledTimes(1);
            expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: "lake_regenerate",
                stockBefore: 25,
                stockAfter: 50,
                capacity: capacity
            }));

            logSpy.mockClear(); // Clear for next check
            lake.regenerate(); // Stock goes from 50 to 100
            expect(logSpy).toHaveBeenCalledTimes(1);
             expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: "lake_regenerate",
                stockBefore: 50,
                stockAfter: 100,
                capacity: capacity
            }));
        });

        it("should NOT log the lake_regenerate event if stock does not change (at capacity or collapsed)", () => {
            // At capacity
            lake = new Lake(capacity, capacity, regenRate);
            lake.regenerate();
            expect(logSpy).not.toHaveBeenCalled();

            // Collapsed
            lake = new Lake(capacity, 5, regenRate); // Starts collapsed
            logSpy.mockClear(); // Clear init log
            lake.regenerate();
            expect(logSpy).not.toHaveBeenCalled();
        });
    });

    // --- Harvesting Tests --- //
    describe("Harvesting", () => {
        it("should allow harvesting when stock is available and lake not collapsed", () => {
            const harvestAmount = 10;
            const harvested = lake.harvest(harvestAmount);
            expect(harvested).toBe(harvestAmount);
            expect(lake.getState().stock).toBe(initialStock - harvestAmount); // 50 - 10 = 40
            expect(lake.isCollapsed()).toBe(false);
        });

        it("should return only the available stock if harvest amount exceeds current stock", () => {
            const harvestAmount = 60; // More than initialStock 50
            const harvested = lake.harvest(harvestAmount);
            expect(harvested).toBe(initialStock); // Harvests all 50
            expect(lake.getState().stock).toBe(0); // Stock becomes 0
            expect(lake.isCollapsed()).toBe(false); // Harvesting itself doesn't collapse
        });

        it("should handle harvesting exactly the remaining stock", () => {
            const harvestAmount = initialStock; // 50
            const harvested = lake.harvest(harvestAmount);
            expect(harvested).toBe(harvestAmount);
            expect(lake.getState().stock).toBe(0);
            expect(lake.isCollapsed()).toBe(false); // Harvesting itself doesn't collapse
        });

        it("should return 0 when harvesting from a collapsed lake", () => {
            lake = new Lake(capacity, 5, regenRate); // Starts collapsed
            expect(lake.isCollapsed()).toBe(true);
            const harvestAmount = 10;
            const harvested = lake.harvest(harvestAmount);
            expect(harvested).toBe(0);
            expect(lake.getState().stock).toBe(0); // Stock remains 0
        });

        it("should return 0 when attempting to harvest zero or negative amount", () => {
            let harvested = lake.harvest(0);
            expect(harvested).toBe(0);
            expect(lake.getState().stock).toBe(initialStock); // Stock unchanged

            harvested = lake.harvest(-5);
            expect(harvested).toBe(0);
            expect(lake.getState().stock).toBe(initialStock); // Stock unchanged
        });
    });


    // --- checkCollapse Tests --- //
    describe("checkCollapse", () => {
        const threshold = capacity * 0.10; // 10

        it("should collapse the lake if stock drops to the threshold", () => {
             lake = new Lake(capacity, threshold + 1, regenRate); // Start just above threshold (11)
             lake.harvest(1); // Harvest to reach threshold (10)
             expect(lake.getState().stock).toBe(threshold);
             expect(lake.isCollapsed()).toBe(false);

             // Clear spy calls after harvest, before checking collapse
             logSpy.mockClear();

             lake.checkCollapse(); // Check for collapse

             expect(lake.isCollapsed()).toBe(true);
             expect(lake.getState().stock).toBe(0); // Stock goes to 0 on collapse
             expect(logSpy).toHaveBeenCalledTimes(1); // Should be 1 call (collapse)
             expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
                 type: "lake_collapse",
                 reason: "Stock dropped below threshold after harvest" // Or similar
             }));
        });

        it("should collapse the lake if stock drops below the threshold", () => {
             lake = new Lake(capacity, threshold + 1, regenRate); // Start just above threshold (11)
             lake.harvest(2); // Harvest below threshold (9)
             expect(lake.getState().stock).toBe(threshold - 1);
             expect(lake.isCollapsed()).toBe(false);

             // Clear spy calls after harvest, before checking collapse
             logSpy.mockClear();

             lake.checkCollapse(); // Check for collapse

             expect(lake.isCollapsed()).toBe(true);
             expect(lake.getState().stock).toBe(0);
             expect(logSpy).toHaveBeenCalledTimes(1); // Should be 1 call (collapse)
             expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "lake_collapse" }));
        });

         it("should not collapse if stock is above the threshold", () => {
            lake = new Lake(capacity, threshold + 1, regenRate); // Stock 11
            lake.checkCollapse();
            expect(lake.isCollapsed()).toBe(false);
            expect(lake.getState().stock).toBe(threshold + 1);
            expect(logSpy).not.toHaveBeenCalled(); // Check spy
        });

        it("should not collapse (or log again) if already collapsed", () => {
             lake = new Lake(capacity, 5, regenRate); // Starts collapsed
             expect(lake.isCollapsed()).toBe(true);
             expect(lake.getState().stock).toBe(0);

             // Clear calls recorded during initialization for THIS test run
             logSpy.mockClear();

             lake.checkCollapse(); // Check again

             expect(lake.isCollapsed()).toBe(true); // Remains collapsed
             expect(lake.getState().stock).toBe(0); // Remains 0
             expect(logSpy).not.toHaveBeenCalled(); // No new collapse log
        });

        it("should collapse correctly when harvesting exactly to threshold", () => {
            // Re-init lake for this specific scenario start state
            lake = new Lake(capacity, threshold + 5, regenRate); // Start at 15
            expect(lake.isCollapsed()).toBe(false);

            lake.harvest(5); // Harvest to 10
            expect(lake.getState().stock).toBe(threshold);

            // Clear calls from initialization AND the harvest call above
            logSpy.mockClear();

            lake.checkCollapse();
            expect(lake.isCollapsed()).toBe(true);
            expect(lake.getState().stock).toBe(0);
            expect(logSpy).toHaveBeenCalledTimes(1); // Should be 1 call (collapse)
            expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "lake_collapse" }));

        });
    });

     // --- Post-Collapse State Tests --- //
    describe("Post-Collapse State", () => {
        beforeEach(() => {
            // Ensure lake is collapsed before each test in this block
            lake = new Lake(capacity, capacity * 0.10 + 1, regenRate); // Start above threshold (11)
            lake.harvest(2); // Harvest below threshold (9)
            lake.checkCollapse(); // Collapse the lake
            expect(lake.isCollapsed()).toBe(true); // Verify precondition
            expect(lake.getState().stock).toBe(0); // Verify precondition
        });

        it("isCollapsed() should return true", () => {
            expect(lake.isCollapsed()).toBe(true);
        });

        it("currentStock should remain 0", () => {
            expect(lake.getState().stock).toBe(0);
        });

        it("regenerate() should have no effect", () => {
            lake.regenerate();
            expect(lake.getState().stock).toBe(0);
             expect(lake.isCollapsed()).toBe(true);
        });

        it("harvest() should return 0 / fail", () => {
            const harvested = lake.harvest(10);
            expect(harvested).toBe(0);
            expect(lake.getState().stock).toBe(0); // Stock remains 0
        });
    });


    // Remove or update obsolete tests like the old 'Combined Operations'
    // describe("Combined Operations", () => { ... }); // Delete this section
}); 