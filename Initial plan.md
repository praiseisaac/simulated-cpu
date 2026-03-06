Goal: To build a simulation of a computer CPU with registers, memory, and fetch and decode operations.

The CPU will fetch information from the memory, decode it, and execute the instructions based on the instruction set. 

Frameworks: NextJS, tailwiindcss, React flow (for node visualization)

**How the UI works:**

	- There are x nodes
		- The CPU
	  - The Memory Component
	  - Visualization layer
	- User can drag peripherals into the node editor. It stays idle until connected to the CPU

___

Animated dots visualize data moving from one note to another.
	This can be done natively using react flow.

**Pages to build**
Visualizer (This is the main canvas that shows the different nodes and connection points between them)
	For each node, I can click in and see the process happening inside of it. 
		For memory, we will have sub visualizations in modals
		For the CPU, it will visualize the fetch, decode, and execution processes

All nodes will be interactive and can be moved 

___

**Peripherals:**

- Some nodes will be peripherals which send interrupts that the CPU will have to handle based on priority

- Processes will be queued based on their priority

- One will be a button that simply interrupts the processes

- We will add more later. 

- Peripherals can be stand alone and but the ReactFlow node can be connected to the CPU at which point, it can start having an effect.


CPU definition
The CPU should have 2 cores. Meaning, it can only have two running processes/jobs at any time
The clock cycle will be 1 second

**Files:**
app/visualizer/page.tsx (page)
app/visualizer/_components/*.component.tsx (glob for all components that will be needed focused on UI rather than interactivity) 
app/visualizer/_modules/*.modules.tsx (these are similar to components, but have internal managed state and have effects beyond visualizing the data)
app/visualizer/styles.module.css (styling)
services/cpu/CPU.service.ts

peripherals/*.peripheral.ts

services/Memory.service.ts

**Persistence**: JSON file

**Rules for building:**

- Decomposition: All components/modules should have proper separation of concerns and specialization.
- Never edit multiple files, we will work one file and feature at a time
- Break into phases of work. Grouped by functionality
- At each point, I will test the code by running it to validate, so we must work in chunks of time
- We will start with the services and validate them using tsx. Then the UI around the functional services.
- NEVER use 'any' all items must be strictly typed. Use 'unknown' sparsely.

Sources.
https://nextjs.org/docs/app/getting-started/linking-and-navigating
https://reactflow.dev/learn/customization/custom-nodes
https://reactflow.dev/learn/advanced-use/typescript#custom-nodes
https://reactflow.dev/learn/advanced-use/computing-flows
https://reactflow.dev/examples/interaction/drag-and-drop
https://reactflow.dev/examples/edges/animating-edges

https://www.ibm.com/think/topics/central-processing-unit