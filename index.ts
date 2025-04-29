/**
 * HYTOPIA SDK Boilerplate
 *
 * This is a simple boilerplate to get started on your project.
 * It implements the bare minimum to be able to run and connect
 * to your game server and run around as the basic player entity.
 *
 * From here you can begin to implement your own game logic
 * or do whatever you want!
 *
 * You can find documentation here: https://github.com/hytopiagg/sdk/blob/main/docs/server.md
 *
 * For more in-depth examples, check out the examples folder in the SDK, or you
 * can find it directly on GitHub: https://github.com/hytopiagg/sdk/tree/main/examples/payload-game
 *
 * You can officially report bugs or request features here: https://github.com/hytopiagg/sdk/issues
 *
 * To get help, have found a bug, or want to chat with
 * other HYTOPIA devs, join our Discord server:
 * https://discord.gg/DXCXJbHSJX
 *
 * Official SDK Github repo: https://github.com/hytopiagg/sdk
 * Official SDK NPM Package: https://www.npmjs.com/package/hytopia
 */

import {
	startServer,
	Audio,
	ChatEvent,
	Player,
	PlayerEntity,
	PlayerEvent,
	Vector3,
	EntityEvent,
} from "hytopia";

import worldMap from "./assets/map.json";
import { FollowBehavior } from "./src/behaviors/FollowBehavior";
import { BaseAgent } from "./src/BaseAgent";
import { PathfindingBehavior } from "./src/behaviors/PathfindingBehavior";
import { SpeakBehavior } from "./src/behaviors/SpeakBehavior";
import { TradeBehavior } from "./src/behaviors/TradeBehavior";
import { FishingBehavior } from "./src/behaviors/FishingBehavior";

import { Lake } from "./src/Lake";
import { logEvent } from "./src/logger";

/**
 * startServer is always the entry point for our game.
 * It accepts a single function where we should do any
 * setup necessary for our game. The init function is
 * passed a World instance which is the default
 * world created by the game server on startup.
 *
 * Documentation: https://github.com/hytopiagg/sdk/blob/main/docs/server.startserver.md
 */

// Store agents globally
const agents: BaseAgent[] = [];
const CHAT_RANGE = 10; // Distance in blocks for proximity chat

// Instantiate the lake globally
const lake = new Lake(10, 5, 1); // Capacity=100, InitialStock=50, RegenRate=1 fish/tick

const LOCATIONS = {
	pier: { x: 31.5, y: 3, z: 59.5 }
};

// Helper to send lake status to UI (now only used as an event handler)
function sendLakeStatus(world: any, lake: any) {
	const { stock, capacity } = lake.getState();
	const playerEntities = world.entityManager.getAllPlayerEntities();
	playerEntities.forEach((playerEntity: any) => {
		const player = playerEntity.player;
		if (player && player.ui) {
			player.ui.sendData({
				type: 'lakeUpdate',
				stock: stock,
				capacity: capacity
			});
		}
	});
}

// Register the event handler for lake updates
lake.on('lakeUpdated', sendLakeStatus);

startServer((world) => {
	/**
	 * Enable debug rendering of the physics simulation.
	 * This will overlay lines in-game representing colliders,
	 * rigid bodies, and raycasts. This is useful for debugging
	 * physics-related issues in a development environment.
	 * Enabling this can cause performance issues, which will
	 * be noticed as dropped frame rates and higher RTT times.
	 * It is intended for development environments only and
	 * debugging physics.
	 */

	// world.simulation.enableDebugRendering(true);

	/**
	 * Load our map.
	 * You can build your own map using https://build.hytopia.com
	 * After building, hit export and drop the .json file in
	 * the assets folder as map.json.
	 */
	world.loadMap(worldMap);

	const lakeState = lake.getState();
	logEvent({
		type: "game_start",
		lake_config: {
			capacity: lakeState.capacity,
			initial_stock: lakeState.stock,
			regen_rate: lake.regenRate
		},
		agents: agents.map(agent => ({
			name: agent.name
		}))
	});

	/**
	 * World Tick Event: Regenerate Lake (Attempting via EntityEvent.TICK on world)
	 */
	world.on(EntityEvent.TICK, (payload: any) => {
		const { deltaTimeMs } = payload as { deltaTimeMs: number };
		lake.regenerate(world);
	});

	/**
	 * Handle player joining the game. The onPlayerJoin
	 * function is called when a new player connects to
	 * the game. From here, we create a basic player
	 * entity instance which automatically handles mapping
	 * their inputs to control their in-game entity and
	 * internally uses our player entity controller.
	 */
	world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
		const playerEntity = new PlayerEntity({
			player,
			name: "Player",
			modelUri: "models/players/player.gltf",
			modelLoopedAnimations: ["idle"],
			modelScale: 0.5,
		});

		playerEntity.spawn(world, { x: 0, y: 10, z: 0 });
		player.ui.load("ui/index.html");

		// Send a nice welcome message that only the player who joined will see ;)
		world.chatManager.sendPlayerMessage(
			player,
			"Welcome to the game!",
			"00FF00"
		);
		world.chatManager.sendPlayerMessage(player, "Use WASD to move around.");
		world.chatManager.sendPlayerMessage(player, "Press space to jump.");
		world.chatManager.sendPlayerMessage(player, "Hold shift to sprint.");
		world.chatManager.sendPlayerMessage(
			player,
			"Press \\ to enter or exit debug view."
		);

		sendLakeStatus(world, lake);

		player.ui.sendData({
			type: "agentThoughts",
			agents: agents.map((agent) => {
				const agentState = agent.getCurrentState();
				return {
					name: agent.name,
					lastThought: agent.getLastMonologue() || "Idle",
					energy: agentState.energy,
					maxEnergy: agentState.maxEnergy,
					inventory: agentState.inventory
				};
			}),
		});
	});

	/**
	 * Handle player leaving the game. The onPlayerLeave
	 * function is called when a player leaves the game.
	 * Because HYTOPIA is not opinionated on join and
	 * leave game logic, we are responsible for cleaning
	 * up the player and any entities associated with them
	 * after they leave. We can easily do this by
	 * getting all the known PlayerEntity instances for
	 * the player who left by using our world's EntityManager
	 * instance.
	 */
	world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
		world.entityManager
			.getPlayerEntitiesByPlayer(player)
			.forEach((entity) => entity.despawn());
	});

	/**
	 * Play some peaceful ambient music to
	 * set the mood!
	 */

	new Audio({
		uri: "audio/music/hytopia-main.mp3",
		loop: true,
		volume: 0.1,
	}).play(world);

	/**
	 * Spawn agents for simulation
	 *
	 * The simulation will start as soon as the server starts, even if no players are connected.
	 * Beware that your inference key will be charged for the number of tokens used by the agents.
	 * The cost may increase over time as agent memory & context size increases, which increases the number of tokens used in requests.
	 *
	 * It is recommended that you use OpenAI's API for inference as they will automatically cache input tokens, which will reduce your costs.
	 */

	/**
	 * General agent instructions
	 *
	 * These instructions are used for all agents. You can update these instructions to change global behavior or nudge agents to act in a certain way.
	 * In this example, I include the coordinates of some cool locations on the map that agents can travel to.
	 */
	const generalAgentInstructions = `
    Think through whether you need to respond to the message. Take into account all of the context you have access to.
    Is this person talking to you? Could they be talking to someone else?
    Do you need to call a tool to help them or take an action?

    You can plan long term actions but you can update your plans on the fly by taking actions in the world.

    Key locations in the map and their coordinates:
    - ${Object.entries(LOCATIONS)
		.map(([key, value]) => `${key}: ${value.x}, ${value.y}, ${value.z}`)
		.join(", ")}

    If you pathfind to one of these locations, you can use the pathfindTo with the location coordinates as arguments.

    If you call the speak tool, or another tool where you can also send a message at the same time, this is when you snap into character.
    Your internal thought process should be clear, concise, and expertly analyze the situation.
    `;

	/**
	 * Spawn Jim the Fisherman
	 *
	 * Jim is set up similarly to Bob, but he also has a special FishingBehavior which allows him to fish on a timer.
	 */
	const jimTheFisherman = new BaseAgent({
		name: "Jim the Fisherman",
		systemPrompt: `You are Jim the Fisherman, a slightly eccentric character who loves fishing and telling tales about "the one that got away". 
				You speak with a folksy charm and often use fishing metaphors but you can be a bit grumpy if pushed.
				You're always happy to chat about fishing spots, share fishing tips, or tell stories about your greatest catches.
				When speaking, occasionally use phrases like "I reckon", "Let me tell ya", and "Back in my day".
				You're also quite knowledgeable about the local area, having fished these waters for decades.

        You act like a normal person, and your internal monologue is detailed and realistic. You think deeply about your actions and decisions.

        When you have nothing else to do, you can often be found fishing at the pier, or maybe you can come up with something else to do.

        You spawn at the pier.
        ${generalAgentInstructions}`,
	});
	jimTheFisherman.addBehavior(new FollowBehavior());
	jimTheFisherman.addBehavior(new PathfindingBehavior());
	jimTheFisherman.addBehavior(new SpeakBehavior());
	jimTheFisherman.addBehavior(new TradeBehavior());
	jimTheFisherman.addBehavior(new FishingBehavior(lake));
	jimTheFisherman.spawn(world, new Vector3(31.5, 3, 61.5));
	agents.push(jimTheFisherman);

	/**
	 * Instead of a chat command, we can override the chat message broadcast
	 * to automatically respond to the player.
	 */
	world.chatManager.on(ChatEvent.BROADCAST_MESSAGE, ({ player, message }) => {
		const agents = world.entityManager
			.getAllEntities()
			.filter((entity) => entity instanceof BaseAgent) as BaseAgent[];

		if (!player) {
			// Look for Agent name in [] at beginning of message
			const agentName = message.match(/\[([^\]]+)\]/)?.[1];
			if (agentName) {
				const sourceAgent = agents.find(
					(agent) => agent.name === agentName
				);
				if (sourceAgent) {
					// Send message to other agents within 10 meters
					agents.forEach((targetAgent) => {
						if (targetAgent !== sourceAgent) {
							const distance = Vector3.fromVector3Like(
								sourceAgent.position
							).distance(
								Vector3.fromVector3Like(targetAgent.position)
							);

							if (distance <= 10) {
								targetAgent.chat({
									type: "Agent",
									message,
									agent: sourceAgent,
								});
							}
						}
					});
				}
			}
			return;
		}

		const playerEntity =
			world.entityManager.getPlayerEntitiesByPlayer(player)[0];

		// Send message to any agents within 10 meters
		agents.forEach((agent) => {
			const distance = Vector3.fromVector3Like(
				playerEntity.position
			).distance(Vector3.fromVector3Like(agent.position));

			if (distance <= 10) {
				agent.chat({
					type: "Player",
					message,
					player,
				});
			}
		});
	});
});
