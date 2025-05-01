import { Vector3, World } from "hytopia";
import { BaseAgent, type AgentBehavior } from "../BaseAgent";
import { Lake } from "../Lake";
import { logEvent } from "../logger";
import { isWithinWindow } from "../utils/timeUtils";

// Harvesting schedule configuration
const HARVEST_INTERVAL_TICKS = 3600 * 60; // 1 hour (assuming 60 TPS)
const HARVEST_DURATION_TICKS = 600 * 60;  // 10 minutes (assuming 60 TPS)

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
		// Could add ambient fishing animations here if needed
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

			// --- Phase and Turn Check ---
			if (agent.currentPhase !== 'HARVEST') {
				console.log(`${agent.name} tried to fish during ${agent.currentPhase} phase.`);
				return `You can only fish during the HARVEST phase. It is currently ${agent.currentPhase}.`;
			}

			if (!agent.canAttemptFishThisTick) {
				console.log(`${agent.name} tried to fish, but it's not their turn.`);
				return `It's not your turn to fish right now. Wait for the others.`;
			}
			// --- End Phase and Turn Check ---

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

			// Reset the fishing turn flag immediately after starting the attempt
			// This prevents multiple casts if the agent calls the tool again before the timeout finishes
			agent.canAttemptFishThisTick = false;

			// Start fishing animation if available
			agent.stopModelAnimations(["walk_upper", "walk_lower", "run_upper", "run_lower"]);
			agent.startModelLoopedAnimations(["idle_upper", "idle_lower"]); // Could be replaced with a fishing animation

			// Simulate fishing time
			setTimeout(() => {
				this.isFishing = false;
				const result = this.rollForFish(world);

				if (!result.success) {
					this.failedAttempts++;
					if (this.failedAttempts >= 3) {
						// Agent no longer despawns here due to failed fishing.
						// EnergyManager should handle consequences of low energy.
						// agent.handleEnvironmentTrigger(
						// 	"You've failed to catch fish too many times and have starved to death..."
						// );
						// agent.despawn(); // Removed this line
						// return; // Keep the return to avoid the "Nothing biting" message if >= 3 failures occurred.

						// Maybe log a warning instead?
						console.warn(`${agent.name} has failed to fish 3 times in a row. Potential starvation risk if energy is low.`);
						// Let the agent report the failure back to the LLM
						agent.handleEnvironmentTrigger(
							"You've failed to catch fish 3 times in a row. You might be starving if your energy is low and the lake is empty."
						);
						return;
					}
					agent.handleEnvironmentTrigger(
						"Nothing seems to be biting..."
					);
					return;
				}

				agent.addToInventory({
					name: "fish",
					quantity: result.harvestedAmount,
					metadata: {},
				});

				agent.handleEnvironmentTrigger(
					`You caught ${result.harvestedAmount} fish!`
				);
			}, 5000); // 5 second fishing time

			return "Casting your line...";
		} else if (toolName === "give_fish") {
			const { size, weight, target } = args;
			const fishDescription = `${size} fish`;

			if (!agent.removeFromInventory(fishDescription, 1)) {
				return "You don't have that fish anymore!";
			}

			const nearbyEntities = agent.getNearbyEntities(5);
			const targetEntity = nearbyEntities.find((e) => e.name === target);

			if (!targetEntity) {
				return `Cannot find ${target} nearby. Try getting closer to them.`;
			}

			// Add to target's inventory if it's an agent
			if (targetEntity.type === "Agent") {
				const targetAgent = world.entityManager
					.getAllEntities()
					.find(
						(e) => e instanceof BaseAgent && e.name === target
					) as BaseAgent;

				if (targetAgent) {
					targetAgent.addToInventory({
						name: fishDescription,
						quantity: 1,
						metadata: { size, weight },
					});
				}
			}

			return `Successfully gave ${fishDescription} to ${target}`;
		}
	}

	getPromptInstructions(): string {
		return `
To fish at the pier (ONLY during HARVEST phase and when it's your turn): 
<action type="cast_rod"></action>

You must call cast_rod exactly like this, with the empty object inside the action tag.

To give a fish to another agent:
<action type="give_fish">
{
    target: "name of the player or agent to give the fish to"
}
</action>

You must be within 5 meters of the pier to fish.
Each attempt takes 5 seconds and has a chance to catch nothing or a fish.
You can only have one line in the water at a time.
Fishing is only allowed during the HARVEST phase and only one agent can fish per tick.`;
	}

	getState(): string {
		return this.isFishing ? "Currently fishing" : "Not fishing";
	}
}
