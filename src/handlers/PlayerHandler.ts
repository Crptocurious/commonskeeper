import { World, Player, PlayerEntity, Audio } from "hytopia";
import { BaseAgent } from "../BaseAgent";
import { UIService } from "../services/UIService";
import { Lake } from "../Lake";
import { SPAWN_LOCATIONS } from "../config/constants";

export class PlayerHandlers {
    static handlePlayerJoin(world: World, player: Player, agents: BaseAgent[], lake: Lake) {
        // Create and spawn player entity
        const playerEntity = new PlayerEntity({
            player,
            name: "Player",
            modelUri: "models/players/player.gltf",
            modelLoopedAnimations: ["idle"],
            modelScale: 0.5,
        });

        playerEntity.spawn(world, SPAWN_LOCATIONS.player);
        player.ui.load("ui/index.html");

        // Send welcome messages
        world.chatManager.sendPlayerMessage(player, "Welcome to the game!", "00FF00");
        world.chatManager.sendPlayerMessage(player, "Use WASD to move around.");
        world.chatManager.sendPlayerMessage(player, "Press space to jump.");
        world.chatManager.sendPlayerMessage(player, "Hold shift to sprint.");
        world.chatManager.sendPlayerMessage(player, "Press \\ to enter or exit debug view.");

    }

    static handlePlayerLeave(world: World, player: Player) {
        world.entityManager
            .getPlayerEntitiesByPlayer(player)
            .forEach((entity) => entity.despawn());
    }
} 