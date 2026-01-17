const fs = require('fs');
const path = require('path');

const NUM_APPROACH = 4;
const DEFAULT_TICK_MS = 800;
const JSON_PATH = path.join(__dirname, './traffic_data.json');
const GANTT_LEN = 100;

const Direction = {
    NORTH: 0,
    SOUTH: 1,
    EAST: 2,
    WEST: 3
};

const DirectionNames = ['NORTH', 'SOUTH', 'EAST', 'WEST'];

const SchedulerType = {
    S_RR: 0,
    S_STATIC: 1,
    S_DYNAMIC: 2,
    S_HYBRID: 3
};

const SchedulerNames = ['Round-Robin', 'Static-Priority', 'Dynamic-Priority', 'Hybrid'];

// Enhanced Car class with all timing metrics
class Car {
    constructor(id, direction, arrivalTick) {
        this.id = id;
        this.direction = direction;
        this.arrival_tick = arrivalTick;
        this.burst_time = 1;
        this.start_tick = -1;
        this.completion_tick = -1;
        this.waiting_time = 0;
        this.turnaround_time = 0;
        this.response_time = 0;
        this.completed = false;
        this.lane = Math.random() < 0.5 ? 'lane1' : 'lane2'; // Two-way lanes
    }

    computeMetrics() {
        if (this.completed && this.start_tick >= 0) {
            this.waiting_time = this.start_tick - this.arrival_tick;
            this.turnaround_time = this.completion_tick - this.arrival_tick;
            this.response_time = this.start_tick - this.arrival_tick;
        }
    }
}

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
        this.cars_queue = [];
        this.completed_cars = [];
        this.car_counter = 0;

        // Two-way road lanes
        this.lane1_queue = [];
        this.lane2_queue = [];
    }

    addCar(tick) {
        const car = new Car(
            `${this.name.charAt(0)}${this.car_counter++}`,
            this.id,
            tick
        );

        this.cars_queue.push(car);

        // Add to lane queues for visualization
        if (car.lane === 'lane1') {
            this.lane1_queue.push(car);
        } else {
            this.lane2_queue.push(car);
        }

        return car;
    }

    serveCar(tick) {
        if (this.cars_queue.length === 0) return null;

        const car = this.cars_queue.shift();
        car.start_tick = tick;
        car.completion_tick = tick + car.burst_time;
        car.completed = true;
        car.computeMetrics();

        this.completed_cars.push(car);
        this.served++;
        this.total_wait += car.waiting_time;

        // Remove from lane queue
        if (car.lane === 'lane1') {
            this.lane1_queue = this.lane1_queue.filter(c => c.id !== car.id);
        } else {
            this.lane2_queue = this.lane2_queue.filter(c => c.id !== car.id);
        }

        return car;
    }

    getAverageMetrics() {
        if (this.completed_cars.length === 0) {
            return {
                avg_waiting: 0,
                avg_turnaround: 0,
                avg_response: 0,
                total_burst: 0
            };
        }

        const total_waiting = this.completed_cars.reduce((sum, c) => sum + c.waiting_time, 0);
        const total_turnaround = this.completed_cars.reduce((sum, c) => sum + c.turnaround_time, 0);
        const total_response = this.completed_cars.reduce((sum, c) => sum + c.response_time, 0);
        const total_burst = this.completed_cars.reduce((sum, c) => sum + c.burst_time, 0);

        return {
            avg_waiting: (total_waiting / this.completed_cars.length).toFixed(2),
            avg_turnaround: (total_turnaround / this.completed_cars.length).toFixed(2),
            avg_response: (total_response / this.completed_cars.length).toFixed(2),
            total_burst
        };
    }
}

const approaches = [];
let sim_tick = 0;
let scheduler = SchedulerType.S_DYNAMIC;
let time_quantum_ticks = 4;
let current_green = -1;
let green_remaining = 0;
let rr_index = 0;
const gantt = [];
let tick_ms = DEFAULT_TICK_MS;
const YELLOW_DELAY_TICKS = 2;
let yellow_remaining = 0;
let is_yellow = false;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

function pickRR() {
    for (let i = 0; i < NUM_APPROACH; i++) {
        const idx = (rr_index + i) % NUM_APPROACH;
        if (approaches[idx].cars_queue.length > 0) {
            rr_index = (idx + 1) % NUM_APPROACH;
            return idx;
        }
    }
    rr_index = (rr_index + 1) % NUM_APPROACH;
    return rr_index;
}

function pickStatic() {
    let best = -1;
    let best_p = -999;

    for (let i = 0; i < NUM_APPROACH; i++) {
        if (approaches[i].cars_queue.length <= 0) continue;
        if (approaches[i].static_prio > best_p) {
            best_p = approaches[i].static_prio;
            best = i;
        }
    }

    return (best === -1) ? 0 : best;
}

function pickDynamic() {
    let best = -1;
    let best_val = -1e9;

    for (let i = 0; i < NUM_APPROACH; i++) {
        approaches[i].dynamic_prio = approaches[i].static_prio + approaches[i].age_ticks * 0.2;
        if (approaches[i].cars_queue.length <= 0) continue;
        if (approaches[i].dynamic_prio > best_val) {
            best_val = approaches[i].dynamic_prio;
            best = i;
        }
    }

    if (best === -1) best = 0;
    return best;
}

function pickHybrid() {
    for (let i = 0; i < NUM_APPROACH; i++) {
        if (approaches[i].age_ticks > 50 && approaches[i].cars_queue.length > 0) {
            approaches[i].dynamic_prio += 3.0;
            approaches[i].starvation_count++;
        }
    }
    return pickDynamic();
}

async function writeJSON() {
    const data = {
        tick: sim_tick,
        current_green: current_green,
        current_direction: current_green >= 0 ? DirectionNames[current_green] : 'NONE',
        is_yellow: is_yellow,
        scheduler: SchedulerNames[scheduler],
        gantt: gantt.slice(-GANTT_LEN),
        approaches: approaches.map(a => {
            const metrics = a.getAverageMetrics();
            return {
                id: a.id,
                direction: a.name,
                queue_len: a.cars_queue.length,
                lane1_cars: a.lane1_queue.map(c => ({
                    id: c.id,
                    arrival: c.arrival_tick,
                    waiting: sim_tick - c.arrival_tick
                })),
                lane2_cars: a.lane2_queue.map(c => ({
                    id: c.id,
                    arrival: c.arrival_tick,
                    waiting: sim_tick - c.arrival_tick
                })),
                arrival_rate: parseFloat(a.arrival_rate.toFixed(2)),
                static_prio: a.static_prio,
                dynamic_prio: parseFloat(a.dynamic_prio.toFixed(2)),
                served: a.served,
                age: a.age_ticks,
                starvation: a.starvation_count,
                avg_waiting: parseFloat(metrics.avg_waiting),
                avg_turnaround: parseFloat(metrics.avg_turnaround),
                avg_response: parseFloat(metrics.avg_response),
                total_burst: metrics.total_burst,
                completed_cars: a.completed_cars.slice(-20).map(c => ({
                    id: c.id,
                    arrival: c.arrival_tick,
                    start: c.start_tick,
                    completion: c.completion_tick,
                    burst: c.burst_time,
                    waiting: c.waiting_time,
                    turnaround: c.turnaround_time,
                    response: c.response_time
                }))
            };
        })
    };

    try {
        fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        // Silently fail
    }
}

async function jsonWriterLoop() {
    while (true) {
        await sleep(200);
        await writeJSON();
    }
}

async function simulationLoop() {
    while (true) {
        await sleep(tick_ms);
        sim_tick++;

        // Generate arrivals
        for (let i = 0; i < NUM_APPROACH; i++) {
            const arrivals = poissonTick(approaches[i].arrival_rate);
            for (let j = 0; j < arrivals; j++) {
                if (approaches[i].cars_queue.length < 50) {
                    approaches[i].addCar(sim_tick);
                }
            }

            // Age waiting cars
            if (i !== current_green && approaches[i].cars_queue.length > 0) {
                approaches[i].age_ticks++;
            }

        }

        // Handle yellow light
        if (is_yellow) {
            yellow_remaining--;
            if (yellow_remaining <= 0) {
                is_yellow = false;
            }
            gantt.push({
                tick: sim_tick,
                direction: current_green,
                state: 'YELLOW',
                car: null
            });
            continue;
        }

        // Pick next green
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

            if (next !== current_green && current_green >= 0) {
                is_yellow = true;
                yellow_remaining = YELLOW_DELAY_TICKS;
                continue;
            }

            current_green = next;
            green_remaining = time_quantum_ticks;
        }

        // Serve one car
        const servedCar = approaches[current_green].serveCar(sim_tick);
        approaches[current_green].age_ticks = 0;

        green_remaining--;
        gantt.push({
            tick: sim_tick,
            direction: current_green,
            state: 'GREEN',
            car: servedCar ? servedCar.id : null
        });
    }
}

function computeAndPrintMetrics() {
    console.log('\n========== Traffic Light Status ==========');
    console.log(`Tick: ${sim_tick}`);
    console.log(`Scheduler: ${SchedulerNames[scheduler]}`);
    console.log(`Current Light: ${current_green >= 0 ? DirectionNames[current_green] : 'NONE'} ${is_yellow ? '(YELLOW)' : '(GREEN)'}`);
    console.log('\n--- Approach Statistics ---');

    for (let i = 0; i < NUM_APPROACH; i++) {
        const a = approaches[i];
        const metrics = a.getAverageMetrics();

        console.log(`\n${a.name}:`);
        console.log(`  Queue: ${a.cars_queue.length} (Lane1: ${a.lane1_queue.length}, Lane2: ${a.lane2_queue.length})`);
        console.log(`  Served: ${a.served} | Priority: ${a.dynamic_prio.toFixed(1)}`);
        console.log(`  Avg Waiting: ${metrics.avg_waiting} | Avg Turnaround: ${metrics.avg_turnaround}`);
        console.log(`  Avg Response: ${metrics.avg_response} | Total Burst: ${metrics.total_burst}`);
    }

    console.log('\n==========================================\n');
}

async function metricsLoop() {
    while (true) {
        await sleep(3000);
        computeAndPrintMetrics();
    }
}

async function main() {
    console.log('4-Way Traffic Light Control System with Two-Way Roads');
    console.log('====================================================\n');

    const args = process.argv.slice(2);

    if (args.length >= 1) {
        const schedArg = args[0].toLowerCase();
        if (schedArg === 'rr') scheduler = SchedulerType.S_RR;
        else if (schedArg === 'static') scheduler = SchedulerType.S_STATIC;
        else if (schedArg === 'dynamic') scheduler = SchedulerType.S_DYNAMIC;
        else if (schedArg === 'hybrid') scheduler = SchedulerType.S_HYBRID;
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

    for (let i = 0; i < NUM_APPROACH; i++) {
        const app = new Approach(i, DirectionNames[i]);

        switch (i) {
            case Direction.NORTH:
                app.arrival_rate = 0.6;
                app.static_prio = 4;
                break;
            case Direction.SOUTH:
                app.arrival_rate = 0.55;
                app.static_prio = 3;
                break;
            case Direction.EAST:
                app.arrival_rate = 0.4;
                app.static_prio = 2;
                break;
            case Direction.WEST:
                app.arrival_rate = 0.35;
                app.static_prio = 1;
                break;
        }

        app.dynamic_prio = app.static_prio;
        approaches.push(app);
    }

    console.log('Starting simulation...\n');

    jsonWriterLoop();
    simulationLoop();
    metricsLoop();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});