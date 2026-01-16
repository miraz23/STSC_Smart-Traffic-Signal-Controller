const fs = require('fs');
const path = require('path');

const NUM_APPROACH = 4; // North, South, East, West
const DEFAULT_TICK_MS = 500;
const JSON_PATH = path.join(__dirname, '../data/traffic_data.json');
const GANTT_LEN = 2000;

// Direction names for better readability
const Direction = {
    NORTH: 0,
    SOUTH: 1,
    EAST: 2,
    WEST: 3
};

const DirectionNames = ['NORTH', 'SOUTH', 'EAST', 'WEST'];

// Scheduler types
const SchedulerType = {
    S_RR: 0,
    S_STATIC: 1,
    S_DYNAMIC: 2,
    S_HYBRID: 3
};

const SchedulerNames = ['Round-Robin', 'Static-Priority', 'Dynamic-Priority', 'Hybrid'];

// Car structure for tracking individual vehicle metrics
class Car {
    constructor(id, direction, arrivalTick) {
        this.id = id;
        this.direction = direction;
        this.arrival_tick = arrivalTick;      // When car arrived
        this.burst_time = 1;                  // Service time (fixed at 1 tick for simplicity)
        this.start_tick = -1;                 // When service started
        this.completion_tick = -1;            // When service completed
        this.waiting_time = 0;                // Waiting time before service
        this.turnaround_time = 0;             // Total time (arrival to completion)
        this.completed = false;
    }
}

// Approach structure
class Approach {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.queue_len = 0;
        this.arrival_rate = 0;
        this.static_prio = 0;
        this.dynamic_prio = 0;
        this.served = 0;
        this.total_wait = 0;
        this.age_ticks = 0;
        this.starvation_count = 0;
        this.cars_queue = [];                 // Queue of Car objects
        this.completed_cars = [];             // History of completed cars
        this.car_counter = 0;                 // Unique car ID generator
    }
}

// Global state
const approaches = [];
let sim_tick = 0;
let scheduler = SchedulerType.S_DYNAMIC;
let time_quantum_ticks = 4;
let current_green = -1;
let green_remaining = 0;
let rr_index = 0;
const gantt = new Array(GANTT_LEN).fill(-1);
let gantt_pos = 0;
let tick_ms = DEFAULT_TICK_MS;

// Yellow light transition delay (ticks)
const YELLOW_DELAY_TICKS = 2;
let yellow_remaining = 0;
let is_yellow = false;

// Sleep function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Poisson arrivals per tick
function poissonTick(ratePerSec) {
    const mean = ratePerSec * (tick_ms / 1000.0);
    if (mean <= 0.0) return 0;

    const L = Math.exp(-mean);
    let p = 1.0;
    let k = 0;

    do {
        p *= Math.random();
        k++;
    } while (p > L && k < 50);

    return k - 1;
}

// Round Robin scheduler
function pickRR() {
    for (let i = 0; i < NUM_APPROACH; i++) {
        const idx = (rr_index + i) % NUM_APPROACH;
        if (approaches[idx].queue_len > 0) {
            rr_index = (idx + 1) % NUM_APPROACH;
            return idx;
        }
    }
    rr_index = (rr_index + 1) % NUM_APPROACH;
    return rr_index;
}

// Static priority scheduler
function pickStatic() {
    let best = -1;
    let best_p = -999;

    for (let i = 0; i < NUM_APPROACH; i++) {
        if (approaches[i].queue_len <= 0) continue;
        if (approaches[i].static_prio > best_p) {
            best_p = approaches[i].static_prio;
            best = i;
        }
    }

    return (best === -1) ? 0 : best;
}

// Dynamic priority scheduler with aging
function pickDynamic() {
    let best = -1;
    let best_val = -1e9;

    for (let i = 0; i < NUM_APPROACH; i++) {
        // Dynamic priority increases with age to prevent starvation
        approaches[i].dynamic_prio = approaches[i].static_prio + approaches[i].age_ticks * 0.2;
        if (approaches[i].queue_len <= 0) continue;
        if (approaches[i].dynamic_prio > best_val) {
            best_val = approaches[i].dynamic_prio;
            best = i;
        }
    }

    if (best === -1) best = 0;
    return best;
}

// Hybrid scheduler with starvation prevention
function pickHybrid() {
    // Boost priority for starved approaches
    for (let i = 0; i < NUM_APPROACH; i++) {
        if (approaches[i].age_ticks > 50 && approaches[i].queue_len > 0) {
            approaches[i].dynamic_prio += 3.0;
            approaches[i].starvation_count++;
        }
    }
    return pickDynamic();
}

// Serve one vehicle
function serveOne(id) {
    if (id < 0 || id >= NUM_APPROACH) return;
    if (approaches[id].queue_len <= 0) return;

    approaches[id].queue_len--;
    approaches[id].served++;
    approaches[id].total_wait += approaches[id].age_ticks;
    approaches[id].age_ticks = 0;
}

// Write JSON data
async function writeJSON() {
    const data = {
        tick: sim_tick,
        current_green: current_green,
        current_direction: current_green >= 0 ? DirectionNames[current_green] : 'NONE',
        is_yellow: is_yellow,
        scheduler: SchedulerNames[scheduler],
        gantt: gantt.slice(0, Math.min(gantt_pos, GANTT_LEN)),
        approaches: approaches.map(a => ({
            id: a.id,
            direction: a.name,
            queue_len: a.queue_len,
            arrival_rate: parseFloat(a.arrival_rate.toFixed(2)),
            static_prio: a.static_prio,
            dynamic_prio: parseFloat(a.dynamic_prio.toFixed(2)),
            served: a.served,
            age: a.age_ticks,
            starvation: a.starvation_count,
            avg_wait: a.served > 0 ? parseFloat((a.total_wait / a.served).toFixed(2)) : 0
        }))
    };

    try {
        const dir = path.dirname(JSON_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        // Silently fail
    }
}

// JSON writer loop
async function jsonWriterLoop() {
    while (true) {
        await sleep(200);
        await writeJSON();
    }
}

// Simulation loop
async function simulationLoop() {
    while (true) {
        await sleep(tick_ms);

        sim_tick++;

        // Generate arrivals and age queues for all approaches
        for (let i = 0; i < NUM_APPROACH; i++) {
            const arrivals = poissonTick(approaches[i].arrival_rate);
            approaches[i].queue_len += arrivals;
            
            // Cap queue length
            if (approaches[i].queue_len > 50) approaches[i].queue_len = 50;
            
            // Age waiting queues (except currently served)
            if (i !== current_green && approaches[i].queue_len > 0) {
                approaches[i].age_ticks++;
            }
        }

        // Handle yellow light transition
        if (is_yellow) {
            yellow_remaining--;
            if (yellow_remaining <= 0) {
                is_yellow = false;
            }
            gantt[gantt_pos++ % GANTT_LEN] = current_green;
            continue;
        }

        // Pick next green if needed
        if (current_green === -1 || green_remaining <= 0) {
            let next = 0;

            switch (scheduler) {
                case SchedulerType.S_RR:
                    next = pickRR();
                    break;
                case SchedulerType.S_STATIC:
                    next = pickStatic();
                    break;
                case SchedulerType.S_DYNAMIC:
                    next = pickDynamic();
                    break;
                case SchedulerType.S_HYBRID:
                    next = pickHybrid();
                    break;
            }

            // If switching directions, initiate yellow light
            if (next !== current_green && current_green >= 0) {
                is_yellow = true;
                yellow_remaining = YELLOW_DELAY_TICKS;
                continue;
            }

            current_green = next;
            green_remaining = time_quantum_ticks;
        }

        // Serve one vehicle from current green approach
        serveOne(current_green);
        green_remaining--;
        gantt[gantt_pos++ % GANTT_LEN] = current_green;
    }
}

// Compute and print metrics
function computeAndPrintMetrics() {
    let total_wait = 0.0;
    let total_served = 0;
    let total_queue = 0;

    console.log('\n========== Traffic Light Status ==========');
    console.log(`Tick: ${sim_tick}`);
    console.log(`Scheduler: ${SchedulerNames[scheduler]}`);
    console.log(`Current Light: ${current_green >= 0 ? DirectionNames[current_green] : 'NONE'} ${is_yellow ? '(YELLOW)' : '(GREEN)'}`);
    console.log('\n--- Approach Statistics ---');

    for (let i = 0; i < NUM_APPROACH; i++) {
        const a = approaches[i];
        total_wait += a.total_wait;
        total_served += a.served;
        total_queue += a.queue_len;

        const avg_wait = a.served > 0 ? (a.total_wait / a.served).toFixed(2) : '0.00';
        
        console.log(`${a.name.padEnd(6)}: Queue=${a.queue_len.toString().padStart(2)} | Served=${a.served.toString().padStart(4)} | AvgWait=${avg_wait.padStart(6)} | Priority=${a.dynamic_prio.toFixed(1).padStart(5)} | Starved=${a.starvation_count}`);
    }

    const avg_wait_total = total_served ? (total_wait / total_served).toFixed(2) : '0.00';

    console.log('\n--- Overall Statistics ---');
    console.log(`Total Queue Length: ${total_queue}`);
    console.log(`Total Vehicles Served: ${total_served}`);
    console.log(`Average Wait Time: ${avg_wait_total} ticks`);
    console.log('==========================================\n');
}

// Metrics loop
async function metricsLoop() {
    while (true) {
        await sleep(2000);
        computeAndPrintMetrics();
    }
}

// Main function
async function main() {
    console.log('4-Way Traffic Light Control System');
    console.log('==================================\n');

    // Parse command line arguments
    const args = process.argv.slice(2);

    if (args.length >= 1) {
        const schedArg = args[0].toLowerCase();
        if (schedArg === 'rr') scheduler = SchedulerType.S_RR;
        else if (schedArg === 'static') scheduler = SchedulerType.S_STATIC;
        else if (schedArg === 'dynamic') scheduler = SchedulerType.S_DYNAMIC;
        else if (schedArg === 'hybrid') scheduler = SchedulerType.S_HYBRID;
        else {
            console.log('Usage: node traffic_sim.js [scheduler] [tick_ms] [quantum_ticks]');
            console.log('  scheduler: rr | static | dynamic | hybrid (default: dynamic)');
            console.log('  tick_ms: milliseconds per tick (default: 500)');
            console.log('  quantum_ticks: time quantum in ticks (default: 4)\n');
        }
    }

    if (args.length >= 2) {
        const t = parseInt(args[1]);
        if (t > 50) tick_ms = t;
    }

    if (args.length >= 3) {
        const q = parseInt(args[2]);
        if (q > 0) time_quantum_ticks = q;
    }

    console.log(`Configuration:`);
    console.log(`  Scheduler: ${SchedulerNames[scheduler]}`);
    console.log(`  Tick Duration: ${tick_ms}ms`);
    console.log(`  Time Quantum: ${time_quantum_ticks} ticks`);
    console.log(`  Yellow Light Delay: ${YELLOW_DELAY_TICKS} ticks\n`);

    // Initialize 4 approaches: North, South, East, West
    for (let i = 0; i < NUM_APPROACH; i++) {
        const app = new Approach(i, DirectionNames[i]);
        
        // Initial queue lengths (varied for realistic simulation)
        app.queue_len = 2 + i;
        
        // Arrival rates (vehicles per second) - varied by direction
        // Typically, main roads (N-S) have higher traffic than cross streets (E-W)
        switch(i) {
            case Direction.NORTH:
                app.arrival_rate = 0.6; // Higher traffic
                app.static_prio = 4;
                break;
            case Direction.SOUTH:
                app.arrival_rate = 0.55; // Higher traffic
                app.static_prio = 3;
                break;
            case Direction.EAST:
                app.arrival_rate = 0.4; // Medium traffic
                app.static_prio = 2;
                break;
            case Direction.WEST:
                app.arrival_rate = 0.35; // Lower traffic
                app.static_prio = 1;
                break;
        }
        
        app.dynamic_prio = app.static_prio;
        approaches.push(app);
    }

    console.log('Starting simulation...\n');

    // Start all loops
    jsonWriterLoop();
    simulationLoop();
    metricsLoop();
}

// Run the simulation
main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});