// --- Constants ---
const GREEN_DURATION = 30;
const YELLOW_DURATION = 5;
const RED_DURATION = 35;
const ALL_RED_DURATION = 2; // Safety clearance time

// --- Classes ---
class TrafficPhase {
  /**
   * Represents one traffic flow direction (North, South, East, or West).
   * Manages the current state (color) and its duration.
   */
  constructor(name, id) {
    this.name = name;
    this.id = id;
    this.state = "RED";
    this.timeInState = 0;
    this.queueLength = 2 + id; // Initial queue from main.js
    this.servedVehicles = 0;
    this.totalWaitTime = 0;
    this.priority = 0;
  }

  transitionTo(newState) {
    /**Transitions to a new state and resets the timer.*/
    if (this.state !== newState) {
      this.state = newState;
      this.timeInState = 0;
      console.log(`  [${this.name}] -> ${newState}`);
    }
  }

  serveVehicle() {
    /**Serves one vehicle when the light is GREEN.*/
    if (this.state === "GREEN" && this.queueLength > 0) {
      this.queueLength--;
      this.servedVehicles++;
      this.totalWaitTime += this.timeInState;
    }
  }

  tick(deltaTime = 1) {
    /**Increments time in the current state.*/
    this.timeInState += deltaTime;
    
    // Serve vehicles during green
    if (this.state === "GREEN" && this.timeInState % 3 === 0) {
      this.serveVehicle();
    }
    
    console.log(`  ${this.name.padEnd(6)} is ${this.state.padEnd(6)} (Time: ${String(this.timeInState).padStart(2, '0')}s, Queue: ${this.queueLength})`);
  }

  getAverageWait() {
    return this.servedVehicles > 0 ? (this.totalWaitTime / this.servedVehicles).toFixed(2) : 0;
  }
}

class TrafficController {
  /**
   * Manages and coordinates four traffic phases (N, S, E, W).
   * This acts as the Finite State Machine (FSM) manager.
   */
  constructor() {
    // Initialize the four phases
    this.phases = [
      new TrafficPhase("NORTH", 0),
      new TrafficPhase("SOUTH", 1),
      new TrafficPhase("EAST", 2),
      new TrafficPhase("WEST", 3)
    ];

    // Set priorities based on main.js
    this.phases[0].priority = 4; // North - highest
    this.phases[1].priority = 3; // South
    this.phases[2].priority = 2; // East
    this.phases[3].priority = 1; // West - lowest

    // Current active phase index (-1 means all red)
    this.currentPhase = -1;
    this.nextPhase = 0;
    this.allRedTimer = 0;
    this.isInAllRed = false;

    // Initialize: North-South pair starts with North GREEN
    this.phases[0].state = "GREEN";
    this.phases[1].state = "RED";
    this.phases[2].state = "RED";
    this.phases[3].state = "RED";
    this.currentPhase = 0;

    console.log("4-Way Traffic Controller Initialized");
    console.log("N-S-E-W Priority System Active");
    console.log("-".repeat(50));
  }

  selectNextPhase() {
    /**
     * Selects the next phase to get green light.
     * Uses round-robin with priority consideration.
     */
    // Simple round-robin through all four directions
    this.nextPhase = (this.currentPhase + 1) % 4;
    
    // Could enhance with priority/queue-based selection here
    // For now, maintaining simple rotation: N -> S -> E -> W -> N
    
    console.log(`  Next phase selected: ${this.phases[this.nextPhase].name}`);
  }

  transitionPhases() {
    /**
     * Handles the state machine transitions for all four phases.
     * Ensures proper sequencing: GREEN -> YELLOW -> ALL-RED -> next GREEN
     */
    const current = this.phases[this.currentPhase];

    // Handle ALL-RED transition period
    if (this.isInAllRed) {
      this.allRedTimer++;
      if (this.allRedTimer >= ALL_RED_DURATION) {
        // End all-red, start next phase green
        this.isInAllRed = false;
        this.allRedTimer = 0;
        this.currentPhase = this.nextPhase;
        this.phases[this.currentPhase].transitionTo("GREEN");
        console.log(`  === ${this.phases[this.currentPhase].name} now has GREEN ===`);
      }
      return;
    }

    // Handle current phase transitions
    if (current.state === "GREEN" && current.timeInState >= GREEN_DURATION) {
      current.transitionTo("YELLOW");
    } 
    else if (current.state === "YELLOW" && current.timeInState >= YELLOW_DURATION) {
      current.transitionTo("RED");
      this.selectNextPhase();
      this.isInAllRed = true;
      console.log(`  === ALL-RED safety clearance (${ALL_RED_DURATION}s) ===`);
    }
  }

  simulateArrivals() {
    /**Simulates random vehicle arrivals at each approach.*/
    this.phases.forEach(phase => {
      // Simple random arrivals (0-2 vehicles per tick)
      if (Math.random() < 0.3) {
        phase.queueLength += Math.floor(Math.random() * 2) + 1;
        if (phase.queueLength > 50) phase.queueLength = 50; // Cap queue
      }
    });
  }

  tick() {
    /**Advances the simulation by one second.*/
    this.simulateArrivals();
    this.transitionPhases();
    
    // Update all phases
    this.phases.forEach(phase => phase.tick());
  }

  printStatistics() {
    /**Prints current statistics for all approaches.*/
    console.log("\n" + "=".repeat(50));
    console.log("TRAFFIC STATISTICS");
    console.log("=".repeat(50));
    
    let totalQueue = 0;
    let totalServed = 0;

    this.phases.forEach(phase => {
      totalQueue += phase.queueLength;
      totalServed += phase.servedVehicles;
      console.log(`${phase.name.padEnd(6)}: Queue=${String(phase.queueLength).padStart(2)} | Served=${String(phase.servedVehicles).padStart(4)} | AvgWait=${String(phase.getAverageWait()).padStart(6)}s`);
    });

    console.log("-".repeat(50));
    console.log(`Total Queue: ${totalQueue} | Total Served: ${totalServed}`);
    console.log("=".repeat(50) + "\n");
  }

  async runSimulation(totalDurationSeconds) {
    /**Runs the simulation for a specified total duration.*/
    console.log("Starting 4-Way Traffic Signal Simulation...\n");
    
    for (let t = 0; t < totalDurationSeconds; t++) {
      console.log(`\n[TIME: ${String(t).padStart(3, '0')}s]${this.isInAllRed ? ' [ALL-RED]' : ''}`);
      this.tick();
      
      // Print statistics every 30 seconds
      if ((t + 1) % 30 === 0) {
        this.printStatistics();
      }
      
      await sleep(1000);
    }
    
    console.log("\nSimulation Finished.");
    this.printStatistics();
  }
}

// --- Helper Functions ---
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Execution ---
async function main() {
  try {
    const controller = new TrafficController();
    await controller.runSimulation(180); // 3 minutes
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log("\nSimulation interrupted by user.");
    } else {
      console.log(`\nAn error occurred: ${error.message}`);
    }
  }
}

// Run the simulation
main();

// Handle Ctrl+C gracefully in Node.js
if (typeof process !== 'undefined') {
  process.on('SIGINT', () => {
    console.log("\nSimulation interrupted by user.");
    process.exit(0);
  });
}