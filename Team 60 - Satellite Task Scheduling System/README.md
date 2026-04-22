## PROBLEM STATEMENT

### Formal Definition  

The system addresses a **constrained optimization and scheduling problem** defined over a finite set of monitoring tasks and a limited set of satellite resources.

Let:  
- **T = {t₁, t₂, …, tₙ}** represent a set of monitoring tasks  
- **S = {s₁, s₂, …, sₘ}** represent a set of satellites  

Each task **tᵢ** is characterized by:
- A **spatial attribute** (region of observation)  
- A **temporal interval** [startᵢ, endᵢ]  
- A **priority score** derived from risk, urgency, and duration  

Each satellite **sⱼ** is defined by:
- A **coverage domain** (subset of regions it can observe)  
- A **capacity constraint** (maximum number of assignable tasks)  
- A **temporal schedule** (set of non-overlapping intervals)  

---

### Objective  

Determine an assignment function:

```
f: T → S ∪ {∅}
```

such that:

- **Maximum number of high-priority tasks are scheduled**
- **All system constraints are strictly satisfied**
- **Global scheduling efficiency is maximized**

---

### Constraints (Formally Modeled)

#### 1. Spatial Feasibility Constraint
A task **tᵢ** can only be assigned to satellite **sⱼ** if:

```
region(tᵢ) ∈ coverage(sⱼ)
```

This constraint is enforced using a **Graph (Adjacency List Representation)**.

---

#### 2. Temporal Conflict Constraint  

For any two tasks **t₁ and t₂** assigned to the same satellite:

```
t₁ and t₂ do not overlap ⇔
start₁ < end₂ AND start₂ < end₁ is FALSE
```

This is handled using a **Binary Search Tree (BST)** for efficient interval scheduling.

---

#### 3. Capacity Constraint  

For each satellite **sⱼ**:

```
assigned_tasks(sⱼ) ≤ capacity(sⱼ)
```

This ensures bounded workload distribution.

---

#### 4. Priority Optimization Constraint  

Tasks must be processed in **non-increasing order of priority**:

```
Priority(t₁) ≥ Priority(t₂) ≥ ...
```

This is enforced using a **Max Heap (Priority Queue)**.

---

### Computational Challenges  

The problem inherently involves:

- **Interval Scheduling Optimization**
- **Resource Allocation under Constraints**
- **Graph-Based Feasibility Filtering**
- **Dynamic Conflict Detection**
- **Multi-objective Optimization (priority vs feasibility)**

Naïve approaches lead to:
- Exponential search space  
- High computational overhead  
- Poor scalability  

---

### Core Insight  

The problem is reduced to a **DSA-driven pipeline**, where:

- A **Heap** ensures global optimal ordering  
- A **Graph** prunes infeasible assignments early  
- A **BST** enforces temporal consistency  
- A **Greedy strategy** ensures efficient local optimization  

This transforms a complex combinatorial problem into a **structured, near O(n log n) solution**.

---

### Problem Classification  

This system can be formally categorized under:

- **Greedy Optimization Problems**  
- **Interval Scheduling Problems**  
- **Graph-Constrained Resource Allocation**  
- **Priority-Based Task Scheduling**  

---

### Why This Problem Matters  

Efficient scheduling in satellite systems directly impacts:

- **Environmental monitoring accuracy**  
- **Detection latency for critical pollution events**  
- **Resource utilization efficiency**  
- **Operational scalability in real-world systems**  

---

### Transition to Solution  

To address these challenges, the system implements a **multi-layered DSA-based scheduling engine**, integrating heap-based prioritization, graph traversal, BST-based interval management, and greedy allocation strategies.
