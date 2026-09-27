# ⚡ GridTwin

<p align="center">

<img src="docs/gridtwin-demo.gif" alt="GridTwin Animated Demo" width="100%"/>

</p>

<h1 align="center">⚡ GridTwin</h1>

<p align="center">
  <strong>An Interactive 3D Digital Twin for Intelligent Distribution Grid Simulation</strong>
</p>

<p align="center">
  Simulate • Visualize • Analyze • Detect • Compare • Optimize
</p>

<p align="center">

![React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/3D-Three.js-black?logo=three.js)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.x-3776AB?logo=python&logoColor=white)
![Pandapower](https://img.shields.io/badge/Simulation-Pandapower-orange)
![Vite](https://img.shields.io/badge/Build-Vite-646CFF?logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

</p>

---

# 🌐 What is GridTwin?

**GridTwin** is an interactive digital twin platform for electrical distribution networks.

It combines:

- ⚡ Electrical power-flow simulation
- 🌐 Interactive 3D digital twin
- ☀️ Solar generation
- 🔋 Battery Energy Storage System (BESS)
- 🏠 Electrical loads
- 🌦️ Weather data
- 🚨 Constraint and violation detection
- 📊 Advanced analytics
- 🕐 Minute-by-minute simulation
- 🔬 Baseline vs DER comparison
- 🧪 What-If analysis
- 📉 Power-loss analysis
- 🔄 Animated power-flow visualization

Instead of looking at a large table of electrical values, GridTwin turns the network into an **interactive visual system** where users can see how the grid behaves over time.

---

# 💡 The Idea

Modern electrical grids are becoming increasingly dynamic.

Solar generation changes throughout the day.

Electricity demand changes every minute.

Battery systems charge and discharge.

Weather affects renewable generation.

These changes can cause:

- Voltage deviations
- Line overloading
- Transformer loading
- Changing power flow
- Increased losses
- Electrical constraint violations

Traditional simulations can calculate these values, but understanding them visually can be difficult.

GridTwin connects the **calculation layer** with a **visual digital twin**.

The goal is simple:

> ### Don't just calculate what is happening in the grid.  
> ### Let the user actually see it.

---

# 🎯 Core Concept

```mermaid
flowchart LR

    A["☀️ Solar Data"] --> D["⚙️ GridTwin Simulation"]
    B["🏠 Load Data"] --> D
    C["🌦️ Weather Data"] --> D

    D --> E["⚡ Pandapower Power Flow"]

    E --> F["📊 Electrical Results"]
    E --> G["🚨 Constraint Detection"]
    E --> H["📉 Power Loss"]
    E --> I["🔋 BESS State"]

    F --> J["🌐 3D Digital Twin"]
    G --> K["🚨 Violation Analytics"]
    H --> L["📈 Loss Analytics"]
    I --> M["🔋 Battery Analytics"]

    J --> N["👤 User"]
    K --> N
    L --> N
    M --> N
