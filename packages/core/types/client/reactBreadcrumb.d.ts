export interface SourceInfo {
    name: string;
    path: string;
    line: number;
    column: number;
}
export interface BreadcrumbNode extends SourceInfo {
    element: HTMLElement;
}
export interface ComponentFiberInfo {
    name: string;
    sourceInfo: SourceInfo | null;
    componentDom: HTMLElement | null;
}
type ValidNodeItem = {
    node: HTMLElement;
    isAstro: boolean;
};
type SourceInfoGetter = (node: HTMLElement) => SourceInfo | null;
type ValidNodeListGetter = (nodes: HTMLElement[]) => ValidNodeItem[];
export declare const parseSourceInfoFromPath: (paths: string) => SourceInfo | null;
export declare const getComponentFiberInfo: (dom: HTMLElement) => ComponentFiberInfo | null;
export declare const getComponentFiberInfoList: (dom: HTMLElement) => ComponentFiberInfo[];
export declare const buildDomBreadcrumb: (nodePath: EventTarget[], stopDom: HTMLElement | null | undefined, getValidNodeList: ValidNodeListGetter, getSourceInfo: SourceInfoGetter) => BreadcrumbNode[];
export declare const findComponentFromDomPath: (nodePath: EventTarget[], getSourceInfo: SourceInfoGetter) => {
    info: SourceInfo;
    element: HTMLElement;
} | null;
export declare const buildDomCodeBreadcrumb: (nodePath: EventTarget[], getSourceInfo: SourceInfoGetter) => BreadcrumbNode[];
export declare const buildReactBreadcrumb: (dom: HTMLElement, getSourceInfo: SourceInfoGetter, targetNode?: HTMLElement | null, componentInfo?: ComponentFiberInfo | null) => BreadcrumbNode[];
export declare const trimBreadcrumbByPath: (items: BreadcrumbNode[], path?: string) => BreadcrumbNode[];
export declare const buildBreadcrumb: (nodePath: EventTarget[], dom: HTMLElement | null | undefined, componentInfo: ComponentFiberInfo | null | undefined, deps: {
    getValidNodeList: ValidNodeListGetter;
    getSourceInfo: SourceInfoGetter;
    elementPath?: string;
    targetNode?: HTMLElement | null;
}) => BreadcrumbNode[];
export {};
