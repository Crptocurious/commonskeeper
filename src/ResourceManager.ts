import { World } from "hytopia";

interface ResourceState {
    currentAmount: number;
    maxAmount: number;
    regenerationRate: number;
    lastUpdateTime: number;
    depletion: number; // Tracks how much resource has been depleted
    harvestCount: number; // Tracks number of harvests
}

export class ResourceManager {
    private resources: Map<string, ResourceState> = new Map();
    private world: World;
    private updateInterval: NodeJS.Timeout;

    constructor(world: World) {
        this.world = world;
        
        // Initialize resources
        this.resources.set("fish", {
            currentAmount: 1000,
            maxAmount: 1000,
            regenerationRate: 0.1, // 10% regeneration per minute
            lastUpdateTime: Date.now(),
            depletion: 0,
            harvestCount: 0
        });

        this.resources.set("minerals", {
            currentAmount: 1000,
            maxAmount: 1000,
            regenerationRate: 0.05, // 5% regeneration per minute
            lastUpdateTime: Date.now(),
            depletion: 0,
            harvestCount: 0
        });

        // Update resources every minute
        this.updateInterval = setInterval(() => this.updateResources(), 60000);
    }

    private updateResources() {
        for (const [resourceType, state] of this.resources.entries()) {
            const timeDiff = (Date.now() - state.lastUpdateTime) / 60000; // Convert to minutes
            const regenerationAmount = state.maxAmount * state.regenerationRate * timeDiff;
            
            state.currentAmount = Math.min(
                state.maxAmount,
                state.currentAmount + regenerationAmount
            );
            state.lastUpdateTime = Date.now();
        }
    }

    public getResourceState(resourceType: string): ResourceState | undefined {
        return this.resources.get(resourceType);
    }

    public harvestResource(resourceType: string, amount: number): boolean {
        const resource = this.resources.get(resourceType);
        if (!resource) return false;

        // Check if there's enough resource
        if (resource.currentAmount < amount) return false;

        // Calculate success probability based on resource depletion
        const depletionFactor = resource.currentAmount / resource.maxAmount;
        const successProbability = Math.max(0.1, depletionFactor); // Minimum 10% chance

        if (Math.random() > successProbability) return false;

        // Update resource state
        resource.currentAmount -= amount;
        resource.depletion += amount;
        resource.harvestCount++;

        return true;
    }

    public getResourceMetrics(): Record<string, any> {
        const metrics: Record<string, any> = {};
        
        for (const [resourceType, state] of this.resources.entries()) {
            metrics[resourceType] = {
                currentLevel: state.currentAmount / state.maxAmount,
                totalDepletion: state.depletion,
                harvestCount: state.harvestCount,
                sustainability: state.currentAmount > state.maxAmount * 0.5 ? "Sustainable" : "Depleting"
            };
        }

        return metrics;
    }

    public cleanup() {
        clearInterval(this.updateInterval);
    }
} 