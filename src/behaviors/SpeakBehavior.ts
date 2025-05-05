import { World, Player } from "hytopia";
import type { AgentBehavior, BaseAgent } from "../BaseAgent";
import { buildSpeakPrompt } from "../config/prompts";

/**
 * Very simple implementation of speak behavior for Agents.
 * You can imagine how this could be extended to include more complex behaviors like Text-to-Speech.
 * It has no state, and no callbacks.
 */
export class SpeakBehavior implements AgentBehavior {
	onUpdate(agent: BaseAgent, world: World): void {}

	getPromptInstructions(): string {
		return buildSpeakPrompt();
	}

	getState(): string {
		return "";
	}

	onToolCall(
		agent: BaseAgent,
		world: World,
		toolName: string,
		args: { message: string }
	): string | void {
		if (toolName === "speak") {
			// This behavior now ONLY handles setting the local chat UI bubble
			// The actual message broadcasting (nearby) happens in BaseAgent.handleToolCall
			agent.setChatUIState({ message: args.message });

			// Optional: Log that the local speak action was triggered
			console.log(`Agent ${agent.name} used nearby speak action: ${args.message}`);

			// Original broadcast logic removed from here - now handled in BaseAgent
			// if (world) { ... world.chatManager.sendBroadcastMessage ... }

			// Clear message after delay
			setTimeout(() => {
				agent.setChatUIState({ message: "" });
			}, 5300);

			return "You said (nearby): " + args.message;
		}

		// Note: townhall_speak is handled directly in BaseAgent.handleToolCall
		// This behavior doesn't need to handle it.
	}
}
