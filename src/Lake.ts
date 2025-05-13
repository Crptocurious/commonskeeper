import { EventEmitter } from "events";
import { logEvent } from "./logger";
import type { GameWorld, LakeState } from "./types/GameState";
import { SIMULATION_CONFIG } from "./config/constants";

export const EVENT_COLLAPSE = 'lake:collapse'; // Define event name for potential future use

export class Lake extends EventEmitter {
  private currentStock: number;
  readonly capacity: number;
  readonly regenRate: number; // Fish regenerated per tick/call to regenerate()
  private _isCollapsed: boolean = false; // Persistent collapse state
  private readonly COLLAPSE_THRESHOLD_PERCENT = SIMULATION_CONFIG.LAKE_COLLAPSE_THRESHOLD / 100 ;
  private lastUpdateTick: number;
  readonly intrinsicGrowthRate: number = SIMULATION_CONFIG.LAKE_INTRINSIC_GROWTH_RATE; // Use from config

  /**
   * Initializes the Lake resource.
   * @param capacity - Maximum fish the lake can hold.
   * @param initialStock - Starting number of fish.
   * @param regenRate - Number of fish regenerated each simulation tick/call to regenerate().
   * @param currentTick - The current game tick.
   */
  constructor(capacity: number, initialStock: number, regenRate: number, currentTick: number) {
    super();
    this.capacity = capacity;
    this.currentStock = Math.min(initialStock, capacity); // Ensure initial stock doesn't exceed capacity
    this.regenRate = regenRate;
    this.lastUpdateTick = currentTick;

    // Initialize collapse state based on initial stock
    if (this.currentStock <= this.capacity * this.COLLAPSE_THRESHOLD_PERCENT) {
      console.warn(`Lake initialized below or at collapse threshold (${this.COLLAPSE_THRESHOLD_PERCENT * 100}%). Initial stock: ${this.currentStock}. Collapsing immediately.`);
      this._isCollapsed = true;
      this.currentStock = 0; // Set stock to 0 if starting collapsed
      // Log initial collapse if starting below threshold
       logEvent({
           type: "lake_collapse",
           reason: "Initial stock below threshold",
           initialStock: initialStock, // Log the stock it started with
           threshold: this.capacity * this.COLLAPSE_THRESHOLD_PERCENT,
           capacity: this.capacity,
           lastUpdateTick: this.lastUpdateTick
       });
    } else if (this.currentStock <= 0) {
        // Handle case where initial stock is <= 0 but somehow above threshold (unlikely with threshold > 0)
        console.warn("Lake initialized with zero or negative stock. Collapsing immediately.");
        this._isCollapsed = true;
        this.currentStock = 0;
        logEvent({
           type: "lake_collapse",
           reason: "Initial stock zero or negative",
           initialStock: initialStock,
           capacity: this.capacity,
           lastUpdateTick: this.lastUpdateTick
       });
    }
  }

  /**
   * Updates the fish stock by doubling it, up to capacity.
   * Does nothing if the lake is collapsed.
   * Should be called periodically (e.g., once per round/day) by the simulation.
   * @param currentTick - The current game tick.
   * @param world - Optional world instance to update UI.
   * @returns The amount of fish stock regenerated.
   * Emits 'lakeUpdated' event if world is provided.
   */
  regenerate(currentTick: number, world?: GameWorld): number {
    // Do not regenerate if the lake is permanently collapsed
    if (this.isCollapsed()) {
        return 0; // Return 0 if collapsed
    }

    const stockBefore = this.currentStock;
    let regeneratedAmount = 0; // Initialize regeneratedAmount

    // Logistic growth rule
    if (this.currentStock > 0) { // Only grow if there's stock
        const r = this.intrinsicGrowthRate; // Use class member
        const newFish = r * this.currentStock * (1 - this.currentStock / this.capacity);
        
        // Ensure stock does not exceed capacity and handle potential negative growth if stock > capacity (though unlikely with current logic)
        let stockAfter = this.currentStock + newFish;
        if (stockAfter > this.capacity) {
            stockAfter = this.capacity;
        } else if (stockAfter < 0) { // Should not happen if currentStock starts <= capacity
            stockAfter = 0;
        }
        
        this.currentStock = stockAfter;
        regeneratedAmount = this.currentStock - stockBefore; // Calculate the actual change in stock

        // Ensure regeneratedAmount is not negative if stock decreased due to being over capacity initially
        // or due to other edge cases, though with current logic it should mostly be positive or zero.
        if (regeneratedAmount < 0 && stockBefore > this.capacity) {
            // This case implies stock was above capacity and is now adjusted down.
            // For "regeneration" metrics, we might consider this 0 regeneration.
             regeneratedAmount = 0;
        } else if (regeneratedAmount < 0) {
            // If stock decreased for other reasons (e.g. float precision, or became 0)
            regeneratedAmount = 0; 
        }


        this.lastUpdateTick = currentTick;
    }
    // Else: stock is 0, no growth possible.

    // Log the regeneration event if stock changed (or if we want to log every attempt)
    // We only log if there was a meaningful change or attempt.
    if (regeneratedAmount > 0 || (stockBefore > 0 && this.currentStock !== stockBefore) ) {
        logEvent({
            type: "lake_regenerate",
            stockBefore: stockBefore,
            stockAfter: this.currentStock, // Use the final this.currentStock
            regeneratedAmountCalculated: regeneratedAmount, // Log the calculated amount for clarity
            capacity: this.capacity,
            isCollapsed: this._isCollapsed, // Should always be false here
            lastUpdateTick: this.lastUpdateTick
        });
    }

    if (world) {
        this.emit('lakeUpdated', world, this);
    }
    
    return regeneratedAmount > 0 ? regeneratedAmount : 0; // Return the calculated positive amount or 0
  }

  /**
   * Checks if the lake should collapse based on the current stock level.
   * Should be called after all harvesting in a round/step is complete, before regeneration.
   * Sets the persistent collapse state if the threshold is met.
   * @param currentTick - The current game tick.
   */
  checkCollapse(currentTick: number): void {
      // Check only if not already collapsed
      if (!this._isCollapsed && this.currentStock <= this.capacity * this.COLLAPSE_THRESHOLD_PERCENT) {
          console.warn(`Lake collapsed! Stock (${this.currentStock}) reached collapse threshold (${this.capacity * this.COLLAPSE_THRESHOLD_PERCENT}).`);
          this._isCollapsed = true;
          this.currentStock = 0; // Permanently deplete stock on collapse
          this.lastUpdateTick = currentTick;

          // Log collapse event
          logEvent({
              type: "lake_collapse",
              reason: "Stock dropped below threshold after harvest",
              threshold: this.capacity * this.COLLAPSE_THRESHOLD_PERCENT,
              stockAtCollapseTrigger: this.currentStock, // Will be 0 now
              capacity: this.capacity,
              lastUpdateTick: this.lastUpdateTick
          });
          this.emit(EVENT_COLLAPSE); // Emit collapse event
      }
  }

  /**
   * Attempts to harvest a specified amount of fish.
   * @param amount - The amount of fish the agent tries to harvest.
   * @param currentTick - The current game tick.
   * @param world - Optional world instance to update UI.
   * @returns The actual amount of fish successfully harvested.
   * Emits 'lakeUpdated' event if world is provided.
   */
  harvest(amount: number, currentTick: number, world?: GameWorld): number {
    if (amount <= 0) {
      return 0; // Cannot harvest zero or negative fish
    }

    // Cannot harvest from a permanently collapsed lake
    if (this.isCollapsed()) {
        return 0;
    }
    // Also ensure stock is positive (though should be guaranteed if not collapsed)
    if (this.currentStock <= 0) {
        console.warn("Attempted to harvest from lake with stock <= 0, but not marked as collapsed. This shouldn't happen.");
        return 0;
    }

    const harvestedAmount = Math.min(amount, this.currentStock);
    this.currentStock -= harvestedAmount;
    
    // Check for collapse after reducing stock
    this.checkCollapse(currentTick);
    
    if (harvestedAmount > 0) {
      this.lastUpdateTick = currentTick;
      logEvent({
          type: "lake_harvest",
          requestedAmount: amount,
          harvestedAmount: harvestedAmount,
          stockRemaining: this.currentStock,
          lastUpdateTick: this.lastUpdateTick
      });
    }

    if (world) {
      this.emit('lakeUpdated', world, this);
    }

    return harvestedAmount;
  }

  /**
   * Gets the current state of the lake.
   * @returns A LakeState object containing all current lake state properties.
   */
  getState(): LakeState {
    return {
      currentStock: this.currentStock,
      maxCapacity: this.capacity,
      lastUpdateTick: this.lastUpdateTick,
      isCollapsed: this._isCollapsed,
      regenRate: this.intrinsicGrowthRate, // Use the logistic growth rate
      collapseThreshold: this.COLLAPSE_THRESHOLD_PERCENT,
      regenModel: "logistic" // Add the regeneration model
    };
  }

   /**
   * Checks if the lake is currently in a permanently collapsed state.
   * @returns True if the lake is collapsed, false otherwise.
   */
  isCollapsed(): boolean {
      return this._isCollapsed;
  }

  public getCurrentStock(): number {
    return this.currentStock;
  }

  public getMaxCapacity(): number {
    return this.capacity;
  }

  public getLastUpdateTick(): number {
    return this.lastUpdateTick;
  }
} 