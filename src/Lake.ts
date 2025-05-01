import { World } from "hytopia"; // Assuming World might be needed later, keep for now? Or remove? Let's keep for now just in case.
import { EventEmitter } from "events";
import { logEvent } from "./logger";

export const EVENT_COLLAPSE = 'lake:collapse'; // Define event name for potential future use

export class Lake extends EventEmitter {
  private currentStock: number;
  readonly capacity: number;
  readonly regenRate: number; // Fish regenerated per tick/call to regenerate()
  private _isCollapsed: boolean = false; // Persistent collapse state
  private readonly COLLAPSE_THRESHOLD_PERCENT = 0.10; // 10% threshold

  /**
   * Initializes the Lake resource.
   * @param capacity - Maximum fish the lake can hold.
   * @param initialStock - Starting number of fish.
   * @param regenRate - Number of fish regenerated each simulation tick/call to regenerate().
   */
  constructor(capacity: number, initialStock: number, regenRate: number) {
    super();
    this.capacity = capacity;
    this.currentStock = Math.min(initialStock, capacity); // Ensure initial stock doesn't exceed capacity
    this.regenRate = regenRate;

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
       });
    }
  }

  /**
   * Updates the fish stock by doubling it, up to capacity.
   * Does nothing if the lake is collapsed.
   * Should be called periodically (e.g., once per round/day) by the simulation.
   * Emits 'lakeUpdated' event if world is provided.
   */
  regenerate(world?: any): void {
    // Do not regenerate if the lake is permanently collapsed
    if (this.isCollapsed()) {
        return;
    }

    const stockBefore = this.currentStock;
    let stockAfter = stockBefore; // Initialize with before value

    // Doubling rule
    if (this.currentStock > 0 && this.currentStock < this.capacity) {
        stockAfter = this.currentStock * 2;
        // Ensure stock does not exceed capacity after regeneration
        if (stockAfter > this.capacity) {
            stockAfter = this.capacity;
        }
        this.currentStock = stockAfter;
    }
    // Else: stock is 0 or at capacity, no change from doubling rule

    // Log the regeneration event if stock changed
    if (stockAfter !== stockBefore) {
        logEvent({
            type: "lake_regenerate",
            stockBefore: stockBefore,
            stockAfter: stockAfter,
            capacity: this.capacity,
            isCollapsed: this._isCollapsed // Should always be false here
        });
    }

    if (world) {
        this.emit('lakeUpdated', world, this);
    }
  }

  /**
   * Checks if the lake should collapse based on the current stock level.
   * Should be called after all harvesting in a round/step is complete, before regeneration.
   * Sets the persistent collapse state if the threshold is met.
   */
  checkCollapse(): void {
      // Check only if not already collapsed
      if (!this._isCollapsed && this.currentStock <= this.capacity * this.COLLAPSE_THRESHOLD_PERCENT) {
          console.warn(`Lake collapsed! Stock (${this.currentStock}) reached collapse threshold (${this.capacity * this.COLLAPSE_THRESHOLD_PERCENT}).`);
          this._isCollapsed = true;
          this.currentStock = 0; // Permanently deplete stock on collapse

          // Log collapse event
          logEvent({
              type: "lake_collapse",
              reason: "Stock dropped below threshold after harvest",
              threshold: this.capacity * this.COLLAPSE_THRESHOLD_PERCENT,
              stockAtCollapseTrigger: this.currentStock, // Will be 0 now
              capacity: this.capacity,
          });
          this.emit(EVENT_COLLAPSE); // Emit collapse event
      }
  }

  /**
   * Attempts to harvest a specified amount of fish.
   * @param amount - The amount of fish the agent tries to harvest.
   * @param world - The world instance to update UI.
   * @returns The actual amount of fish successfully harvested.
   * Emits 'lakeUpdated' event if world is provided.
   */
  harvest(amount: number, world?: any): number {
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

    // Log the harvest event if successful
    if (harvestedAmount > 0) {
      logEvent({
          type: "lake_harvest",
          requestedAmount: amount,
          harvestedAmount: harvestedAmount,
          stockRemaining: this.currentStock,
      });
    }

    // Collapse check is now handled by checkCollapse() method, called externally by simulation loop
    // Remove the immediate check from here:
    // if (this.currentStock <= 0) { ... }

    if (world) {
      this.emit('lakeUpdated', world, this);
    }

    return harvestedAmount;
  }

  /**
   * Gets the current state of the lake.
   * @returns An object containing the current stock and capacity.
   */
  getState(): { stock: number; capacity: number } {
    return {
      stock: this.currentStock,
      capacity: this.capacity,
    };
  }

   /**
   * Checks if the lake is currently in a permanently collapsed state.
   * @returns True if the lake is collapsed, false otherwise.
   */
  isCollapsed(): boolean {
      return this._isCollapsed;
  }
} 