export interface AgentToolState {
  toolName: string;
  errorCount: number;
  lastError: string | null;
  writeCount: number;
}

export class LoopBreaker {
  private toolStates = new Map<string, AgentToolState>();
  private totalSteps = 0;
  private maxSteps: number;

  constructor(maxSteps: number = 100) {
    this.maxSteps = maxSteps;
  }

  recordToolExecution(toolName: string, success: boolean, errorMessage: string | null, isWrite: boolean = false) {
    this.totalSteps++;
    let state = this.toolStates.get(toolName);
    
    if (!state) {
      state = { toolName, errorCount: 0, lastError: null, writeCount: 0 };
      this.toolStates.set(toolName, state);
    }

    if (success) {
      // Reset error count on success
      state.errorCount = 0;
      state.lastError = null;
      if (isWrite) {
        state.writeCount++;
      }
    } else {
      state.errorCount++;
      state.lastError = errorMessage;
    }
  }

  checkLoop(): { breakLoop: boolean; reason: string | null; punishMaxSteps: boolean } {
    // 1. Same tool failed 3 times in a row
    for (const [toolName, state] of this.toolStates.entries()) {
      if (state.errorCount >= 3) {
        return { 
          breakLoop: true, 
          reason: `Tool '${toolName}' failed ${state.errorCount} times consecutively. Error: ${state.lastError?.substring(0, 100)}`,
          punishMaxSteps: true 
        };
      }

      // 2. Wrote to the same file too many times (indicates getting stuck)
      // Since toolName could be 'write_file:path/to/file'
      if (state.writeCount >= 5) {
        return {
          breakLoop: true,
          reason: `Tool '${toolName}' was called to write 5 times in the same session. Loop suspected.`,
          punishMaxSteps: true
        };
      }
    }

    // 3. Exceeded 80% of max steps, force graceful shutdown soon
    if (this.totalSteps >= this.maxSteps * 0.8) {
      // Returning false for breakLoop but a warning reason can be used by the caller
      return { breakLoop: false, reason: "Approaching token/step budget limit (80%). Concluding task.", punishMaxSteps: false };
    }

    if (this.totalSteps >= this.maxSteps) {
      return { breakLoop: true, reason: "Max steps limit reached.", punishMaxSteps: false };
    }

    return { breakLoop: false, reason: null, punishMaxSteps: false };
  }

  getRemainingSteps(): number {
    return Math.max(0, this.maxSteps - this.totalSteps);
  }

  penalizeSteps() {
    // Reduce remaining steps by 50%
    const remaining = this.getRemainingSteps();
    this.maxSteps -= Math.floor(remaining / 2);
  }
}
