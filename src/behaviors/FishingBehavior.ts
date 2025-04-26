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
		// Could add ambient fishing animations here if needed
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
						// Dramatic death sequence using UI
						agent.setChatUIState({ message: "⚠️ CRITICAL: STARVATION IMMINENT ⚠️" });
						agent.handleEnvironmentTrigger("*Your vision starts to blur from hunger...*");
						
						setTimeout(() => {
							agent.setChatUIState({ message: "💀 DEATH APPROACHING 💀" });
							agent.handleEnvironmentTrigger("*Your legs feel weak, and you can barely stand...*");
							
							setTimeout(() => {
								agent.setChatUIState({ message: "❌ VITAL SIGNS CRITICAL ❌" });
								agent.handleEnvironmentTrigger("*With one final gasp, you collapse from starvation...*");
								
								setTimeout(() => {
									agent.setChatUIState({ message: "💀 GAME OVER - DEATH BY STARVATION 💀" });
									agent.handleEnvironmentTrigger("💀 GAME OVER - You have died of hunger 💀");
									agent.despawn();
								}, 1000);
							}, 1000);
						}, 1000);
						return;
					}
					
					// Warning message for failed attempt
					agent.setChatUIState({ 
						message: `⚠️ HUNGER WARNING: ${3 - this.failedAttempts} attempts remaining! ⚠️` 
					});
					agent.handleEnvironmentTrigger(
						`⚠️ No fish caught! WARNING: ${3 - this.failedAttempts} attempts remaining before starvation! ⚠️`
					);
					return;
				}

				// Reset failed attempts on successful catch
				this.failedAttempts = 0;
				agent.addToInventory({
					name: "fish",
					quantity: 1
				});

				const fishRemaining = this.lakeManager.getFishRemaining();
				agent.setChatUIState({ 
					message: `🐟 Fish Caught! (${fishRemaining} remaining)` 
				});
				agent.handleEnvironmentTrigger(
					`🐟 You caught a fish! ${fishRemaining} fish remaining in the lake.`
				);
			}, 5000); // 5 second fishing time

			return "Casting your line...";
		}
	}

	getPromptInstructions(): string {
		return `
To fish at the pier, use:
<action type="cast_rod"></action>

You must call cast_rod exactly like this, with the empty object inside the action tag.
You must be within 5 meters of the pier to fish.`;
	}

	getState(): string {
		const fishRemaining = this.lakeManager.getFishRemaining();
		return this.isFishing ? 
			"Currently fishing" : 
			`Not fishing (Fish remaining: ${fishRemaining}, Failed attempts: ${this.failedAttempts})`;
	}
}
