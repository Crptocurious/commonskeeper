import { World } from "hytopia";

interface LakeState {
    fishRemaining: number;
}

export class LakeResourceManager {
    private lakeState: LakeState;

    constructor(world: World) {
        this.lakeState = {
            fishRemaining: 5
        };
    }

    public tryToFish(): boolean {
        if (this.lakeState.fishRemaining > 0) {
            this.lakeState.fishRemaining--;
            return true;
        }
        return false;
    }

    public getFishRemaining(): number {
        return this.lakeState.fishRemaining;
    }
} 