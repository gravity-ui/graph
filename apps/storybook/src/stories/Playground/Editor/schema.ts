import { Monaco } from "@monaco-editor/react";

export function defineConigSchema(monaco: Monaco) {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    schemaValidation: "error",
    schemas: [
      {
        uri: "http://gravity/graph-playground/schema.json", // id of the first schema
        fileMatch: ["*"], // associate with our model
        schema: {
          type: "object",
          properties: {
            blocks: {
              type: "array",
              items: {
                $ref: "#/definitions/TBlock",
              },
              description: "List of blocks (TBlock[])",
            },
            connections: {
              type: "array",
              items: {
                $ref: "#/definitions/TConnection",
              },
              description: "List of connections (TConnection[])",
            },
          },
          required: ["blocks", "connections"],
          definitions: {
            TBlock: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Block identifier (TBlockId)",
                },
                is: {
                  type: "string",
                  description: "String representation of the block type",
                },
                x: {
                  type: "number",
                  description: "X coordinate",
                },
                y: {
                  type: "number",
                  description: "Y coordinate",
                },
                width: {
                  type: "number",
                  description: "Block width",
                },
                height: {
                  type: "number",
                  description: "Block height",
                },
                selected: {
                  type: "boolean",
                  description: "Flag indicating if the block is selected",
                },
                name: {
                  type: "string",
                  description: "Block name",
                },
                anchors: {
                  type: "array",
                  items: {
                    $ref: "#/definitions/TAnchor",
                  },
                  description: "List of anchors (TAnchor[])",
                },
                meta: {
                  type: "object",
                  description: "Meta information (optional)",
                },
              },
              required: ["id", "is", "x", "y", "width", "height", "selected", "name", "anchors"],
            },
            TConnection: {
              type: "object",
              properties: {
                sourceBlockId: {
                  type: "string",
                  description: "Identifier of the source block",
                },
                targetBlockId: {
                  type: "string",
                  description: "Identifier of the target block",
                },
                sourceAnchorId: {
                  type: "string",
                  description: "Identifier of the source anchor (optional)",
                },
                targetAnchorId: {
                  type: "string",
                  description: "Identifier of the target anchor (optional)",
                },
                label: {
                  type: "string",
                  description: "Connection label (optional)",
                },
                styles: {
                  type: "object",
                  properties: {
                    dashes: {
                      type: "array",
                      items: {
                        type: "number",
                      },
                      description: "Array of dash lengths for dashed lines (optional)",
                    },
                  },
                  additionalProperties: true,
                  description: "Connection styles (optional)",
                },
                dashed: {
                  type: "boolean",
                  description: "Flag indicating if the line is dashed (optional)",
                },
                selected: {
                  type: "boolean",
                  description: "Flag indicating if the connection is selected (optional)",
                },
              },
              required: ["sourceBlockId", "targetBlockId"],
            },
            TAnchor: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Anchor identifier",
                },
                blockId: {
                  type: "string",
                  description: "Identifier of the block this anchor belongs to",
                },
                type: {
                  type: "string",
                  enum: ["IN", "OUT"],
                  description: "Anchor type, either IN or OUT",
                },
                index: {
                  type: "number",
                  description: "Anchor index",
                },
              },
              required: ["id", "blockId", "type"],
            },
          },
        },
      },
    ],
  });
}
