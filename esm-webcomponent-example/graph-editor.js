/* eslint-env browser */
// Import the Graph class from the @gravity-ui/graph package
import { EAnchorType, Graph } from "@gravity-ui/graph";
import { EsmLayer } from "@gravity-ui/graph/esm-components";

/**
 * GraphEditor Web Component
 * A custom element that wraps the @gravity-ui/graph library
 */
class GraphEditor extends HTMLElement {
  constructor() {
    super();

    // Create a shadow DOM
    this.attachShadow({ mode: "open" });

    // Create a container for the graph
    this.container = document.createElement("div");
    this.container.style.width = "100%";
    this.container.style.height = "100%";
    this.container.style.position = "relative";

    // Add the container to the shadow DOM
    this.shadowRoot.appendChild(this.container);

    // Initialize the graph when the element is connected to the DOM
    this._initialized = false;
  }

  connectedCallback() {
    if (!this._initialized) {
      this._initialized = true;
      this.initializeGraph();
    }
  }

  disconnectedCallback() {
    // Clean up resources when the element is removed from the DOM
    if (this.graph) {
      this.graph.stop();
      this.graph = null;
    }
  }

  initializeGraph() {
    // Create the graph instance
    this.graph = new Graph(
      {
        configurationName: "web-component-example",
        constants: {
          block: {
            // Set HEAD_HEIGHT to 0 for proper anchor positioning in small blocks
            HEAD_HEIGHT: 0,
            // Reduce BODY_PADDING for better anchor positioning
            BODY_PADDING: 8
          }
        },
        blocks: [
          {
            id: "block1",
            is: "Block",
            x: 100,
            y: 100,
            width: 150,
            height: 80,
            name: "Source Block",
            selected: false,
            anchors: [
              {
                id: "out1",
                blockId: "block1",
                type: EAnchorType.OUT,
                index: 0,
              },
            ],
          },
          {
            id: "block2",
            is: "Block",
            x: 400,
            y: 200,
            width: 150,
            height: 80,
            name: "Target Block",
            selected: false,
            anchors: [
              {
                id: "in1",
                blockId: "block2",
                type: EAnchorType.IN,
                index: 0,
              },
            ],
          },
        ],
        connections: [
          {
            id: "conn1",
            sourceBlockId: "block1",
            sourceAnchorId: "out1",
            targetBlockId: "block2",
            targetAnchorId: "in1",
            selected: false,
          },
        ],
        settings: {
          canDragCamera: true,
          canZoomCamera: true,
          useBezierConnections: true,
          showConnectionArrows: true,
          useBlocksAnchors: true,
        },
      },
      this.container
    );

    // Set up event listeners
    this.setupEventListeners();

    // Add HTML layer
    this.addHtmlLayer();

    // Start the graph
    this.graph.start();

    // Center the view
    this.graph.zoomTo("center", { padding: 100 });
  }

  addHtmlLayer() {
    // Create the ESM layer
    this.esmLayer = this.graph.addLayer(EsmLayer, {
      camera: this.graph.cameraService,
      root: this.container,
      graph: this.graph,
    });

    // Render HTML blocks
    this.esmLayer.renderBlocks((graph, block) => {
      // Create a custom HTML element for the block
      const element = document.createElement("div");
      element.style.width = "100%";
      element.style.height = "100%";
      element.style.display = "flex";
      element.style.flexDirection = "column";
      element.style.justifyContent = "center";
      element.style.alignItems = "center";
      element.style.padding = "8px";
      element.style.boxSizing = "border-box";
      element.style.backgroundColor = "#f5f5f5";
      element.style.border = "1px solid #ddd";
      element.style.borderRadius = "4px";
      element.style.overflow = "hidden";

      // Add block name
      const nameElement = document.createElement("div");
      nameElement.textContent = block.name;
      nameElement.style.fontWeight = "bold";
      nameElement.style.marginBottom = "8px";
      element.appendChild(nameElement);

      // Add block ID
      const idElement = document.createElement("div");
      idElement.textContent = `ID: ${block.id}`;
      idElement.style.fontSize = "12px";
      idElement.style.color = "#666";
      element.appendChild(idElement);

      // Add a custom button
      const button = document.createElement("button");
      button.textContent = "Click me";
      button.style.marginTop = "8px";
      button.style.padding = "4px 8px";
      button.style.border = "none";
      button.style.borderRadius = "4px";
      button.style.backgroundColor = "#0066ff";
      button.style.color = "white";
      button.style.cursor = "pointer";
      
      // Add button click handler
      button.addEventListener("click", (event) => {
        event.stopPropagation(); // Prevent block selection
        alert(`Button clicked in block: ${block.name}`);
      });
      
      element.appendChild(button);

      return element;
    });
  }

  setupEventListeners() {
    // Listen for block selection changes
    this.graph.on("blocks-selection-change", ({ changes }) => {
      console.log("Selection changed:", changes);

      // Dispatch a custom event
      this.dispatchEvent(
        new CustomEvent("selection-change", {
          detail: changes,
          bubbles: true,
          composed: true,
        })
      );
    });

    // Listen for connection creation
    this.graph.on("connection-created", (connection) => {
      console.log("Connection created:", connection);

      // Dispatch a custom event
      this.dispatchEvent(
        new CustomEvent("connection-created", {
          detail: connection,
          bubbles: true,
          composed: true,
        })
      );
    });
  }

  // Public API methods

  addRandomBlock() {
    const x = Math.random() * 600;
    const y = Math.random() * 400;

    // Create a block ID to use in both block and anchor definitions
    const newBlockId = `block-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const blockId = this.graph.api.addBlock({
      id: newBlockId, // Explicitly set the block ID
      is: "block-action",
      x,
      y,
      width: 150,
      height: 80,
      name: `Block ${this.graph.rootStore.blocksList.$blocks.value.length + 1}`,
      selected: false,
      anchors: [
        {
          id: "in",
          blockId: newBlockId, // Use the same ID as the block
          type: EAnchorType.IN,
          index: 0,
        },
        {
          id: "out",
          blockId: newBlockId, // Use the same ID as the block
          type: EAnchorType.OUT,
          index: 0,
        },
      ],
    });

    // If there are other blocks, create a random connection
    if (this.graph.rootStore.blocksList.$blocks.value.length > 1) {
      // Find a random source block (excluding the new block)
      const sourceBlocks = this.graph.rootStore.blocksList.$blocks.value.filter((b) => b.id !== blockId);
      const sourceBlock = sourceBlocks[Math.floor(Math.random() * sourceBlocks.length)];

      // Create a connection
      this.graph.api.addConnection({
        sourceBlockId: sourceBlock.id,
        sourceAnchorId: "out", // Assuming the source block has an "out" anchor
        targetBlockId: blockId,
        targetAnchorId: "in", // Using the "in" anchor of the new block
        selected: false,
      });
    }

    return blockId;
  }

  centerView() {
    this.graph.zoomTo("center", { padding: 100 });
  }

  toggleBezierConnections() {
    const currentValue = this.graph.settings.useBezierConnections;
    this.graph.api.setSetting("useBezierConnections", !currentValue);
  }

  // Getter for the graph instance
  getGraph() {
    return this.graph;
  }
}

// Register the custom element
customElements.define("graph-editor", GraphEditor);
