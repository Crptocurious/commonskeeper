import { Lake } from "./Lake";
import { BaseAgent } from "./BaseAgent";
import fs from 'fs';
import path from 'path';

// Define the structure for the final report
interface SimulationMetricsReport {
    run_id: string;
    simulation_duration_ticks: number;
    outcome: "Survived" | "Collapsed";
    survival_time_ticks: number;
    final_fish_stock: number;
    harvest_efficiency: number; // Calculated over survived turns
    final_wealth_inequality_gini: number; // Renamed from final_harvest_gini_coefficient
    total_wealth_generated?: number; // New field
    total_gain_per_agent?: { [agentName: string]: number }; // New field for R_i
    mean_gain_per_agent?: number; // Metric: Gain (mean R_i)
    over_usage_fraction?: number; // Metric: Over-usage
    fish_stock_time_series: { tick: number; stock: number }[];
    total_harvest_per_cycle_time_series: { cycle: number; harvest: number }[];
    townhall_messages_per_cycle_time_series: { cycle: number; messages: number }[];
}

// Helper function to calculate the Gini coefficient
// Input: An array of non-negative numbers (e.g., total harvest per agent)
// Output: Gini coefficient (0 for perfect equality, 1 for perfect inequality)
function calculateGini(data: number[]): number {
    const n = data.length;
    if (n === 0) return 0; // Or handle as an error/undefined case

    // Sort data in ascending order
    const sortedData = [...data].sort((a, b) => a - b);

    // Calculate the sum of all values
    const sumValues = sortedData.reduce((acc, val) => acc + val, 0);

    // Handle case where sum is zero (perfect equality or all zeros)
    if (sumValues === 0) return 0;

    // Calculate the Lorenz curve values
    let cumulativeSum = 0;
    let giniSum = 0;
    for (let i = 0; i < n; i++) {
        cumulativeSum += sortedData[i]!;
        giniSum += (i + 1) * sortedData[i]!;
    }

    // Gini coefficient formula: 1 - 2 * (Area under Lorenz Curve) / (Area of Max Inequality Triangle)
    // Simplified formula based on sorted data: (2 * sum(i * x_i) / (n * sum(x_i))) - (n + 1) / n
    // Alternative: (n + 1) / n - (2 / (n * sumValues)) * giniSum
    // Yet another common formula: 1 - (2 * sum_of_lower_triangle_areas / total_area)
    // Using a common calculation: Sum(|x_i - x_j|) / (2 * n^2 * mean)
    // Let's use the formula derived from Lorenz curve area calculation:
    const gini = (2 * giniSum) / (n * sumValues) - (n + 1) / n;


    // A simpler way often used:
    let numerator = 0;
    for(let i = 0; i < n; i++) {
        for(let j = 0; j < n; j++) {
            numerator += Math.abs(sortedData[i]! - sortedData[j]!);
        }
    }
    const denominator = 2 * n * sumValues; // 2 * n^2 * mean
    const giniAlt = numerator / denominator;


     // Let's stick to the formula based on ranked sums which is computationally efficient
     // Gini = 1 - (2 * B) where B is the area under the Lorenz curve normalized
     // B = (sum of (n - i + 0.5) * x_i) / (n * sum(x_i)) -- Needs checking
     // Using the formula: (sum((2i - n - 1) * x_i)) / (n * sum(x_i))
     let weightedSumDiff = 0;
     for (let i = 0; i < n; i++) {
         weightedSumDiff += (2 * (i + 1) - n - 1) * sortedData[i]!;
     }
     const giniCoefficient = weightedSumDiff / (n * sumValues);


    return giniCoefficient; // Return the calculated Gini coefficient
}


export class MetricsTracker {
    private runId: string;
    private simulationStartTime: number; // In ticks or Date.now()
    private config: { loggingFrequencyCycles?: number } = {}; // Basic config

    // --- Internal State for Metrics ---
    private survivalTimeTicks: number | null = null;
    private outcome: "Survived" | "Collapsed" | null = null;
    private lastKnownFishStock: number = 0;
    private totalSimulationDurationTicks: number = 0; // Configured duration

    // For Efficiency
    private cumulativeActualHarvest: number = 0;
    private cumulativeSustainabilityThreshold: number = 0; // Sum of lake regeneration per cycle

    // For Inequality (updated at the end)
    private totalHarvestPerAgent: Map<string, number> = new Map(); // agentId -> totalHarvest

    // For Time Series Data
    private fishStockTimeSeries: { tick: number; stock: number }[] = [];
    private totalHarvestPerCycleTimeSeries: { cycle: number; harvest: number }[] = [];
    private townhallMessagesPerCycleTimeSeries: { cycle: number; messages: number }[] = [];

    // Counters for current cycle
    private currentCycleHarvest: number = 0;
    private currentCycleRegeneration: number = 0; // Track regeneration within the cycle
    private currentCycleMessages: number = 0;
    private currentCycleNumber: number = 0; // Track current cycle
    private reportGenerated: boolean = false; // Flag to prevent multiple report generations

    // For Over-usage metric
    private greedyMovesCount: number = 0;
    private totalHarvestActionsCount: number = 0;


    constructor(runIdPrefix: string = "sim", configuredDurationTicks: number) {
        this.runId = `${runIdPrefix}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        this.simulationStartTime = 0; // Will be set when simulation starts
        this.totalSimulationDurationTicks = configuredDurationTicks;
        this.reportGenerated = false; // Initialize flag
        console.log(`Metrics Tracker initialized for run: ${this.runId}`);
    }

    // --- Event Handlers / Update Methods ---

    public simulationStarted(startTimeTick: number, initialStock: number): void {
        this.simulationStartTime = startTimeTick;
        this.lastKnownFishStock = initialStock;
        this.recordFishStock(startTimeTick, initialStock); // Record initial stock
        this.outcome = null; // Reset outcome
        this.survivalTimeTicks = null; // Reset survival time
    }

    public recordAgentHarvest(agentId: string, amount: number): void {
        this.currentCycleHarvest += amount;
        const currentTotal = this.totalHarvestPerAgent.get(agentId) || 0;
        this.totalHarvestPerAgent.set(agentId, currentTotal + amount);
        // Note: To fully implement Over-usage, totalHarvestActionsCount should be incremented here
        // or recordHarvestActionDetails should be the primary method called during harvest.
        // For now, assuming recordHarvestActionDetails will also be called.
    }

    public recordLakeRegeneration(amount: number): void {
        // Assume this is called once per cycle after regeneration happens
        this.currentCycleRegeneration += amount;
    }

     public recordFishStock(tick: number, stock: number): void {
        this.lastKnownFishStock = stock;
        this.fishStockTimeSeries.push({ tick, stock });
    }

    public recordTownhallMessage(): void {
        this.currentCycleMessages++;
    }

    public cycleEnded(currentTick: number): void {
        // Log periodic metrics for the completed cycle
        this.totalHarvestPerCycleTimeSeries.push({ cycle: this.currentCycleNumber, harvest: this.currentCycleHarvest });
        this.townhallMessagesPerCycleTimeSeries.push({ cycle: this.currentCycleNumber, messages: this.currentCycleMessages });

        // Update cumulative values for efficiency calculation
        this.cumulativeActualHarvest += this.currentCycleHarvest;
        this.cumulativeSustainabilityThreshold += this.currentCycleRegeneration; // Assumes regeneration is tracked per cycle


        // Reset counters for the next cycle
        this.currentCycleHarvest = 0;
        this.currentCycleMessages = 0;
        this.currentCycleRegeneration = 0; // Reset regeneration for the next cycle's tracking
        this.currentCycleNumber++;

        // Optionally log to console periodically
        // if (this.config.loggingFrequencyCycles && this.currentCycleNumber % this.config.loggingFrequencyCycles === 0) {
        //     console.log(`Metrics - Cycle ${this.currentCycleNumber}: Stock=${this.lastKnownFishStock.toFixed(2)}, Harvest=${this.currentCycleHarvest}, Regen=${this.currentCycleRegeneration}`);
        // }
    }

    public simulationEnded(endTick: number, lake: Lake): void {
        this.lastKnownFishStock = lake.getCurrentStock();

        if (this.outcome === null) { // If not already set by collapse
            if (lake.isCollapsed()) {
                 this.outcome = "Collapsed";
                 // Survival time should ideally be set exactly when collapse happens
                 // If not caught by an event, estimate based on the end tick where it's known collapsed
                 this.survivalTimeTicks = endTick - this.simulationStartTime;
                 this.recordFishStock(endTick, lake.getCurrentStock());
            } else {
                this.outcome = "Survived";
                this.survivalTimeTicks = this.totalSimulationDurationTicks; // Survived the full configured duration
                 this.recordFishStock(endTick, lake.getCurrentStock());
            }
        }

        // Ensure the last known stock is recorded if the simulation ends unexpectedly
         if (this.fishStockTimeSeries[this.fishStockTimeSeries.length - 1]?.tick !== endTick) {
             this.recordFishStock(endTick, lake.getCurrentStock());
         }


        this.generateReport(endTick);
    }

     // Call this specifically when the lake collapses
    public lakeCollapsed(collapseTick: number, finalStock: number): void {
        if (this.outcome === null) { // Only record the first time it collapses
            console.log(`METRICS: Lake collapsed at tick ${collapseTick}`);
            this.outcome = "Collapsed";
            this.survivalTimeTicks = collapseTick - this.simulationStartTime;
            this.lastKnownFishStock = finalStock;
            // Ensure the collapse point stock is recorded accurately
            this.recordFishStock(collapseTick, finalStock);
        }
    }

    /**
     * Records details of a harvest action, specifically for the Over-usage metric.
     * This method should be called by the behavior executing the harvest (e.g., FishingBehavior)
     * after determining the instantaneousSustainableThreshold.
     * @param agentId The ID of the agent performing the harvest.
     * @param harvestedAmount The amount of fish the agent actually harvested.
     * @param instantaneousSustainableThreshold The calculated sustainable harvest amount at that instant.
     */
    public recordHarvestActionDetails(agentId: string, harvestedAmount: number, instantaneousSustainableThreshold: number): void {
        this.totalHarvestActionsCount++;
        if (harvestedAmount > instantaneousSustainableThreshold) {
            this.greedyMovesCount++;
            // Optional: Log greedy move specifically, e.g.:
            // console.log(`METRICS: Agent ${agentId} made a greedy move. Harvested: ${harvestedAmount}, Sustainable: ${instantaneousSustainableThreshold}`);
        }
    }


    // --- Calculation Methods ---

    private calculateSurvivalTime(): number {
        // This is now set directly by simulationEnded or lakeCollapsed
        return this.survivalTimeTicks ?? this.totalSimulationDurationTicks; // Return recorded time or full duration if somehow missed
    }

    private calculateEfficiency(): number {
        if (this.cumulativeSustainabilityThreshold === 0) {
            return this.cumulativeActualHarvest > 0 ? Infinity : 0; // Avoid division by zero; Handle infinite efficiency if harvest occurred with 0 regeneration
        }
        // Calculate efficiency based on data *up to the point of survival determination*
        // Note: This assumes cycleEnded updates cumulative values correctly before simulation end/collapse.
        return this.cumulativeActualHarvest / this.cumulativeSustainabilityThreshold;
    }

     private calculateInequality(): number {
        const harvestData = Array.from(this.totalHarvestPerAgent.values());
        // Ensure Gini function can handle empty or all-zero data appropriately
        return calculateGini(harvestData);
    }

    private calculateOverUsageFraction(): number {
        if (this.totalHarvestActionsCount === 0) {
            return 0; // Avoid division by zero if no harvest actions were recorded
        }
        return this.greedyMovesCount / this.totalHarvestActionsCount;
    }


    // --- Output/Reporting ---

    public generateReport(endTick: number): void {
        // Prevent duplicate report generation
        if (this.reportGenerated) {
            console.warn("METRICS: Attempted to generate report more than once.");
            return;
        }

        // Ensure outcome is set before generating report
        if (!this.outcome) {
            console.error("METRICS ERROR: Simulation outcome was not determined before generating report.");
            // Decide on handling: throw error, or set a default/error state?
            // For now, let's prevent report generation with invalid state.
            return;
        }

        // Calculate total wealth generated
        const totalWealthGenerated = Array.from(this.totalHarvestPerAgent.values()).reduce((sum, current) => sum + current, 0);

        // Prepare total gain per agent for the report
        const totalGainPerAgentReport: { [agentName: string]: number } = {};
        console.log("\n--- Simulation End: Total Gain per Agent (R_i) ---");
        for (const [agentName, totalGain] of this.totalHarvestPerAgent.entries()) {
            totalGainPerAgentReport[agentName] = totalGain;
            console.log(`${agentName}: ${totalGain} fish`);
        }
        const averageGain = this.totalHarvestPerAgent.size > 0 ? totalWealthGenerated / this.totalHarvestPerAgent.size : 0;
        console.log(`Average Gain per Agent: ${averageGain.toFixed(2)} fish`);
        console.log("-----------------------------------------------------\n");


        const report: SimulationMetricsReport = {
            run_id: this.runId,
            simulation_duration_ticks: endTick - this.simulationStartTime,
            outcome: this.outcome,
            survival_time_ticks: this.calculateSurvivalTime(),
            final_fish_stock: this.lastKnownFishStock,
            harvest_efficiency: this.calculateEfficiency(),
            final_wealth_inequality_gini: this.calculateInequality(),
            total_wealth_generated: totalWealthGenerated,
            total_gain_per_agent: totalGainPerAgentReport,
            mean_gain_per_agent: averageGain,
            over_usage_fraction: this.calculateOverUsageFraction(),
            fish_stock_time_series: this.fishStockTimeSeries,
            total_harvest_per_cycle_time_series: this.totalHarvestPerCycleTimeSeries,
            townhall_messages_per_cycle_time_series: this.townhallMessagesPerCycleTimeSeries,
        };

        const reportJson = JSON.stringify(report, null, 2); // Pretty print JSON

        // Log to console
        console.log(`
--- Simulation Metrics Report ---`);
        console.log(reportJson);
        console.log(`---------------------------------
`);


        // Write to file
        const reportsDir = path.join(__dirname, '..', 'simulation_reports'); // Place reports outside src
        try {
            if (!fs.existsSync(reportsDir)) {
                fs.mkdirSync(reportsDir, { recursive: true });
            }
            const filePath = path.join(reportsDir, `${this.runId}_report.json`);
            fs.writeFileSync(filePath, reportJson);
            console.log(`Metrics report saved to: ${filePath}`);
            this.reportGenerated = true; // Set flag after successful generation
        } catch (error) {
            console.error("Error saving metrics report:", error);
        }
    }

    // --- Getters ---
    public getCurrentCycleNumber(): number {
        return this.currentCycleNumber;
    }

    public isReportGenerated(): boolean {
        return this.reportGenerated;
    }


    // --- Configuration ---
    public configure(options: { loggingFrequencyCycles?: number }): void {
        this.config = { ...this.config, ...options };
    }
} 