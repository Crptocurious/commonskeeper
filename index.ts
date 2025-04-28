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
	PlayerEntity,
	PlayerEvent,
	Vector3,
	EntityEvent
} from "hytopia";

import worldMap from "./assets/map.json";
import { BaseAgent } from "./src/BaseAgent";
import { FishingBehavior } from "./src/behaviors/FishingBehavior";
import { Lake } from "./src/Lake";
import { logEvent } from "./src/logger";
import { PathfindingBehavior } from "./src/behaviors/PathfindingBehavior";

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

// Instantiate the Lake globally
const lake = new Lake(10, 5, 1); // Capacity=100, InitialStock=50, RegenRate=1 fish/tick

const LOCATIONS = {
	pier: { x: 31.5, y: 3, z: 59.5 },
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

// Broadcast agent thoughts and inventory to all players
export function broadcastAgentThoughts(world: any) {

	const agentEntities = world.entityManager
 				.getAllEntities()
 				.filter((e: any) => e instanceof BaseAgent) as BaseAgent[];

	const agentDataForUI = agentEntities.map((agent: any) => {
		const agentState = agent.getCurrentState();
		return {
			name: agent.name,
			lastThought: agent.getLastThought() || "Idle",
			energy: agentState.energy,
			maxEnergy: agentState.maxEnergy,
			inventory: agentState.inventory
		};
	});

	const playerEntities = world.entityManager.getAllPlayerEntities();

	playerEntities.forEach((playerEntity: any) => {
		const player = playerEntity.player;
		if (player && player.ui) {
			player.ui.sendData({
				type: 'agentThoughts',
				agents: agentDataForUI
			});
		}
	});
}

startServer((world) => {
	// Log game start with initial configuration
	const lakeState = lake.getState();
	logEvent({
		type: "game_start",
		lake_config: {
			capacity: lakeState.capacity,
			initial_stock: lakeState.stock,
			regen_rate: lake.regenRate
		},
		agents: agents.map(agent => ({
			name: agent.getName(),
			type: "fisherman"
		}))
	});

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

		playerEntity.spawn(world, { x: 31.5, y: 3, z: 55 });
		player.ui.load('ui/index.html'); // This loads the UI for the player

		sendLakeStatus(world, lake);
		broadcastAgentThoughts(world);
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
	 * Spawn Jim the Fisherman
	 *
	 * Jim is our only agent, who fishes at the pier
	 */
	const jimTheFisherman = new BaseAgent({
		name: "Jim the Fisherman",
		systemPrompt: `You are Jim the Fisherman, a slightly eccentric character who loves fishing and telling tales about "the one that got away". 
				You speak with a folksy charm and often use fishing metaphors but you can be a bit grumpy if pushed.
				You're always happy to chat about fishing spots, share fishing tips, or tell stories about your greatest catches.
				When speaking, occasionally use phrases like "I reckon", "Let me tell ya", and "Back in my day".
				You're also quite knowledgeable about the local area, having fished these waters for decades.

        You act like a normal person, and your internal monologue is detailed and realistic. You think deeply about your actions and decisions.

        You have a simple daily routine:
        - To catch some fish for food at pier`,
	});
	
	jimTheFisherman.addBehavior(new FishingBehavior(lake));
	// Add pathfinding behavior
	const pathfindingBehavior = new PathfindingBehavior();
	jimTheFisherman.addBehavior(pathfindingBehavior);

	// Spawn Jim at the pier
	const jimStartPos = new Vector3(LOCATIONS.pier.x, LOCATIONS.pier.y, LOCATIONS.pier.z - 40);
	jimTheFisherman.spawn(world, jimStartPos);
	agents.push(jimTheFisherman);

	// Check if Jim is at the pier, if not, pathfind to pier
	const pierPos = new Vector3(LOCATIONS.pier.x, LOCATIONS.pier.y, LOCATIONS.pier.z);
	const distToPier = Vector3.fromVector3Like(jimTheFisherman.position).distance(pierPos);
	if (distToPier > 3) {
		// Use the PathfindingBehavior's tool call interface
		pathfindingBehavior.onToolCall(
			jimTheFisherman,
			world,
			"pathfindTo",
			{ coordinates: { x: LOCATIONS.pier.x, y: LOCATIONS.pier.y, z: LOCATIONS.pier.z } }
		);
	}
});
