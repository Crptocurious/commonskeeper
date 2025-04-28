import { World } from "hytopia"; // Assuming World might be needed later, keep for now? Or remove? Let's keep for now just in case.
import { EventEmitter } from "events";

export const EVENT_COLLAPSE = 'lake:collapse'; // Define event name for potential future use

export class Lake extends EventEmitter {
  private currentStock: number;
  readonly capacity: number;
  readonly regenRate: number; // Fish regenerated per tick/call to regenerate()

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

    if (this.currentStock <= 0) {
        console.warn("Lake initialized with zero or negative stock.");
        // Future: Consider emitting collapse event immediately if starting collapsed
    }
  }

  /**
   * Updates the fish stock based on regeneration rate.
   * Called periodically by the main simulation loop (e.g., once per tick).
   * Emits 'lakeUpdated' event if world is provided.
   */
  regenerate(world?: any): void {
    if (this.currentStock <= 0) {
        // Optional: Lake might not regenerate if fully collapsed, depending on desired mechanics
        // return;
    }
    if (this.currentStock < this.capacity) {
      this.currentStock += this.regenRate;
      // Ensure stock does not exceed capacity after regeneration
      if (this.currentStock > this.capacity) {
        this.currentStock = this.capacity;
      }
    }
    if (world) {
      this.emit('lakeUpdated', world, this);
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

    // Cannot harvest from a collapsed lake
    if (this.currentStock <= 0) {
        return 0;
    }

    const harvestedAmount = Math.min(amount, this.currentStock);
    this.currentStock -= harvestedAmount;

    // Check for collapse *after* harvesting
    if (this.currentStock <= 0) {
      console.warn(`Lake collapsed! Stock reached ${this.currentStock}.`);
      // Future: Use an event emitter to signal collapse (e.g., this.eventEmitter.emit(EVENT_COLLAPSE);)
    }

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
   * Checks if the lake is currently collapsed (stock <= 0).
   * @returns True if the lake is collapsed, false otherwise.
   */
  isCollapsed(): boolean {
      return this.currentStock <= 0;
  }
} 