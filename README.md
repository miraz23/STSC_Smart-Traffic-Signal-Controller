# Smart Traffic Signal Controller (STSC)

A JavaScript-based traffic simulation system that uses Operating System scheduling algorithms to manage traffic at 4-way intersections. Each road direction is treated as a process, and scheduling algorithms determine which traffic signal turns green next.

## 🚦 Features

- **4-Way Double Lane Traffic Simulation**: Realistic visualization of traffic flow at intersections
- **OS Scheduling Algorithms**: 
  - Round Robin scheduling with configurable time quantum
  - Priority-based scheduling with dynamic priority adjustment
  - Hybrid approach combining both methods
- **Real-time Metrics**:
  - Queue length per direction
  - Average wait time and turnaround time
  - Total vehicles served
  - Priority values for each direction
- **Interactive Controls**:
  - Start/Stop simulation
  - Adjustable simulation speed (0.5x - 2x)
  - Configurable time quantum (2-10 ticks)
- **Visualization**:
  - Live traffic light status
  - Gantt chart showing last 50 ticks of signal states
  - Real-time car movement animation
  - Event log with export to CSV functionality

## 🛠️ Technologies Used

- **HTML5** - Structure and layout
- **CSS3** - Styling and animations
- **JavaScript (Vanilla)** - Core simulation logic
- **Tailwind CSS** - Utility-first CSS framework
- **Chart.js** - Data visualization (ready for future enhancements)

## 🚀 Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Edge, Safari)
- No additional dependencies required (uses CDN for external libraries)

### Running the Project

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd STSC_Smart-Traffic-Signal-Controller
   ```

2. Open `index.html` in your web browser:
   - Simply double-click the file, or
   - Use a local web server (recommended):
     ```bash
     # Using Python
     python -m http.server 8000
     
     # Using Node.js (http-server)
     npx http-server
     
     # Using PHP
     php -S localhost:8000
     ```

3. Navigate to `https://stsc-system.vercel.app/` in your browser

## 📖 How It Works

### Simulation Model

- **Directions**: Four directions (North, South, East, West) with double lanes each
- **Cars**: Vehicles arrive randomly using Poisson distribution with different arrival rates per direction
- **Traffic Lights**: Each direction has Red, Yellow, and Green states
- **Scheduling**: The system uses Round Robin with priority adjustments based on queue age

### Scheduling Algorithm

1. **Round Robin**: Cycles through directions with vehicles waiting
2. **Dynamic Priority**: Priority increases based on how long a direction has been waiting
3. **Time Quantum**: Configurable duration for green light (default: 4 ticks)
4. **Yellow Phase**: 2-tick transition period before switching
5. **All-Red Phase**: 1-tick safety clearance period

### Metrics Calculated

- **Queue Length**: Number of vehicles waiting per direction
- **Average Wait Time**: Mean waiting time for vehicles in each direction
- **Average Turnaround Time (TAT)**: Total time from arrival to completion
- **Priority**: Dynamic priority value (base + age multiplier)

## 📁 Project Structure

```
STSC_Smart-Traffic-Signal-Controller/
├── index.html          # Main HTML structure
├── main.js            # Core simulation logic
├── style.css          # Custom styles and animations
├── car.png            # Car icon for visualization
├── logo_helmet.png    # Project logo/favicon
└── README.md          # This file
```

## 🎮 Usage

1. **Start Simulation**: Click the "Start" button or press Spacebar
2. **Adjust Speed**: Use the speed slider to change simulation speed
3. **Set Quantum**: Adjust the time quantum slider to change green light duration
4. **Monitor Metrics**: Watch real-time statistics in the metrics table
5. **View Gantt Chart**: See the scheduling timeline for each direction
6. **Export Logs**: Click "Export CSV" to save event logs

## 🔧 Configuration

Default settings can be modified in `main.js`:

- `arrivalRates`: Vehicle arrival probabilities per direction `[0.6, 0.55, 0.4, 0.35]`
- `staticPrio`: Base priority values `[4, 3, 2, 1]`
- `DEFAULT_QUANTUM`: Default time quantum `4`
- `YELLOW_DURATION`: Yellow light duration `2 ticks`
- `ALL_RED_DURATION`: All-red clearance time `1 tick`

## 📊 Key Metrics Explained

- **Queue**: Current number of vehicles waiting
- **Served**: Total vehicles that have crossed the intersection
- **Avg Wait**: Average time vehicles wait before crossing
- **Avg TAT**: Average total time from arrival to completion
- **Priority**: Current dynamic priority (higher = more urgent)

## 🎯 Future Enhancements

- [ ] Additional scheduling algorithms (FCFS, SJF, etc.)
- [ ] Multiple intersection support
- [ ] Pedestrian crossing integration
- [ ] Performance analytics dashboard
- [ ] Configurable arrival patterns
- [ ] Emergency vehicle priority handling

## 📝 License

This project is open source and available for educational purposes.

## 👥 Contributing

Contributions, issues, and feature requests are welcome!

---

**Note**: This is a simulation project for educational purposes, demonstrating OS scheduling concepts applied to traffic management.