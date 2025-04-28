import { Vector3, World } from "hytopia";
import { BaseAgent, type AgentBehavior } from "../BaseAgent";
import { Lake } from "../Lake";
import { broadcastAgentThoughts } from "../../index";
import { logEvent } from "../logger";

interface FishResult {
	success: boolean;
	harvestedAmount: number;
}

interface FishingState {
	isFishing: boolean;
	fishRemaining: number;
	capacity: number;
	failedAttempts: number;
}

/**
 * This is a simple implementation of a fishing behavior for Agents.
 * It uses the Lake class to simulate a realistic fishing environment
 * with capacity, regeneration, and potential collapse.
 */
export class FishingBehavior implements AgentBehavior {
	private isFishing: boolean = false;
	private readonly PIER_LOCATION = new Vector3(31.5, 3, 59.5);
	private readonly FISHING_RANGE = 5; // meters
	private lakeManager: Lake;
	private failedAttempts: number = 0;

	constructor(lake: Lake) {
		this.lakeManager = lake;
	}

	onUpdate(agent: BaseAgent, world: World): void {
		// If we're not already fishing and we're near the pier, start fishing
		if (!this.isFishing && this.isNearPier(agent)) {
			this.onToolCall(agent, world, "cast_rod", {});
		}
	}

	private isNearPier(agent: BaseAgent): boolean {
		const distance = Vector3.fromVector3Like(agent.position).distance(
			this.PIER_LOCATION
		);
		return distance <= this.FISHING_RANGE;
	}

	private rollForFish(world: World): FishResult {
		const harvestedAmount = this.lakeManager.harvest(1, world);
		return {
			success: harvestedAmount > 0,
			harvestedAmount: harvestedAmount
		};
	}

	onToolCall(
		agent: BaseAgent,
		world: World,
		toolName: string,
		args: any
	): string | void {
		if (toolName === "cast_rod") {
			console.log("Fishing tool called");

			// Log the attempt
			logEvent({
				type: "agent_action_attempt",
				agentId: agent.id,
				agentName: agent.name,
				action: "cast_rod",
				nearPier: this.isNearPier(agent),
				alreadyFishing: this.isFishing
			});

			if (!this.isNearPier(agent)) {
				return "You need to be closer to the pier to fish!";
			}

			if (this.isFishing) {
				return "You're already fishing!";
			}

			this.isFishing = true;

			// Start fishing animation if available
			agent.stopModelAnimations(["walk_upper", "walk_lower", "run_upper", "run_lower"]);
			agent.startModelLoopedAnimations(["idle_upper", "idle_lower"]);

			// Simulate fishing time
			setTimeout(() => {
				this.isFishing = false;
				const result = this.rollForFish(world);

				if (!result.success) {
					this.failedAttempts++;

					// Add random small thoughts for failed attempts
					const failThoughts = [
						"No luck this time...",
						"The fish just aren't biting.",
						"I will die now..."
					];
					const thoughtIndex = (this.failedAttempts - 1) % failThoughts.length;
					const orderedThought = failThoughts[thoughtIndex] ?? "No luck this time...";
					agent.setLastThought(`No fish: ${orderedThought}`);
					broadcastAgentThoughts(world);

					if (this.failedAttempts >= 3) {
						// Handle death sequence
						console.log("Agent died from starvation");
						agent.despawn();
						return;
					}
					
					// Warning for failed attempt
					console.log(`Failed attempt ${this.failedAttempts}/3`);
					return;
				}

				// Reset failed attempts on successful catch
				this.failedAttempts = 0;
				agent.addToInventory({
					name: "fish",
					quantity: result.harvestedAmount
				});

				// Set agent thought and broadcast
				const fishCount = agent.getInventory().get("fish")?.quantity || 0;
				agent.setLastThought(`Got a fish, now I have ${fishCount} fish`);
				broadcastAgentThoughts(world);

				const fishRemaining = this.lakeManager.getState().stock;
				agent.handleEnvironmentTrigger(
					`🐟 You caught a fish! ${fishRemaining} fish remaining in the lake.`
				);
			}, 5000); // Simulate fishing time
		}
	}

	getState(): Record<string, any> {
		const fishRemaining = this.lakeManager.getState().stock;
		const capacity = this.lakeManager.getState().capacity;
		return {
			isFishing: this.isFishing,
			fishRemaining,
			capacity,
			failedAttempts: this.failedAttempts
		};
	}
}