import type { EnergyState } from '../EnergyManager';

export interface LakeObservation {
  stock: number;
  capacity: number;
  isCollapsed: boolean;
  lastObservedAt: number;
}

export interface AgentEnergyObservation {
  agentId: string;
  energyState: EnergyState;
  lastObservedAt: number;
}

export class ScratchMemory {
  private lakeState: LakeObservation | null = null;
  private agentEnergies: Map<string, AgentEnergyObservation> = new Map();
  private selfId: string;

  constructor(selfId: string) {
    this.selfId = selfId;
  }

  updateLakeObservation(observation: Omit<LakeObservation, 'lastObservedAt'>): void {
    this.lakeState = {
      ...observation,
      lastObservedAt: Date.now()
    };
  }

  updateAgentEnergy(agentId: string, energyState: EnergyState): void {
    this.agentEnergies.set(agentId, {
      agentId,
      energyState,
      lastObservedAt: Date.now()
    });
  }

  getLakeState(): LakeObservation | null {
    return this.lakeState;
  }

  getSelfEnergy(): AgentEnergyObservation | undefined {
    return this.agentEnergies.get(this.selfId);
  }

  getAgentEnergy(agentId: string): AgentEnergyObservation | undefined {
    return this.agentEnergies.get(agentId);
  }

  getAllAgentEnergies(): AgentEnergyObservation[] {
    return Array.from(this.agentEnergies.values());
  }

  // Get all observations that are not stale (within last 5 seconds)
  getFreshAgentEnergies(maxAgeMs: number = 5000): AgentEnergyObservation[] {
    const now = Date.now();
    return Array.from(this.agentEnergies.values())
      .filter(obs => now - obs.lastObservedAt <= maxAgeMs);
  }

  // Clear stale observations older than the specified age
  clearStaleObservations(maxAgeMs: number = 10000): void {
    const now = Date.now();
    for (const [agentId, obs] of this.agentEnergies.entries()) {
      if (now - obs.lastObservedAt > maxAgeMs) {
        this.agentEnergies.delete(agentId);
      }
    }
  }
} 