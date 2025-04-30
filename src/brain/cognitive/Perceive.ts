import type { Lake } from '../Lake';
import type { EnergyManager } from '../EnergyManager';
import { ScratchMemory } from './ScratchMemory';
import { logEvent } from '../logger';

export interface AgentObservation {
  agentId: string;
  energyManager: EnergyManager;
}

export class Perceive {
  private scratchMemory: ScratchMemory;
  private lastPerceptionTime: number = 0;
  private perceptionIntervalMs: number;

  constructor(
    selfId: string,
    perceptionIntervalMs: number = 1000 // Minimum time between perceptions
  ) {
    this.scratchMemory = new ScratchMemory(selfId);
    this.perceptionIntervalMs = perceptionIntervalMs;
  }

  /**
   * Perceive the lake's current state
   */
  perceiveLake(lake: Lake): void {
    const now = Date.now();
    if (now - this.lastPerceptionTime < this.perceptionIntervalMs) {
      return; // Too soon to perceive again
    }

    const lakeState = lake.getState();
    const observation = {
      stock: lakeState.stock,
      capacity: lakeState.capacity,
      isCollapsed: lake.isCollapsed()
    };

    this.scratchMemory.updateLakeObservation(observation);
    
    // Log significant changes or critical states
    if (observation.stock <= observation.capacity * 0.2) { // Lake at 20% or less
      logEvent({
        type: 'lake_critical',
        stock: observation.stock,
        capacity: observation.capacity,
        percentageRemaining: (observation.stock / observation.capacity) * 100
      });
    }

    this.lastPerceptionTime = now;
  }

  /**
   * Perceive energy levels of visible agents
   * Returns number of agents successfully observed
   */
  perceiveAgentEnergies(visibleAgents: AgentObservation[]): number {
    const now = Date.now();
    if (now - this.lastPerceptionTime < this.perceptionIntervalMs) {
      return 0; // Too soon to perceive again
    }

    // Clear old observations before new perception
    this.scratchMemory.clearStaleObservations();
    
    for (const agent of visibleAgents) {
      const energyState = agent.energyManager.getState();
      this.scratchMemory.updateAgentEnergy(agent.agentId, energyState);

      // Log critical energy states
      if (energyState.currentEnergy <= energyState.maxEnergy * 0.2) { // Agent at 20% or less energy
        logEvent({
          type: 'agent_critical_energy',
          agentId: agent.agentId,
          currentEnergy: energyState.currentEnergy,
          maxEnergy: energyState.maxEnergy,
          percentageRemaining: (energyState.currentEnergy / energyState.maxEnergy) * 100
        });
      }
    }

    this.lastPerceptionTime = now;
    return visibleAgents.length;
  }

  /**
   * Get the scratch memory containing all current observations
   */
  getScratchMemory(): ScratchMemory {
    return this.scratchMemory;
  }

  /**
   * Get fresh observations of agent energies
   */
  getFreshAgentObservations(maxAgeMs?: number): ReturnType<ScratchMemory['getFreshAgentEnergies']> {
    return this.scratchMemory.getFreshAgentEnergies(maxAgeMs);
  }

  /**
   * Get the most recent lake observation
   */
  getCurrentLakeState(): ReturnType<ScratchMemory['getLakeState']> {
    return this.scratchMemory.getLakeState();
  }
} 