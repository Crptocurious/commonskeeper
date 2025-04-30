import type { EnergyState } from '../../EnergyManager';

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

export interface Memory {
  type: string;
  content: any;
  timestamp: number;
}

export class ScratchMemory {
  private lakeState: LakeObservation | null = null;
  private agentEnergies: Map<string, AgentEnergyObservation> = new Map();
  private selfId: string;
  private memories: Memory[] = []; // Array to store various types of memories
  private maxMemories: number = 100; // Maximum number of memories to store

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

  // New methods to support the Plan module

  /**
   * Add a new memory to the memory store
   */
  addMemory(memory: Memory): void {
    this.memories.push(memory);
    
    // Trim memories if we exceed the maximum
    if (this.memories.length > this.maxMemories) {
      this.memories = this.memories.slice(-this.maxMemories);
    }
  }

  /**
   * Get all memories
   */
  getAllMemories(): Memory[] {
    return [...this.memories];
  }

  /**
   * Get recent memories, optionally filtered by type and age
   */
  getRecentMemories(options?: { 
    maxCount?: number, 
    types?: string[], 
    maxAgeMs?: number 
  }): Memory[] {
    const { 
      maxCount = 20, 
      types, 
      maxAgeMs = 5 * 60 * 1000 // Default 5 minutes
    } = options || {};
    
    const now = Date.now();
    
    return this.memories
      .filter(memory => 
        // Filter by age
        (maxAgeMs === 0 || now - memory.timestamp <= maxAgeMs) &&
        // Filter by type if specified
        (!types || types.includes(memory.type))
      )
      .sort((a, b) => b.timestamp - a.timestamp) // Sort newest first
      .slice(0, maxCount);
  }

  /**
   * Get memories of a specific type
   */
  getMemoriesByType(type: string, maxCount: number = 10): Memory[] {
    return this.memories
      .filter(memory => memory.type === type)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, maxCount);
  }

  /**
   * Clear all memories
   */
  clearMemories(): void {
    this.memories = [];
  }

  /**
   * Get the agent's ID
   */
  getSelfId(): string {
    return this.selfId;
  }
} 