import { type ReactElement, type ReactNode } from "react";
import type { LucraHeadlessClient } from "../headless/index.js";
export declare function LucraProvider({ client, children, }: {
    client: LucraHeadlessClient;
    children?: ReactNode;
}): ReactElement;
export declare function useLucra(): LucraHeadlessClient;
