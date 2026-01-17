const NUM_DIRECTIONS = 4;
const DIRECTIONS = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
const DIR_SHORT = ['N', 'S', 'E', 'W'];
const DEFAULT_QUANTUM = 4;
const YELLOW_DURATION = 2;
const ALL_RED_DURATION = 1;

const queues = [0, 0, 0, 0];
const arrivalRates = [0.6, 0.55, 0.4, 0.35];
const served = [0, 0, 0, 0];
const totalWait = [0, 0, 0, 0];
const totalTAT = [0, 0, 0, 0];
const ageTicks = [0, 0, 0, 0];
const staticPrio = [4, 3, 2, 1];
const dynamicPrio = [4, 3, 2, 1];

let carIdCounter = 0;
const recentCars = [];
const ganttData = [[], [], [], []];

const carQueues = [[], [], [], []];
const activeCars = [];

let running = false;
let simSpeed = 1;
let timeQuantum = DEFAULT_QUANTUM;
let currentGreen = -1;
let greenRemaining = 0;
let yellowRemaining = 0;
let allRedRemaining = 0;
let isYellow = false;
let isAllRed = false;
let rrIndex = 0;
let simTick = 0;
let tickInterval = null;

const startStopBtn = document.getElementById('start-stop');
const statusPill = document.getElementById('status-pill');
const speedRange = document.getElementById('speed-range');
const speedDisplay = document.getElementById('speed-display');
const quantumRange = document.getElementById('quantum-range');
const quantumDisplay = document.getElementById('quantum-display');
const exportLogBtn = document.getElementById('export-log');
const clearEventLogBtn = document.getElementById('clear-event-log');
const logEl = document.getElementById('log');

let eventLog = [];

const lightEls = {
    red: ['n-red', 's-red', 'e-red', 'w-red'].map(id => document.getElementById(id)),
    yellow: ['n-yellow', 's-yellow', 'e-yellow', 'w-yellow'].map(id => document.getElementById(id)),
    green: ['n-green', 's-green', 'e-green', 'w-green'].map(id => document.getElementById(id))
};

const laneInEls = DIRECTIONS.map((d, i) => {
    if (i === 0) {
        return document.getElementById(`lane-${DIR_SHORT[i]}-out`);
    } else if (i === 2) {
        return document.getElementById(`lane-${DIR_SHORT[i]}-out`);
    } else if (i === 3) {
        return document.getElementById(`lane-${DIR_SHORT[i]}-in`);
    } else {
        return document.getElementById(`lane-${DIR_SHORT[i]}-in`);
    }
});
const laneOutEls = DIRECTIONS.map((d, i) =>
    document.getElementById(`lane-${DIR_SHORT[i]}-out`)
);

function logEvent(message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logItem = document.createElement('div');
    logItem.className = `log-item ${level}`;
    logItem.textContent = `[${timestamp}] Tick ${simTick}: ${message}`;

    logEl.insertBefore(logItem, logEl.firstChild);

    eventLog.unshift({ timestamp, tick: simTick, message, level });

    if (logEl.children.length > 100) {
        logEl.removeChild(logEl.lastChild);
    }
}

function spawnCar(dir) {
    const laneEl = laneInEls[dir];
    if (!laneEl) return;

    const car = document.createElement('div');
    car.className = 'car';
    car.dataset.direction = dir;
    car.dataset.arrivalTick = simTick;
    
    const carImg = document.createElement('img');
    carImg.src = 'car.png';
    carImg.style.width = '25px';
    carImg.style.height = '25px';
    carImg.style.display = 'block';
    car.appendChild(carImg);

    laneEl.appendChild(car);
    
    carQueues[dir].push(car);
    
    positionCarAtStopLine(car, dir);
}

function positionCarAtStopLine(car, dir) {
    const isVertical = dir === 0 || dir === 1;
    const stopLineOffset = 80;
    const carSize = 25;
    const laneSize = 35;
    const carOffset = (laneSize - carSize) / 2;
    
    if (isVertical) {
        if (dir === 0) {
            car.style.top = `${stopLineOffset}px`;
            car.style.left = `${carOffset}px`;
            car.style.transform = 'rotate(180deg)';
        } else {
            car.style.top = `${stopLineOffset}px`;
            car.style.left = `${carOffset}px`;
            car.style.transform = 'rotate(0deg)';
        }
    } else {
        if (dir === 2) {
            car.style.left = `${stopLineOffset}px`;
            car.style.top = `${carOffset}px`;
            car.style.transform = 'rotate(-90deg)';
        } else {
            car.style.left = `${200 - stopLineOffset}px`;
            car.style.top = `${carOffset}px`;
            car.style.transform = 'rotate(90deg)';
        }
    }
}

function updateCarQueuePositions(dir) {
    const queue = carQueues[dir];
    const isVertical = dir === 0 || dir === 1;
    const stopLineOffset = 80;
    const carSpacing = 30;
    const carSize = 25;
    const laneSize = 35;
    const carOffset = (laneSize - carSize) / 2;
    
    queue.forEach((car, index) => {
        if (isVertical) {
            if (dir === 0) {
                const targetY = stopLineOffset + (index * carSpacing);
                car.style.top = `${Math.min(targetY, 100)}px`;
            } else {
                const targetY = stopLineOffset + (index * carSpacing);
                car.style.top = `${Math.min(targetY, 100)}px`;
            }
            car.style.left = `${carOffset}px`;
        } else {
            if (dir === 2) {
                const targetX = stopLineOffset + (index * carSpacing);
                car.style.left = `${Math.min(targetX, 100)}px`;
                car.style.top = `${carOffset}px`;
            } else {
                const targetX = 200 - stopLineOffset - (index * carSpacing);
                car.style.left = `${Math.max(targetX, 100)}px`;
                car.style.top = `${carOffset}px`;
            }
        }
    });
}

function moveCarThroughIntersection(dir) {
    const queue = carQueues[dir];
    if (queue.length === 0) return null;
    
    const car = queue.shift();
    activeCars.push({ element: car, direction: dir, startTime: performance.now() });
    
    const isVertical = dir === 0 || dir === 1;
    const duration = 1500 / simSpeed;
    const startTime = performance.now();
    
    const currentTop = parseFloat(car.style.top) || 0;
    const currentLeft = parseFloat(car.style.left) || 0;
    
    let startPos, endPos;
    const intersectionCenter = 100;
    const roadLength = 200;
    
    if (isVertical) {
        if (dir === 0) {
            startPos = { top: currentTop, left: currentLeft };
            endPos = { top: roadLength + 25, left: currentLeft };
            car.style.transform = 'rotate(180deg)';
        } else {
            startPos = { top: currentTop, left: currentLeft };
            endPos = { top: -25, left: currentLeft };
            car.style.transform = 'rotate(0deg)';
        }
    } else {
        if (dir === 2) {
            startPos = { top: currentTop, left: currentLeft };
            endPos = { top: currentTop, left: -25 };
        } else {
            startPos = { top: currentTop, left: currentLeft };
            endPos = { top: currentTop, left: roadLength + 25 };
        }
    }
    
    function animate(now) {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        
        if (isVertical) {
            const y = startPos.top + (endPos.top - startPos.top) * t;
            car.style.top = `${y}px`;
        } else {
            const x = startPos.left + (endPos.left - startPos.left) * t;
            car.style.left = `${x}px`;
        }
        
        if (t >= 1) {
            if (car.parentElement) {
                car.parentElement.removeChild(car);
            }
            const index = activeCars.findIndex(ac => ac.element === car);
            if (index >= 0) activeCars.splice(index, 1);
            return;
        }
        
        requestAnimationFrame(animate);
    }
    
    requestAnimationFrame(animate);
    
    updateCarQueuePositions(dir);
    
    return car;
}

function poissonArrival(rate) {
    return Math.random() < rate * 0.5 ? 1 : 0;
}

function pickNextRR() {
    for (let i = 0; i < NUM_DIRECTIONS; i++) {
        const idx = (rrIndex + i) % NUM_DIRECTIONS;
        if (carQueues[idx].length > 0) {
            rrIndex = (idx + 1) % NUM_DIRECTIONS;
            return idx;
        }
    }
    return -1;
}

function serveVehicle(dir) {
    if (carQueues[dir].length > 0 && currentGreen === dir && !isYellow && !isAllRed) {
        const car = carQueues[dir][0];
        const arrivalTick = parseInt(car.dataset.arrivalTick) || simTick;
        const waitTime = simTick - arrivalTick;
        const startTime = simTick;
        
        moveCarThroughIntersection(dir);
        
        queues[dir] = carQueues[dir].length;
        served[dir]++;
        totalWait[dir] += waitTime;
        const tat = waitTime + 1;
        totalTAT[dir] += tat;
        
        if (carQueues[dir].length === 0) {
            ageTicks[dir] = 0;
        }

        const carId = `${DIR_SHORT[dir]}${carIdCounter++}`;
        const completionTime = arrivalTick + tat;
        const responseTime = startTime - arrivalTick;
        recentCars.unshift({
            id: carId,
            dir: DIR_SHORT[dir],
            arrival: arrivalTick,
            start: startTime,
            wait: waitTime,
            tat: tat,
            completion: completionTime,
            response: responseTime
        });
        if (recentCars.length > 5) recentCars.pop();

        return carId;
    }
    return null;
}

function resetLights() {
    for (let i = 0; i < NUM_DIRECTIONS; i++) {
        lightEls.red[i].className = 'traffic-light light-off rounded-full';
        lightEls.yellow[i].className = 'traffic-light light-off rounded-full';
        lightEls.green[i].className = 'traffic-light light-off rounded-full';
    }
}

function updateGantt() {
    for (let i = 0; i < NUM_DIRECTIONS; i++) {
        const timeline = document.getElementById(`gantt-${DIR_SHORT[i]}`);
        timeline.innerHTML = '';

        ganttData[i].slice(-50).forEach(block => {
            const div = document.createElement('div');
            div.className = `gantt-block gantt-${block.state.toLowerCase()}`;
            if (block.car) {
                div.title = `Tick ${block.tick}: ${block.car}`;
            }
            timeline.appendChild(div);
        });
    }
}

function updateMetrics() {
    const prefixes = ['n', 's', 'e', 'w'];
    for (let i = 0; i < NUM_DIRECTIONS; i++) {
        const actualQueueCount = carQueues[i].length;
        document.getElementById(`m-${prefixes[i]}-queue`).textContent = actualQueueCount;
        document.getElementById(`m-${prefixes[i]}-served`).textContent = served[i];
        const avgWait = served[i] > 0 ? (totalWait[i] / served[i]).toFixed(1) : '0.0';
        const avgTAT = served[i] > 0 ? (totalTAT[i] / served[i]).toFixed(1) : '0.0';
        document.getElementById(`m-${prefixes[i]}-wait`).textContent = avgWait;
        document.getElementById(`m-${prefixes[i]}-tat`).textContent = avgTAT;
        document.getElementById(`m-${prefixes[i]}-prio`).textContent = dynamicPrio[i].toFixed(1);
    }

    const carsTbody = document.getElementById('cars-tbody');
    if (recentCars.length === 0) {
        carsTbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No cars yet</td></tr>';
    } else {
        carsTbody.innerHTML = recentCars.map(car => `
            <tr>
                <td class="font-semibold">${car.id}</td>
                <td>${car.dir}</td>
                <td>${car.arrival}</td>
                <td>${car.start}</td>
                <td>${car.wait}</td>
                <td>${car.tat}</td>
                <td>${car.completion}</td>
                <td>${car.response}</td>
            </tr>
        `).join('');
    }
}

function updateUI() {
    resetLights();

    if (isAllRed) {
        for (let i = 0; i < NUM_DIRECTIONS; i++) {
            lightEls.red[i].classList.add('red-on');
        }
    } else if (isYellow && currentGreen >= 0) {
        lightEls.yellow[currentGreen].classList.add('yellow-on');
        for (let i = 0; i < NUM_DIRECTIONS; i++) {
            if (i !== currentGreen) lightEls.red[i].classList.add('red-on');
        }
    } else if (currentGreen >= 0) {
        lightEls.green[currentGreen].classList.add('green-on', 'active-pulse');
        for (let i = 0; i < NUM_DIRECTIONS; i++) {
            if (i !== currentGreen) lightEls.red[i].classList.add('red-on');
        }
    } else {
        for (let i = 0; i < NUM_DIRECTIONS; i++) {
            lightEls.red[i].classList.add('red-on');
        }
    }

    const phase = isAllRed ? 'ALL-RED' : isYellow ? 'YELLOW' : currentGreen >= 0 ? `${DIRECTIONS[currentGreen]} GREEN` : 'INIT';
    statusPill.textContent = running ? phase : 'Stopped';
    statusPill.classList.toggle('status-running', running);

    const totalServed = served.reduce((a, b) => a + b, 0);
    const totalWaitTime = totalWait.reduce((a, b) => a + b, 0);

    document.getElementById('current-dir').textContent = currentGreen >= 0 ? DIRECTIONS[currentGreen] : 'NONE';
    document.getElementById('total-served').textContent = totalServed;
    document.getElementById('avg-wait').textContent = totalServed > 0 ? (totalWaitTime / totalServed).toFixed(1) : '0.0';
    document.getElementById('sim-tick').textContent = simTick;

    updateMetrics();
    updateGantt();
}

function simTickFn() {
    if (!running) return;

    simTick++;

    for (let i = 0; i < NUM_DIRECTIONS; i++) {
        const arrivals = poissonArrival(arrivalRates[i]);
        if (arrivals > 0 && carQueues[i].length < 50) {
            for (let j = 0; j < arrivals; j++) {
                if (carQueues[i].length < 50) {
                    spawnCar(i);
                }
            }
            queues[i] = carQueues[i].length;
        }

        updateCarQueuePositions(i);

        if (i !== currentGreen && carQueues[i].length > 0) {
            ageTicks[i]++;
        }

        dynamicPrio[i] = staticPrio[i] + ageTicks[i] * 0.1;
    }

    if (isAllRed) {
        allRedRemaining--;
        if (allRedRemaining <= 0) {
            isAllRed = false;
            const next = pickNextRR();
            if (next >= 0) {
                currentGreen = next;
                greenRemaining = timeQuantum;
                logEvent(`${DIRECTIONS[next]} light turned GREEN (Round Robin)`, 'success');
            } else {
                currentGreen = -1;
                logEvent('All queues empty, waiting for arrivals', 'info');
            }
        }

        for (let i = 0; i < NUM_DIRECTIONS; i++) {
            ganttData[i].push({ tick: simTick, state: 'RED', car: null });
        }

        updateUI();
        return;
    }

    if (isYellow) {
        yellowRemaining--;
        if (yellowRemaining <= 0) {
            isYellow = false;
            isAllRed = true;
            allRedRemaining = ALL_RED_DURATION;
            logEvent(`Entering ALL-RED clearance phase`, 'warning');
        }

        for (let i = 0; i < NUM_DIRECTIONS; i++) {
            if (i === currentGreen) {
                ganttData[i].push({ tick: simTick, state: 'YELLOW', car: null });
            } else {
                ganttData[i].push({ tick: simTick, state: 'RED', car: null });
            }
        }

        updateUI();
        return;
    }

    if (currentGreen === -1 || greenRemaining <= 0) {
        if (currentGreen >= 0) {
            isYellow = true;
            yellowRemaining = YELLOW_DURATION;
            logEvent(`${DIRECTIONS[currentGreen]} light turned YELLOW`, 'warning');
        } else {
            const next = pickNextRR();
            if (next >= 0) {
                currentGreen = next;
                greenRemaining = timeQuantum;
                logEvent(`${DIRECTIONS[next]} light turned GREEN (Round Robin)`, 'success');
            } else {
                isAllRed = true;
                allRedRemaining = ALL_RED_DURATION;
                logEvent('All queues empty, entering ALL-RED state', 'info');
            }
        }
    } else {
        const carId = serveVehicle(currentGreen);
        if (carId) {
            logEvent(`Car ${carId} crossed intersection at ${DIRECTIONS[currentGreen]}`, 'success');
        }
        greenRemaining--;

        for (let i = 0; i < NUM_DIRECTIONS; i++) {
            if (i === currentGreen) {
                ganttData[i].push({ tick: simTick, state: 'GREEN', car: carId });
            } else {
                ganttData[i].push({ tick: simTick, state: 'RED', car: null });
            }
        }
    }

    updateUI();
}

startStopBtn.addEventListener('click', () => {
    running = !running;
    if (running) {
        startStopBtn.textContent = 'Stop';
        logEvent('Simulation started', 'success');
        tickInterval = setInterval(simTickFn, 1000 / simSpeed);
    } else {
        startStopBtn.textContent = 'Start';
        logEvent('Simulation stopped', 'warning');
        if (tickInterval) clearInterval(tickInterval);
    }
    updateUI();
});

speedRange.addEventListener('input', (e) => {
    simSpeed = parseFloat(e.target.value);
    speedDisplay.textContent = simSpeed + 'x';
    if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = setInterval(simTickFn, 1000 / simSpeed);
    }
});

quantumRange.addEventListener('input', (e) => {
    timeQuantum = parseInt(e.target.value);
    quantumDisplay.textContent = timeQuantum + ' ticks';
});

exportLogBtn.addEventListener('click', () => {
    const csv = ['Timestamp,Tick,Message,Level'];
    eventLog.forEach(log => {
        csv.push(`"${log.timestamp}",${log.tick},"${log.message}",${log.level}`);
    });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traffic-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logEvent('Event log exported to CSV', 'success');
});

clearEventLogBtn.addEventListener('click', () => {
    logEl.innerHTML = '';
    eventLog = [];
    logEvent('Event log cleared', 'info');
});

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        startStopBtn.click();
        e.preventDefault();
    }
});

updateUI();
