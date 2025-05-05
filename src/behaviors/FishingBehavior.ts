import { Vector3} from "hytopia";
import { BaseAgent, type AgentBehavior } from "../BaseAgent";
import { Lake } from "../Lake";
import { logEvent } from "../logger";
import { LOCATIONS, SIMULATION_CONFIG } from "../config/constants";
import type { GameWorld } from "../types/GameState";

interface FishResult {
	success: boolean;
	harvestedAmount: number;
}

interface FishingState {
	isFishing: boolean;
	fishRemaining: number;
	capacity: number;
}

/**
 * This is a simple implementation of a fishing behavior for Agents.
 * It uses the Lake class to simulate a realistic fishing environment
 * with capacity, regeneration, and potential collapse.
 */
export class FishingBehavior implements AgentBehavior {
	private isFishing: boolean = false;
	private readonly PIER_LOCATION = new Vector3(LOCATIONS.pier.x, LOCATIONS.pier.y, LOCATIONS.pier.z);
	private readonly FISHING_RANGE = SIMULATION_CONFIG.FISH_RANGE;
	private lakeManager: Lake;

	constructor(lake: Lake) {
		this.lakeManager = lake;
	}

	onUpdate(agent: BaseAgent, world: GameWorld): void {
		// Could add ambient fishing animations here if needed
	}

	private isNearPier(agent: BaseAgent): boolean {
		const distance = Vector3.fromVector3Like(agent.position).distance(
			this.PIER_LOCATION
		);
		return distance <= this.FISHING_RANGE;
	}

	private rollForFish(world: GameWorld): FishResult {
		const harvestedAmount = this.lakeManager.harvest(1, world.currentTick, world);
		return {
			success: harvestedAmount > 0,
			harvestedAmount: harvestedAmount
		};
	}

	onToolCall(
		agent: BaseAgent,
		world: GameWorld,
		toolName: string,
		args: any
	): string | void {
		if (toolName === "cast_rod") {
			console.log("Fishing tool called");

			// --- Phase and Turn Check ---
			if (agent.currentAgentPhase !== 'HARVESTING') {
				console.log(`${agent.name} tried to fish during ${agent.currentAgentPhase} phase.`);
				return `You can only fish during the HARVESTING phase. It is currently ${agent.currentAgentPhase}.`;
			}

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
			agent.startModelLoopedAnimations(["idle_upper", "idle_lower"]); // Could be replaced with a fishing animation

			// Simulate fishing time
			setTimeout(() => {
				this.isFishing = false;
				const result = this.rollForFish(world);

				if (!result.success) {
					agent.handleEnvironmentTrigger(
						"Nothing seems to be biting..."
					);
					return;
				}

				// Record the successful harvest for metrics
				world.metricsTracker.recordAgentHarvest(agent.name, result.harvestedAmount);

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
			const { target } = args;
			const fishDescription = "fish";

			if (!agent.removeFromInventory({name: fishDescription, quantity: 1})) {
				return "You don't have that fish anymore!";
			}

			const nearbyEntities = agent.getNearbyEntities(SIMULATION_CONFIG.CHAT_RANGE);
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
						metadata: {},
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

You must be within ${this.FISHING_RANGE} meters of the pier to fish.
Each attempt takes 5 seconds and has a chance to catch nothing or a fish.
You can only have one line in the water at a time.
Fishing is only allowed during the HARVEST phase and only one agent can fish per tick.`;
	}

	getState(): string {
		return this.isFishing ? "Currently fishing" : "Not fishing";
	}
}
