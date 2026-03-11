import { LitElement, TemplateResult } from 'lit';
import type { AgentUiConfig } from '../shared';
import type { BreadcrumbNode, ComponentFiberInfo, SourceInfo } from './reactBreadcrumb';
interface Position {
    left?: string;
    right?: string;
    top?: string;
    bottom?: string;
    transform?: string;
    maxHeight?: string;
}
interface ElementTipStyle {
    vertical: string;
    horizon: string;
    visibility: string;
    additionStyle?: {
        transform: string;
    };
}
interface TreeNode extends SourceInfo {
    children: TreeNode[];
    element: HTMLElement;
    depth: number;
}
interface ActiveNode {
    top?: string;
    bottom?: string;
    left?: string;
    width?: string;
    content?: string;
    visibility?: 'visible' | 'hidden';
    class?: 'tooltip-top' | 'tooltip-bottom';
}
type AgentStreamEventType = 'text' | 'reasoning' | 'tool-call' | 'tool-result' | 'source' | 'file' | 'error' | 'start-step' | 'finish-step' | 'unknown';
interface AgentFileSummary {
    mediaType: string;
    size?: number;
    hasContent?: boolean;
}
interface AgentStreamEvent {
    id: string;
    type: AgentStreamEventType;
    text?: string;
    toolCallId?: string;
    toolName?: string;
    input?: string;
    output?: string;
    inputRaw?: unknown;
    outputRaw?: unknown;
    source?: {
        id?: string;
        url?: string;
        title?: string;
        sourceType?: string;
    };
    file?: AgentFileSummary;
    request?: string;
    response?: string;
    message?: string;
}
interface AgentAttachment {
    id: string;
    name: string;
    type: string;
    size: number;
    isImage: boolean;
    dataUrl?: string;
    text?: string;
}
export declare class CodeInspectorComponent extends LitElement {
    hotKeys: string;
    port: number;
    showSwitch: boolean;
    autoToggle: boolean;
    hideConsole: boolean;
    locate: boolean;
    copy: boolean | string;
    target: string;
    targetNode: HTMLElement | null;
    ip: string;
    agentUi: AgentUiConfig | null;
    private wheelThrottling;
    modeKey: string;
    position: {
        top: number;
        right: number;
        bottom: number;
        left: number;
        padding: {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        border: {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
        margin: {
            top: number;
            right: number;
            bottom: number;
            left: number;
        };
    };
    element: {
        name: string;
        line: number;
        column: number;
        path: string;
    };
    elementTipStyle: ElementTipStyle;
    show: boolean;
    showNodeTree: boolean;
    nodeTreePosition: Position;
    nodeTree: TreeNode | null;
    dragging: boolean;
    mousePosition: {
        baseX: number;
        baseY: number;
        moveX: number;
        moveY: number;
    };
    draggingTarget: 'switch' | 'nodeTree';
    open: boolean;
    moved: boolean;
    hoverSwitch: boolean;
    preUserSelect: string;
    sendType: 'xhr' | 'img';
    activeNode: ActiveNode;
    showSettingsModal: boolean;
    internalLocate: boolean;
    internalCopy: boolean;
    internalTarget: boolean;
    chatOpen: boolean;
    overlayMode: 'full' | 'outline';
    private forceOutlineNextCover;
    breadcrumb: BreadcrumbNode[];
    breadcrumbIndex: number;
    requirement: string;
    agentProvider: string;
    agentMode: string;
    agentProviderOpen: boolean;
    agentModeOpen: boolean;
    agentFiles: AgentAttachment[];
    agentEvents: AgentStreamEvent[];
    agentLoading: boolean;
    agentError: string;
    agentReasoning: string;
    agentActions: string;
    agentTrace: string;
    private agentTraceType;
    private agentAbortController;
    private agentEventId;
    private agentToolCallDrafts;
    componentChain: ComponentFiberInfo[];
    componentChainIndex: number;
    private componentBreadcrumbsByChain;
    private componentBreadcrumbIndexByChain;
    inspectorSwitchRef: HTMLDivElement;
    codeInspectorContainerRef: HTMLDivElement;
    elementInfoRef: HTMLDivElement;
    agentInputRef?: HTMLTextAreaElement;
    agentLogRef?: HTMLDivElement;
    agentFileInputRef?: HTMLInputElement;
    nodeTreeRef: HTMLDivElement;
    nodeTreeTitleRef: HTMLDivElement;
    nodeTreeTooltipRef: HTMLDivElement;
    features: {
        label: string;
        description: string;
        checked: () => boolean;
        onChange: () => void;
    }[];
    private eventListeners;
    isTracking: (e: any) => boolean | "";
    getDomPropertyValue: (target: HTMLElement, property: string) => number;
    calculateElementInfoPosition: (target: HTMLElement) => Promise<{
        vertical: string;
        horizon: string;
        top: number;
        left: number;
        isExternal: boolean;
        additionStyle?: undefined;
    } | {
        vertical: string;
        horizon: string;
        top: number;
        left: number;
        isExternal: boolean;
        additionStyle: {
            transform: string;
        };
    }>;
    renderCover: (target: HTMLElement) => Promise<void>;
    private parseSourceInfoFromPath;
    private buildDomBreadcrumb;
    private getComponentFiberInfo;
    private findComponentFromDomPath;
    private buildDomCodeBreadcrumb;
    private getReactFiberFromDom;
    private getNearestDomFromFiber;
    private buildReactBreadcrumb;
    private trimBreadcrumbByPath;
    private buildBreadcrumb;
    private pickTargetNode;
    private buildBreadcrumbFromNodePath;
    private buildNodeTreeFromBreadcrumb;
    private getBreadcrumbDisplayParts;
    private scrollActiveBreadcrumbIntoView;
    private openChat;
    private closeChat;
    getAstroFilePath: (target: HTMLElement) => string;
    getSourceInfo: (target: HTMLElement) => SourceInfo | null;
    removeCover: (force?: boolean | MouseEvent) => void;
    renderLayerPanel: (nodeTree: TreeNode, { x, y }: {
        x: number;
        y: number;
    }) => void;
    removeLayerPanel: () => void;
    addGlobalCursorStyle: () => void;
    removeGlobalCursorStyle: () => void;
    sendXHR: () => void;
    sendImg: () => void;
    buildTargetUrl: () => string;
    trackCode: () => void;
    private handleModeShortcut;
    showNotification(message: string, type?: 'success' | 'error'): void;
    copyToClipboard(text: string): void;
    private fallbackCopy;
    handleDrag: (e: MouseEvent | TouchEvent) => void;
    getValidNodeList: (nodePath: HTMLElement[]) => {
        node: HTMLElement;
        isAstro: boolean;
    }[];
    isSamePositionNode: (node1: HTMLElement, node2: HTMLElement) => boolean;
    handleMouseMove: (e: MouseEvent | TouchEvent) => Promise<void>;
    handleWheel: (e: WheelEvent) => void;
    handleMouseClick: (e: MouseEvent | TouchEvent) => void;
    handleContextMenu: (e: MouseEvent) => void;
    generateNodeTree: (nodePath: HTMLElement[]) => TreeNode;
    handlePointerDown: (e: PointerEvent) => void;
    handleKeyUp: (e: KeyboardEvent) => void;
    private jumpBreadcrumb;
    private handleBreadcrumbClick;
    private gotoParentBreadcrumb;
    private gotoChildBreadcrumb;
    private gotoPrevComponentBreadcrumb;
    private gotoNextComponentBreadcrumb;
    private rebuildBreadcrumbForComponent;
    private cancelAgent;
    private nextAgentEventId;
    private resetAgentStream;
    private scrollAgentLogToBottom;
    private truncateText;
    private formatAgentValue;
    private formatBytes;
    private formatAgentFileSummary;
    private tryParseJsonString;
    private getAgentHostLabel;
    private formatPathLabel;
    private describeToolCall;
    private countDiffLines;
    private describeToolResult;
    private getToolCallMeta;
    private getToolResultMeta;
    private extractOutputText;
    private extractDiffPreview;
    private extractOutputPreview;
    private buildToolResultPreview;
    private collectChangedFiles;
    private splitParagraphs;
    private buildTimelineBlocks;
    private addAgentEvent;
    private updateAgentEvent;
    private appendAgentText;
    private replaceAgentPlainText;
    private startToolCall;
    private appendToolCallDelta;
    private finalizeToolCall;
    private addToolResult;
    private addSourceEvent;
    private addFileEvent;
    private addErrorEvent;
    private consumeAgentPart;
    private syncAgentUiDefaults;
    private formatAgentFileSize;
    private estimatePayloadSize;
    private readFileAsDataUrl;
    private readFileAsText;
    private handleAgentAttachClick;
    private handleAgentFilesSelected;
    private removeAgentFile;
    private buildAgentFilesPayload;
    private getAgentOptionLabel;
    private toggleAgentMenu;
    private selectAgentOption;
    private buildClientContextPrompt;
    private submitAgent;
    private streamAgentWithXhr;
    printTip: () => void;
    getMousePosition: (e: MouseEvent | TouchEvent) => {
        x: number;
        y: number;
    };
    recordMousePosition: (e: MouseEvent | TouchEvent, target: "switch" | "nodeTree") => void;
    handleMouseUp: (e: MouseEvent | TouchEvent) => void;
    switch: (e: Event) => void;
    handleClickTreeNode: (node: TreeNode) => void;
    handleMouseEnterNode: (e: MouseEvent, node: TreeNode) => Promise<void>;
    handleMouseLeaveNode: () => void;
    toggleSettingsModal: () => void;
    closeSettingsModal: () => void;
    toggleLocate: () => void;
    toggleCopy: () => void;
    toggleTarget: () => void;
    /**
     * Attach all event listeners
     */
    private attachEventListeners;
    /**
     * Detach all event listeners
     */
    private detachEventListeners;
    protected updated(changedProps: Map<PropertyKey, unknown>): void;
    protected firstUpdated(): void;
    disconnectedCallback(): void;
    renderNodeTree: (node: TreeNode) => TemplateResult;
    render(): TemplateResult<1>;
    static styles: import("lit").CSSResult;
}
export {};
