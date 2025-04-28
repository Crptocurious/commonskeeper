import { Vector3, World } from "hytopia";
import { BaseAgent, type AgentBehavior } from "../BaseAgent";
import { LakeResourceManager } from "../ResourceManager";

interface FishResult {
	success: boolean;
}

/**
 * This is a simple implementation of a fishing behavior for Agents.
 * It uses the LakeResourceManager to simulate a realistic fishing environment
 * where success depends on the current fish population in the lake.
 */
export class FishingBehavior implements AgentBehavior {
	private isFishing: boolean = false;
	private readonly PIER_LOCATION = new Vector3(31.5, 3, 59.5);
	private readonly FISHING_RANGE = 5; // meters
	private lakeManager: LakeResourceManager;
	private failedAttempts: number = 0;

	constructor(world: World) {
		this.lakeManager = new LakeResourceManager(world);
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

	private rollForFish(): FishResult {
		return {
			success: this.lakeManager.tryToFish()
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
				const result = this.rollForFish();

				if (!result.success) {
					this.failedAttempts++;
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
					quantity: 1
				});

				const fishRemaining = this.lakeManager.getFishRemaining();
				console.log(`Fish caught! ${fishRemaining} remaining in the lake.`);
			}, 5000); // 5 second fishing time

			return "Casting your line...";
		}
	}

}
