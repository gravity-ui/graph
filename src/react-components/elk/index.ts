import { MultipointConnection as CanvasMultipointConnection } from "../../components/canvas/connections/MultipointConnection";

export { useElk } from "./hooks/useElk";

/**
 * @deprecated use `import { MultipointConnection } from "@gravity-ui/graph"`
 */
export const MultipointConnection = CanvasMultipointConnection;
