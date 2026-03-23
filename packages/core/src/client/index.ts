import { LitElement, TemplateResult, css, html } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import {
  computePosition,
  flip,
  offset,
  size,
  shift,
  type Placement,
  type VirtualElement,
} from '@floating-ui/dom';
import { PathName, DefaultPort } from '../shared';
import type { AgentUiConfig, AgentUiOption } from '../shared';
import { formatOpenPath } from 'launch-ide';
import {
  buildBreadcrumb as buildReactFiberBreadcrumb,
  getComponentFiberInfoList,
} from './reactBreadcrumb';
import type {
  BreadcrumbNode,
  ComponentFiberInfo,
  SourceInfo,
} from './reactBreadcrumb';

const styleId = '__code-inspector-unique-id';
const AstroFile = 'data-astro-source-file';
const AstroLocation = 'data-astro-source-loc';

const MacHotKeyMap = {
  ctrlKey: '^control',
  altKey: '⌥option',
  metaKey: '⌘command',
  shiftKey: 'shift',
};

const WindowsHotKeyMap = {
  ctrlKey: 'Ctrl',
  altKey: 'Alt',
  metaKey: '⊞Windows',
  shiftKey: 'Shift',
};

interface CodeInspectorHtmlElement extends HTMLElement {
  'data-insp-path': string;
}

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
  additionStyle?: Record<string, string | undefined>;
}

interface TreeNode extends SourceInfo {
  children: TreeNode[];
  element: HTMLElement;
  depth: number;
}

type BreadcrumbDisplayPart =
  | { kind: 'item'; index: number; node: BreadcrumbNode }
  | { kind: 'ellipsis'; key: string };

interface ActiveNode {
  top?: string;
  bottom?: string;
  left?: string;
  width?: string;
  content?: string;
  visibility?: 'visible' | 'hidden';
  class?: 'tooltip-top' | 'tooltip-bottom';
}

type AgentStreamEventType =
  | 'text'
  | 'reasoning'
  | 'tool-call'
  | 'tool-result'
  | 'source'
  | 'file'
  | 'error'
  | 'start-step'
  | 'finish-step'
  | 'unknown';

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

type AgentActivityKind = 'read' | 'list' | 'search' | 'edit' | 'tool';

interface AgentActivityItem {
  id: string;
  kind: AgentActivityKind;
  label: string;
  detail?: string;
  status?: 'pending' | 'done';
  filePath?: string;
}

type AgentTimelineBlockKind =
  | 'text'
  | 'reasoning'
  | 'tool'
  | 'source'
  | 'file'
  | 'error';

interface AgentTimelineBlock {
  kind: AgentTimelineBlockKind;
  text?: string;
  events: AgentStreamEvent[];
  call?: AgentStreamEvent;
  result?: AgentStreamEvent;
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

interface SelectedContextPayload {
  id: string;
  filePath: string;
  line: number;
  column: number;
  elementName: string;
  dom: {
    tagName: string;
    firstClass: string;
    className: string;
    textContent: string;
  };
  domPath: Array<{
    name: string;
    label: string;
    path: string;
    line: number;
    column: number;
  }>;
  contextPrompt: string;
  order: number;
}

interface SelectionContext {
  id: string;
  targetNode: HTMLElement | null;
  anchorNode: HTMLElement | null;
  element: SourceInfo;
  breadcrumb: BreadcrumbNode[];
  breadcrumbIndex: number;
  componentChain: ComponentFiberInfo[];
  componentChainIndex: number;
  componentBreadcrumbsByChain: Record<number, BreadcrumbNode[]>;
  componentBreadcrumbIndexByChain: Record<number, number>;
  createdAt: number;
}

const PopperWidth = 300;

function nextTick() {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
}

export class CodeInspectorComponent extends LitElement {
  @property()
  hotKeys: string = 'shiftKey,altKey';
  @property()
  port: number = DefaultPort;
  @property()
  showSwitch: boolean = false;
  @property()
  autoToggle: boolean = false;
  @property()
  hideConsole: boolean = false;
  @property()
  locate: boolean = true;
  @property()
  copy: boolean | string = false;
  @property()
  target: string = '';
  @property()
  targetNode: HTMLElement | null = null;
  @property()
  ip: string = 'localhost';
  @property({ attribute: false })
  agentUi: AgentUiConfig | null = null;

  private wheelThrottling: boolean = false;
  @property()
  modeKey: string = 'z';

  @state()
  position = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    padding: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    border: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    margin: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
  }; // 弹窗位置
  @state()
  element = { name: '', line: 0, column: 0, path: '' }; // 选中节点信息
  @state()
  elementTipStyle: ElementTipStyle = {
    vertical: '',
    horizon: '',
    visibility: '',
  }; // 信息浮块位置类名
  @state()
  show = false; // 是否展示
  @state()
  showNodeTree = false; // 是否展示图层面板
  @state()
  nodeTreePosition: Position = {}; // 图层面板位置
  @state()
  nodeTree: TreeNode | null = null; // 节点树
  @state()
  dragging = false; // 是否正在拖拽中
  @state()
  mousePosition = { baseX: 0, baseY: 0, moveX: 0, moveY: 0 };
  @state()
  draggingTarget: 'switch' | 'nodeTree' = 'switch'; // 是否正在拖拽节点树
  @state()
  open = false; // 点击开关打开
  @state()
  moved = false;
  @state()
  hoverSwitch = false;
  @state()
  preUserSelect = '';
  @state()
  sendType: 'xhr' | 'img' = 'xhr';
  @state()
  activeNode: ActiveNode = {};
  @state()
  showSettingsModal = false; // 是否显示设置弹窗
  @state()
  internalLocate = true; // 内部 locate 状态
  @state()
  internalCopy: boolean = false; // 内部 copy 状态
  @state()
  internalTarget = false; // 内部 target 状态
  @state()
  chatOpen = false; // 点击后固定对话
  @state()
  overlayMode: 'full' | 'outline' = 'full';
  private forceOutlineNextCover = false;
  @state()
  breadcrumb: BreadcrumbNode[] = [];
  @state()
  breadcrumbIndex = 0;
  @state()
  selections: SelectionContext[] = [];
  @state()
  activeSelectionId = '';
  @state()
  requirement = '';
  @state()
  agentProvider = '';
  @state()
  agentMode = '';
  @state()
  agentProviderOpen = false;
  @state()
  agentModeOpen = false;
  @state()
  agentFiles: AgentAttachment[] = [];
  @state()
  agentEvents: AgentStreamEvent[] = [];
  @state()
  agentLoading = false;
  @state()
  agentError = '';

  private agentAbortController: AbortController | null = null;
  private agentEventId = 0;
  private agentToolCallDrafts: Record<
    string,
    { index: number; argsText: string; toolName?: string }
  > = {};
  private elementInfoResizeObserver?: ResizeObserver;
  private elementInfoRepositioning = false;
  private coverRenderRequestId = 0;
  private elementInfoPositionRequestId = 0;
  private anchorNode: HTMLElement | null = null;
  @state()
  componentChain: ComponentFiberInfo[] = [];
  @state()
  componentChainIndex = 0;
  private componentBreadcrumbsByChain: Record<number, BreadcrumbNode[]> = {};
  private componentBreadcrumbIndexByChain: Record<number, number> = {};
  private lastSelectedContextSyncKey = '';

  @query('#inspector-switch')
  inspectorSwitchRef!: HTMLDivElement;

  @query('#code-inspector-container')
  codeInspectorContainerRef!: HTMLDivElement;
  @query('#element-info')
  elementInfoRef!: HTMLDivElement;
  @query('#ci-agent-input')
  agentInputRef?: HTMLTextAreaElement;
  @query('#ci-agent-log')
  agentLogRef?: HTMLDivElement;
  @query('#ci-agent-file-input')
  agentFileInputRef?: HTMLInputElement;
  @query('#inspector-node-tree')
  nodeTreeRef!: HTMLDivElement;

  @query('.inspector-layer-title')
  nodeTreeTitleRef!: HTMLDivElement;
  @query('#node-tree-tooltip')
  nodeTreeTooltipRef!: HTMLDivElement;

  features = [
    {
      label: 'Locate Code',
      description: 'Open the editor and locate code',
      checked: () => !!this.internalLocate,
      onChange: () => this.toggleLocate(),
    },
    {
      label: 'Copy Path',
      description: 'Copy the code path to clipboard',
      checked: () => !!this.internalCopy,
      onChange: () => this.toggleCopy(),
    },
    {
      label: 'Open Target',
      description: 'Open the target url',
      checked: () => !!this.internalTarget,
      onChange: () => this.toggleTarget(),
    },
  ];

  // Event listeners configuration for centralized management
  private eventListeners: Array<{
    event: string;
    handler: EventListener;
    options: boolean | AddEventListenerOptions;
  }> = [];

  isTracking = (e: any) => {
    return (
      this.hotKeys && this.hotKeys.split(',').every((key) => e[key.trim()])
    );
  };

  // 20px -> 20
  getDomPropertyValue = (target: HTMLElement, property: string) => {
    const computedStyle = window.getComputedStyle(target);
    return Number(computedStyle.getPropertyValue(property).replace('px', ''));
  };

  private scheduleElementInfoReposition = () => {
    if (this.elementInfoRepositioning) {
      return;
    }
    this.elementInfoRepositioning = true;
    requestAnimationFrame(async () => {
      this.elementInfoRepositioning = false;
      const anchorElement = this.getCurrentAnchorElement();
      const requestId = ++this.elementInfoPositionRequestId;
      if (!this.show || this.showNodeTree || !anchorElement || !this.elementInfoRef) {
        return;
      }
      const { vertical, horizon, additionStyle } =
        await this.calculateElementInfoPosition(anchorElement);
      if (
        requestId !== this.elementInfoPositionRequestId ||
        this.getCurrentAnchorElement() !== anchorElement
      ) {
        return;
      }
      this.elementTipStyle = {
        vertical,
        horizon,
        visibility: 'visible',
        additionStyle,
      };
    });
  };

  private handleViewportChange = () => {
    this.scheduleElementInfoReposition();
  };

  private getCurrentAnchorElement = () => {
    if (this.chatOpen) {
      return (
        this.breadcrumb[this.breadcrumbIndex]?.element ||
        this.anchorNode ||
        this.targetNode
      );
    }
    return this.anchorNode || this.targetNode;
  };

  private getHoverNodePath = (e: MouseEvent | TouchEvent) => {
    const point =
      e instanceof MouseEvent
        ? { x: e.clientX, y: e.clientY }
        : {
            x: (e.touches[0] || e.changedTouches[0])?.clientX ?? 0,
            y: (e.touches[0] || e.changedTouches[0])?.clientY ?? 0,
          };
    const elements =
      typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(point.x, point.y)
        : [];
    const firstPageElement = elements.find(
      (node) => node instanceof HTMLElement && !this.contains(node)
    ) as HTMLElement | undefined;
    const start = firstPageElement || (e.target instanceof HTMLElement ? e.target : null);
    if (!start) return [];

    const path: HTMLElement[] = [];
    let current: HTMLElement | null = start;
    while (current) {
      path.push(current);
      current = current.parentElement;
    }
    return path;
  };

  private getViewportBounds = () => {
    const vv = window.visualViewport;
    if (vv) {
      return {
        left: vv.offsetLeft || 0,
        top: vv.offsetTop || 0,
        width: vv.width || document.documentElement.clientWidth || window.innerWidth || 0,
        height: vv.height || document.documentElement.clientHeight || window.innerHeight || 0,
      };
    }
    return {
      left: 0,
      top: 0,
      width: document.documentElement.clientWidth || window.innerWidth || 0,
      height: document.documentElement.clientHeight || window.innerHeight || 0,
    };
  };

  // 计算 element-info 的最佳位置
  calculateElementInfoPosition = async (target: HTMLElement) => {
    const { top, right, bottom, left, width, height } =
      target.getBoundingClientRect();
    const marginTop = this.getDomPropertyValue(target, 'margin-top');
    const marginRight = this.getDomPropertyValue(target, 'margin-right');
    const marginBottom = this.getDomPropertyValue(target, 'margin-bottom');
    const marginLeft = this.getDomPropertyValue(target, 'margin-left');

    await nextTick();

    if (!this.elementInfoRef) {
      return {
        vertical: '',
        horizon: '',
        additionStyle: {
          position: 'fixed',
          left: '8px',
          top: '8px',
          '--ci-panel-max-height': 'calc(100vh - 16px)',
        },
      };
    }
    const floatingRect = this.elementInfoRef.getBoundingClientRect();

    const referenceRect = {
      x: left - marginLeft,
      y: top - marginTop,
      top: top - marginTop,
      left: left - marginLeft,
      right: right + marginRight,
      bottom: bottom + marginBottom,
      width: width + marginLeft + marginRight,
      height: height + marginTop + marginBottom,
    };
    const reference: VirtualElement = {
      getBoundingClientRect: () => referenceRect,
      contextElement: target,
    };
    const fallbackPlacements: Placement[] = [
      'bottom-end',
      'top-start',
      'top-end',
    ];
    let panelMaxHeight = 'calc(100vh - 16px)';
    const { x, y } = await computePosition(reference, this.elementInfoRef, {
      strategy: 'fixed',
      placement: 'bottom-start',
      middleware: [
        offset(8),
        flip({
          padding: 8,
          fallbackPlacements,
        }),
        shift({
          padding: 8,
        }),
        size({
          padding: 8,
          apply({ availableHeight }) {
            panelMaxHeight = `${Math.max(180, Math.floor(availableHeight))}px`;
          },
        }),
      ],
    });
    const viewport = this.getViewportBounds();
    const minViewportPadding = 8;
    const maxX = Math.max(
      viewport.left + minViewportPadding,
      viewport.left + viewport.width - floatingRect.width - minViewportPadding
    );
    const maxY = Math.max(
      viewport.top + minViewportPadding,
      viewport.top + viewport.height - floatingRect.height - minViewportPadding
    );
    const clampedX = Math.min(
      Math.max(x, viewport.left + minViewportPadding),
      maxX
    );
    const clampedY = Math.min(
      Math.max(y, viewport.top + minViewportPadding),
      maxY
    );

    return {
      vertical: '',
      horizon: '',
      additionStyle: {
        position: 'fixed',
        left: `${Math.round(clampedX)}px`,
        top: `${Math.round(clampedY)}px`,
        right: 'auto',
        bottom: 'auto',
        transform: 'none',
        '--ci-panel-max-height': panelMaxHeight,
      },
    };
  };

  // 渲染遮罩层
  renderCover = async (target: HTMLElement, anchor: HTMLElement = target) => {
    if (
      target === this.targetNode &&
      anchor === this.anchorNode &&
      !this.chatOpen &&
      !this.forceOutlineNextCover
    ) {
      return;
    }
    const requestId = ++this.coverRenderRequestId;
    this.elementInfoPositionRequestId += 1;
    this.targetNode = target;
    this.anchorNode = anchor;
    // 设置 target 的位置
    const { top, right, bottom, left } = anchor.getBoundingClientRect();
    const browserHeight = document.documentElement.clientHeight;
    const browserWidth = document.documentElement.clientWidth;
    const area = Math.max(0, right - left) * Math.max(0, bottom - top);
    const viewportArea = browserWidth * browserHeight;
    if (this.forceOutlineNextCover) {
      this.overlayMode = 'outline';
      this.forceOutlineNextCover = false;
    } else {
      this.overlayMode = area > viewportArea * 0.45 ? 'outline' : 'full';
    }
    this.position = {
      top,
      right,
      bottom,
      left,
      border: {
        top: this.getDomPropertyValue(target, 'border-top-width'),
        right: this.getDomPropertyValue(target, 'border-right-width'),
        bottom: this.getDomPropertyValue(target, 'border-bottom-width'),
        left: this.getDomPropertyValue(target, 'border-left-width'),
      },
      padding: {
        top: this.getDomPropertyValue(target, 'padding-top'),
        right: this.getDomPropertyValue(target, 'padding-right'),
        bottom: this.getDomPropertyValue(target, 'padding-bottom'),
        left: this.getDomPropertyValue(target, 'padding-left'),
      },
      margin: {
        top: this.getDomPropertyValue(target, 'margin-top'),
        right: this.getDomPropertyValue(target, 'margin-right'),
        bottom: this.getDomPropertyValue(target, 'margin-bottom'),
        left: this.getDomPropertyValue(target, 'margin-left'),
      },
    };

    // 设置位置类名
    this.elementTipStyle = {
      vertical: '',
      horizon: '',
      visibility: 'hidden',
    };

    // 增加鼠标光标样式
    this.addGlobalCursorStyle();
    // 防止 select
    if (!this.preUserSelect) {
      this.preUserSelect = getComputedStyle(document.body).userSelect;
    }
    document.body.style.userSelect = 'none';
    this.element = this.getSourceInfo(target)!;
    this.show = true;
    if (!this.showNodeTree) {
      await this.updateComplete;
      const { vertical, horizon, additionStyle } =
        await this.calculateElementInfoPosition(anchor);
      if (
        requestId !== this.coverRenderRequestId ||
        this.targetNode !== target ||
        this.anchorNode !== anchor
      ) {
        return;
      }
      this.elementTipStyle = {
        vertical,
        horizon,
        visibility: 'visible',
        additionStyle,
      };
    }
  };



  private pickTargetNode = (
    validNodeList: { node: HTMLElement; isAstro: boolean }[]
  ): HTMLElement | null => {
    for (const { node, isAstro } of validNodeList) {
      if (isAstro) {
        return node;
      }
      return node;
    }
    return null;
  };

  private buildBreadcrumbFromNodePath = (
    nodePath: EventTarget[]
  ): { items: BreadcrumbNode[]; targetNode: HTMLElement | null } => {
    const nodes = nodePath.filter(
      (n): n is HTMLElement => n instanceof HTMLElement
    );
    const validNodeList = this.getValidNodeList(nodes);
    const targetNode = this.pickTargetNode(validNodeList);
    const items: BreadcrumbNode[] = [];
    for (const { node } of validNodeList.reverse()) {
      const info = this.getSourceInfo(node);
      if (!info) continue;
      items.push({ ...info, element: node });
      if (targetNode && node === targetNode) break;
    }
    return { items, targetNode };
  };

  private buildNodeTreeFromBreadcrumb = (
    items: BreadcrumbNode[]
  ): TreeNode | null => {
    if (items.length === 0) return null;
    let root: TreeNode | null = null;
    let depth = 1;
    let preNode: TreeNode | null = null;
    for (const item of items) {
      const node: TreeNode = {
        ...item,
        children: [],
        depth: depth++,
      };
      if (preNode) {
        preNode.children.push(node);
      } else {
        root = node;
      }
      preNode = node;
    }
    return root;
  };

  private getBreadcrumbDisplayParts = (): BreadcrumbDisplayPart[] => {
    const items = this.breadcrumb;
    const n = items.length;
    if (n === 0) return [];
    if (n <= 6) {
      return items.map((node, index) => ({ kind: 'item', index, node }));
    }

    const current = Math.min(Math.max(this.breadcrumbIndex, 0), n - 1);
    const last = n - 1;

    let start = Math.max(1, current - 1);
    let end = Math.min(last - 1, current + 1);

    if (current <= 1) {
      start = 1;
      end = Math.min(last - 1, 3);
    }
    if (current >= last - 1) {
      end = last - 1;
      start = Math.max(1, last - 3);
    }

    const parts: BreadcrumbDisplayPart[] = [
      { kind: 'item', index: 0, node: items[0] },
    ];

    if (start > 1) {
      parts.push({ kind: 'ellipsis', key: 'left' });
    }
    for (let i = start; i <= end; i++) {
      parts.push({ kind: 'item', index: i, node: items[i] });
    }
    if (end < last - 1) {
      parts.push({ kind: 'ellipsis', key: 'right' });
    }

    parts.push({ kind: 'item', index: last, node: items[last] });
    return parts;
  };

  private scrollActiveBreadcrumbIntoView = () => {
    const root = this.shadowRoot;
    if (!root) return;
    const active = root.querySelector<HTMLElement>(
      `.ci-crumb[data-index="${this.breadcrumbIndex}"]`
    );
    active?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };

  private getActiveSelection = () => {
    if (!this.activeSelectionId) return null;
    return (
      this.selections.find((item) => item.id === this.activeSelectionId) || null
    );
  };

  private buildSelectionId = (
    element: SourceInfo,
    breadcrumb: BreadcrumbNode[]
  ) => {
    const tail = breadcrumb
      .map((item) => `${item.path}:${item.line}:${item.column}:${item.name}`)
      .join('>');
    return `${element.path}:${element.line}:${element.column}:${tail}`;
  };

  private createSelectionFromNodePath = (
    nodePath: EventTarget[],
    dom?: HTMLElement
  ): SelectionContext | null => {
    const targetDom = dom || this.targetNode;
    let componentInfo: ComponentFiberInfo | null = null;
    let componentChain: ComponentFiberInfo[] = [];
    if (targetDom) {
      componentChain = getComponentFiberInfoList(targetDom);
      componentInfo = componentChain[0] || null;
    }

    let targetNode: HTMLElement | null = null;
    let breadcrumb: BreadcrumbNode[] = [];
    if (componentInfo) {
      breadcrumb = buildReactFiberBreadcrumb(
        nodePath,
        targetDom || undefined,
        componentInfo || undefined,
        {
          getSourceInfo: (node) => this.getSourceInfo(node),
          getValidNodeList: (nodes) => this.getValidNodeList(nodes),
          elementPath: this.element?.path,
          targetNode: targetDom,
        }
      );
      if (componentInfo.componentDom) {
        targetNode = targetDom;
      }
    } else {
      const result = this.buildBreadcrumbFromNodePath(nodePath);
      breadcrumb = result.items;
      targetNode = result.targetNode;
    }

    const activeTarget =
      targetDom ||
      targetNode ||
      breadcrumb[breadcrumb.length - 1]?.element ||
      null;
    const element =
      (breadcrumb[breadcrumb.length - 1] as SourceInfo | undefined) ||
      (activeTarget ? this.getSourceInfo(activeTarget) : null);
    if (!element) {
      return null;
    }

    const id = this.buildSelectionId(element, breadcrumb);
    const breadcrumbIndex = Math.max(0, breadcrumb.length - 1);
    const componentChainIndex = 0;
    const componentBreadcrumbsByChain: Record<number, BreadcrumbNode[]> =
      componentChain.length > 0 ? { [componentChainIndex]: breadcrumb } : {};
    const componentBreadcrumbIndexByChain: Record<number, number> =
      componentChain.length > 0
        ? { [componentChainIndex]: breadcrumbIndex }
        : {};

    return {
      id,
      targetNode: activeTarget,
      anchorNode: breadcrumb[breadcrumb.length - 1]?.element || activeTarget,
      element: {
        name: element.name,
        path: element.path,
        line: element.line,
        column: element.column,
      },
      breadcrumb,
      breadcrumbIndex,
      componentChain,
      componentChainIndex,
      componentBreadcrumbsByChain,
      componentBreadcrumbIndexByChain,
      createdAt: Date.now(),
    };
  };

  private applySelection = async (
    selection: SelectionContext,
    options?: { renderCover?: boolean }
  ) => {
    this.activeSelectionId = selection.id;
    this.targetNode = selection.targetNode;
    this.anchorNode = selection.anchorNode;
    this.element = { ...selection.element };
    this.breadcrumb = [...selection.breadcrumb];
    this.breadcrumbIndex = selection.breadcrumbIndex;
    this.componentChain = [...selection.componentChain];
    this.componentChainIndex = selection.componentChainIndex;
    this.componentBreadcrumbsByChain = {
      ...selection.componentBreadcrumbsByChain,
    };
    this.componentBreadcrumbIndexByChain = {
      ...selection.componentBreadcrumbIndexByChain,
    };
    if (options?.renderCover === false) {
      return;
    }
    await this.updateComplete;
    const activeTarget =
      selection.targetNode ||
      selection.breadcrumb[selection.breadcrumbIndex]?.element ||
      selection.breadcrumb[selection.breadcrumb.length - 1]?.element ||
      null;
    if (activeTarget) {
      await this.renderCover(activeTarget, selection.anchorNode || activeTarget);
    }
    this.scrollActiveBreadcrumbIntoView();
  };

  private persistActiveSelectionState = () => {
    const activeSelection = this.getActiveSelection();
    if (!activeSelection) return;
    const nextSelection: SelectionContext = {
      ...activeSelection,
      targetNode: this.targetNode,
      anchorNode: this.anchorNode,
      element: { ...this.element },
      breadcrumb: [...this.breadcrumb],
      breadcrumbIndex: this.breadcrumbIndex,
      componentChain: [...this.componentChain],
      componentChainIndex: this.componentChainIndex,
      componentBreadcrumbsByChain: {
        ...this.componentBreadcrumbsByChain,
      },
      componentBreadcrumbIndexByChain: {
        ...this.componentBreadcrumbIndexByChain,
      },
    };
    this.selections = this.selections.map((item) =>
      item.id === nextSelection.id ? nextSelection : item
    );
  };

  private upsertSelection = (selection: SelectionContext, append: boolean) => {
    const exists = this.selections.some((item) => item.id === selection.id);
    if (append) {
      this.selections = exists
        ? this.selections.map((item) =>
            item.id === selection.id ? selection : item
          )
        : [...this.selections, selection];
    } else {
      this.selections = [selection];
    }
    this.activeSelectionId = selection.id;
  };

  private removeSelection = async (selectionId: string) => {
    const currentIndex = this.selections.findIndex(
      (item) => item.id === selectionId
    );
    if (currentIndex === -1) return;
    const nextSelections = this.selections.filter(
      (item) => item.id !== selectionId
    );
    this.selections = nextSelections;
    if (nextSelections.length === 0) {
      this.activeSelectionId = '';
      this.closeChat();
      this.removeCover(true);
      return;
    }
    const fallbackIndex = Math.min(currentIndex, nextSelections.length - 1);
    await this.applySelection(nextSelections[fallbackIndex]);
    this.syncSelectedContextToServer();
  };

  private switchSelection = async (selectionId: string) => {
    if (selectionId === this.activeSelectionId) return;
    this.persistActiveSelectionState();
    const selection =
      this.selections.find((item) => item.id === selectionId) || null;
    if (!selection) return;
    await this.applySelection(selection);
    this.syncSelectedContextToServer();
  };

  private isAppendSelectionEvent = (e: MouseEvent | TouchEvent) => {
    return e instanceof MouseEvent && (e.ctrlKey || e.shiftKey);
  };

  private getTargetNodeFromComposedPath = (nodePath: EventTarget[]) => {
    const nodes = nodePath.filter(
      (n): n is HTMLElement => n instanceof HTMLElement
    );
    const validNodeList = this.getValidNodeList(nodes);
    return this.pickTargetNode(validNodeList);
  };

  private openChat = async (
    nodePath: EventTarget[],
    dom?: HTMLElement,
    options?: { append?: boolean }
  ) => {
    const append = !!options?.append;
    if (this.chatOpen) {
      this.persistActiveSelectionState();
    }
    this.chatOpen = true;
    this.requirement = '';
    this.resetAgentStream();
    this.agentLoading = false;
    const selection = this.createSelectionFromNodePath(nodePath, dom);
    if (!selection) {
      return;
    }
    this.upsertSelection(selection, append);
    await this.applySelection(selection);
    this.syncSelectedContextToServer();
    if (this.agentUi) {
      this.agentInputRef?.focus?.();
    }
  };

  private closeChat = () => {
    this.clearSelectedContextOnServer();
    this.chatOpen = false;
    this.requirement = '';
    this.agentFiles = [];
    this.agentProviderOpen = false;
    this.agentModeOpen = false;
    this.resetAgentStream();
    this.breadcrumb = [];
    this.breadcrumbIndex = 0;
    this.selections = [];
    this.activeSelectionId = '';
    this.componentChain = [];
    this.componentChainIndex = 0;
    this.componentBreadcrumbsByChain = {};
    this.componentBreadcrumbIndexByChain = {};
    if (this.agentAbortController) {
      this.agentAbortController.abort();
      this.agentAbortController = null;
    }
    this.agentLoading = false;
  };

  getAstroFilePath = (target: HTMLElement): string => {
    if (target.getAttribute?.(AstroFile)) {
      return `${target.getAttribute(AstroFile)}:${target.getAttribute(
        AstroLocation
      )}:${target.tagName.toLowerCase()}`;
    }
    return '';
  };

  getSourceInfo = (target: HTMLElement): SourceInfo | null => {

    let paths =
      target.getAttribute?.(PathName) ||
      (target as CodeInspectorHtmlElement)[PathName] ||
      this.getAstroFilePath(target); // Todo: transform astro inside

    if (!paths) {
      return null;
    }

    const segments = paths.split(':');
    const name = segments[segments.length - 1];
    const column = Number(segments[segments.length - 2]);
    const line = Number(segments[segments.length - 3]);
    const path = segments.slice(0, segments.length - 3).join(':');
    return { name, path, line, column };
  };

  removeCover = (force?: boolean | MouseEvent) => {
    if (force !== true && (this.nodeTree || this.chatOpen)) {
      return;
    }
    this.clearSelectedContextOnServer();
    this.targetNode = null;
    this.anchorNode = null;
    this.show = false;
    this.elementTipStyle = {
      ...this.elementTipStyle,
      visibility: 'hidden',
    };
    this.removeGlobalCursorStyle();
    document.body.style.userSelect = this.preUserSelect;
    this.preUserSelect = '';
  };

  renderLayerPanel = async (
    nodeTree: TreeNode,
    { x, y }: { x: number; y: number }
  ) => {
    this.nodeTree = nodeTree;
    this.showNodeTree = true;
    await this.updateComplete;
    const floating = this.nodeTreeRef;
    if (!floating) return;

    const referenceRect = {
      x,
      y,
      top: y,
      left: x,
      right: x,
      bottom: y,
      width: 0,
      height: 0,
    };
    const reference: VirtualElement = {
      getBoundingClientRect: () => referenceRect,
    };
    let maxHeight = '';

    const { x: fx, y: fy } = await computePosition(reference, floating, {
      strategy: 'fixed',
      placement: 'right-start',
      middleware: [
        offset(8),
        flip({
          padding: 8,
          fallbackPlacements: ['left-start', 'right-end', 'left-end'],
        }),
        shift({
          padding: 8,
        }),
        size({
          padding: 8,
          apply({ availableHeight }) {
            maxHeight = `${Math.max(120, Math.floor(availableHeight))}px`;
          },
        }),
      ],
    });

    this.nodeTreePosition = {
      left: `${Math.round(fx)}px`,
      top: `${Math.round(fy)}px`,
      right: 'auto',
      bottom: 'auto',
      transform: 'none',
      maxHeight,
    };
  };

  removeLayerPanel = () => {
    this.showNodeTree = false;
    this.nodeTree = null;
    this.activeNode = {};
  };

  addGlobalCursorStyle = () => {
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.setAttribute('id', styleId);
      style.innerText = `body * {
        cursor: pointer !important;
      }`;
      document.body.appendChild(style);
    }
  };

  removeGlobalCursorStyle = () => {
    const style = document.getElementById(styleId);
    if (style) {
      style.remove();
    }
  };

  sendXHR = () => {
    const file = encodeURIComponent(this.element.path);
    const url = `http://${this.ip}:${this.port}/?file=${file}&line=${this.element.line}&column=${this.element.column}`;
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.send();
    xhr.addEventListener('error', () => {
      this.sendType = 'img';
      this.sendImg();
    });
  };

  // 通过img方式发送请求，防止类似企业微信侧边栏等内置浏览器拦截逻辑
  sendImg = () => {
    const file = encodeURIComponent(this.element.path);
    const url = `http://${this.ip}:${this.port}/?file=${file}&line=${this.element.line}&column=${this.element.column}`;
    const img = document.createElement('img');
    img.src = url;
  };

  buildTargetUrl = () => {
    let targetUrl = this.target;

    const { path, line, column } = this.element;
    const replacementMap: Record<string, string | number> = {
      '{file}': path,
      '{line}': line,
      '{column}': column,
    };
    for (let replacement in replacementMap) {
      targetUrl = targetUrl.replace(
        new RegExp(replacement, 'g'),
        String(replacementMap[replacement])
      );
    }

    return targetUrl;
  };

  // 触发功能的处理
  trackCode = () => {
    if (this.internalLocate) {
      if (this.sendType === 'xhr') {
        this.sendXHR();
      } else {
        this.sendImg();
      }
    }
    if (this.internalCopy) {
      const path = formatOpenPath(
        this.element.path,
        String(this.element.line),
        String(this.element.column),
        this.copy
      );
      this.copyToClipboard(path[0]);
    }
    if (this.internalTarget) {
      window.open(this.buildTargetUrl(), '_blank');
    }
    // 触发自定义事件
    window.dispatchEvent(
      new CustomEvent('code-inspector:trackCode', {
        detail: this.element,
      })
    );
  };

  private syncSelectedContextToServer = () => {
    if (!this.chatOpen || !this.show || !this.element.path) return;
    this.persistActiveSelectionState();
    const activeSelection =
      this.getActiveSelection() ||
      this.createSelectionFromNodePath([], this.targetNode || undefined);
    if (!activeSelection) return;
    const activePayload = this.buildSelectedContextPayload(activeSelection, 0);
    const selections = this.buildAllSelectedContextPayloads();
    const activeSelectionId = this.activeSelectionId || activePayload.id;
    const contextPrompt = this.buildCompositeContextPrompt(
      selections,
      activeSelectionId
    );
    const syncKey = JSON.stringify({
      activeSelectionId,
      selections: selections.map((item) => ({
        id: item.id,
        filePath: item.filePath,
        line: item.line,
        column: item.column,
        domPathLength: item.domPath.length,
      })),
    });
    if (syncKey === this.lastSelectedContextSyncKey) return;
    this.lastSelectedContextSyncKey = syncKey;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `http://${this.ip}:${this.port}/context/selected`, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(
      JSON.stringify({
        filePath: activePayload.filePath,
        line: activePayload.line,
        column: activePayload.column,
        elementName: activePayload.elementName,
        dom: activePayload.dom,
        domPath: activePayload.domPath,
        contextPrompt,
        activeContextPrompt: activePayload.contextPrompt,
        id: activePayload.id,
        selections,
        activeSelectionId,
      })
    );
    xhr.addEventListener('error', () => {
      // ignore sync error, do not block inspect workflow
    });
  };

  private clearSelectedContextOnServer = () => {
    this.lastSelectedContextSyncKey = '';
    const xhr = new XMLHttpRequest();
    xhr.open('DELETE', `http://${this.ip}:${this.port}/context/selected`, true);
    xhr.send();
    xhr.addEventListener('error', () => {
      // ignore clear error, do not block inspect workflow
    });
  };

  private buildSelectedContextPayload = (
    selection: SelectionContext,
    order: number
  ): SelectedContextPayload => {
    const { contextPrompt, dom, domPath } =
      this.buildClientContextPrompt(selection);
    return {
      id: selection.id,
      filePath: selection.element.path,
      line: selection.element.line,
      column: selection.element.column,
      elementName: selection.element.name,
      dom,
      domPath,
      contextPrompt,
      order,
    };
  };

  private buildAllSelectedContextPayloads = (): SelectedContextPayload[] => {
    if (!this.selections.length) return [];
    return this.selections.map((item, index) =>
      this.buildSelectedContextPayload(item, index)
    );
  };

  private buildCompositeContextPrompt = (
    selections: SelectedContextPayload[],
    activeSelectionId: string
  ) => {
    if (!selections.length) return '';
    const lines = selections.map((item, index) => {
      const isActive = item.id === activeSelectionId;
      const domLabel = [item.dom.tagName, item.dom.firstClass]
        .filter(Boolean)
        .join('.');
      const pathText = item.domPath
        .map((node) => `${node.label}(${node.path}:${node.line}:${node.column})`)
        .join(' > ');
      return [
        `${isActive ? '[ACTIVE] ' : ''}Selection #${index + 1}`,
        `source: ${item.filePath}:${item.line}:${item.column}`,
        `element: <${item.elementName} ...>`,
        `dom: ${domLabel || '(unknown)'}, className: ${item.dom.className || '(none)'}`,
        `path: ${pathText || '(empty)'}`,
      ].join('\n');
    });
    return [
      `There are ${selections.length} selected DOM contexts. Consider all of them together.`,
      ...lines,
    ].join('\n\n');
  };

  private handleModeShortcut = (e: KeyboardEvent) => {
    if (!this.isTracking(e)) {
      return;
    }
    const isModeKeyDown =
      e.code?.toLowerCase() === `key${this.modeKey}` ||
      e.key?.toLowerCase() === this.modeKey;
    if (isModeKeyDown) {
      this.toggleSettingsModal();
      e.preventDefault();
      e.stopPropagation();
    }
  };

  showNotification(message: string, type: 'success' | 'error' = 'success') {
    const notification = document.createElement('div');
    notification.className = `code-inspector-notification code-inspector-notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Trigger animation
    requestAnimationFrame(() => {
      notification.classList.add('code-inspector-notification-show');
    });

    // Remove after 2 seconds
    setTimeout(() => {
      notification.classList.remove('code-inspector-notification-show');
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 2000);
  }

  copyToClipboard(text: string) {
    try {
      if (typeof navigator?.clipboard?.writeText === 'function') {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            this.showNotification('✓ Copied to clipboard');
          })
          .catch(() => {
            this.fallbackCopy(text);
          });
      } else {
        this.fallbackCopy(text);
      }
    } catch (error) {
      this.fallbackCopy(text);
    }
  }

  private fallbackCopy(text: string) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (success) {
        this.showNotification('✓ Copied to clipboard');
      } else {
        this.showNotification('✗ Copy failed', 'error');
      }
    } catch (error) {
      this.showNotification('✗ Copy failed', 'error');
    }
  }

  // 移动按钮
  handleDrag = (e: MouseEvent | TouchEvent) => {
    if (e.composedPath().includes(this)) {
      this.hoverSwitch = true;
    } else {
      this.hoverSwitch = false;
    }
    // 判断是否在拖拽按钮
    if (this.dragging) {
      this.moved = true;
      const ref =
        this.draggingTarget === 'switch'
          ? this.inspectorSwitchRef
          : this.nodeTreeRef;
      ref.style.left =
        this.mousePosition.baseX +
        (this.getMousePosition(e).x - this.mousePosition.moveX) +
        'px';
      ref.style.top =
        this.mousePosition.baseY +
        (this.getMousePosition(e).y - this.mousePosition.moveY) +
        'px';
      if (this.draggingTarget) {
        this.nodeTreePosition.left = ref.style.left;
        this.nodeTreePosition.top = ref.style.top;
      }
      return;
    }
  };

  getValidNodeList = (nodePath: HTMLElement[]) => {
    const validNodeList: { node: HTMLElement; isAstro: boolean }[] = [];
    for (const node of nodePath) {
      if (node.hasAttribute && node.hasAttribute(AstroFile)) {
        validNodeList.push({ node, isAstro: true });
      } else if ((node.hasAttribute && node.hasAttribute(PathName)) || node[PathName]) {
        validNodeList.push({ node, isAstro: false });
      }
    }
    return validNodeList;
  };

  isSamePositionNode = (node1: HTMLElement, node2: HTMLElement) => {
    const node1Rect = node1.getBoundingClientRect();
    const node2Rect = node2.getBoundingClientRect();
    return (
      node1Rect.top === node2Rect.top &&
      node1Rect.left === node2Rect.left &&
      node1Rect.right === node2Rect.right &&
      node1Rect.bottom === node2Rect.bottom
    );
  };

  // 鼠标移动渲染遮罩层位置
  handleMouseMove = async (e: MouseEvent | TouchEvent) => {
    if (this.chatOpen) {
      return;
    }
    if (
      ((this.isTracking(e) && !this.dragging) || this.open) &&
      !this.hoverSwitch
    ) {
      const nodePath = this.getHoverNodePath(e);
      const { items, targetNode } = this.buildBreadcrumbFromNodePath(
        nodePath as EventTarget[]
      );
      const anchorNode =
        items[items.length - 1]?.element || targetNode || nodePath[0] || null;
      if (targetNode) {
        this.renderCover(targetNode, anchorNode || targetNode);
      } else {
        this.removeCover();
      }
    } else {
      this.removeCover();
    }
  };

  handleWheel = (e: WheelEvent) => {
    if (!this.targetNode) {
      return;
    }
    const nodePath = e.composedPath() as EventTarget[];
    const inElementInfo = this.elementInfoRef
      ? nodePath.includes(this.elementInfoRef)
      : false;
    const inAgentLog = this.agentLogRef ? nodePath.includes(this.agentLogRef) : false;
    const inNodeTree = this.nodeTreeRef ? nodePath.includes(this.nodeTreeRef) : false;
    const scrollingInsidePanel =
      (this.chatOpen && (inElementInfo || inAgentLog)) || inNodeTree;
    if (scrollingInsidePanel) {
      return;
    }
    if (this.chatOpen || (!this.isTracking(e) && !this.open)) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();

    if (this.wheelThrottling) {
      return;
    }

    this.wheelThrottling = true;

    const validNodeList = this.getValidNodeList(nodePath as HTMLElement[]);
    let targetNodeIndex = validNodeList.findIndex(({ node }) => node === this.targetNode);
    if (targetNodeIndex === -1) {
      this.wheelThrottling = false;
      return;
    }
    const wheelDelta = e.deltaX || e.deltaY;
    if (wheelDelta > 0) {
      targetNodeIndex--;
    } else if (wheelDelta < 0) {
      targetNodeIndex++;
    }
    if (targetNodeIndex >= 0 && targetNodeIndex < validNodeList.length) {
      this.renderCover(validNodeList[targetNodeIndex].node);
    }

    // mac 触摸板太灵敏，添加节流
    setTimeout(() => {
      this.wheelThrottling = false;
    }, 200);
  };

  // 鼠标点击唤醒遮罩层
  handleMouseClick = (e: MouseEvent | TouchEvent) => {
    const composedPath = e.composedPath() as EventTarget[];
    const clickedInInfo = composedPath.includes(this.elementInfoRef);
    const clickedInNodeTree = composedPath.includes(this.nodeTreeRef);
    const clickedInSwitch = composedPath.includes(this.inspectorSwitchRef);
    const appendSelection = this.isAppendSelectionEvent(e);
    const clickedTargetNode = this.getTargetNodeFromComposedPath(composedPath);
    const clickedDom =
      clickedTargetNode || ((e.target as HTMLElement | null) ?? undefined);

    if (this.chatOpen) {
      if (
        appendSelection &&
        !clickedInInfo &&
        !clickedInNodeTree &&
        !clickedInSwitch &&
        this.show
      ) {
        e.stopPropagation();
        e.preventDefault();
        void this.openChat(
          composedPath,
          clickedDom,
          { append: true }
        );
        return;
      }
      if (!clickedInInfo && !clickedInNodeTree && !clickedInSwitch) {
        this.closeChat();
        this.removeCover(true);
      }
      return;
    }

    if (e instanceof MouseEvent && e.metaKey) {
      if ((this.isTracking(e) || this.open) && this.show) {
        e.stopPropagation();
        e.preventDefault();
        this.trackCode();
      }
      return;
    }

    if (this.isTracking(e) || this.open) {
      if (this.show) {
        // 阻止冒泡
        e.stopPropagation();
        // 阻止默认事件
        e.preventDefault();
        void this.openChat(
          composedPath,
          clickedDom,
          { append: appendSelection }
        );
        if (this.autoToggle) {
          this.open = false;
        }
      }
    }
    if (!clickedInNodeTree) {
      this.removeLayerPanel();
    }
  };

  handleContextMenu = (e: MouseEvent) => {
    if (
      ((this.isTracking(e) && !this.dragging) || this.open) &&
      !this.hoverSwitch
    ) {
      e.preventDefault();
      const nodePath = e.composedPath() as HTMLElement[];
      const nodeTree = this.generateNodeTree(nodePath);

      this.renderLayerPanel(nodeTree, { x: e.clientX, y: e.clientY });
    }
  };

  generateNodeTree = (nodePath: HTMLElement[]): TreeNode => {
    const validNodeList = this.getValidNodeList(nodePath);
    const targetNode = this.pickTargetNode(validNodeList);
    const componentInfo = targetNode
      ? getComponentFiberInfoList(targetNode)[0] || null
      : null;
    let items: BreadcrumbNode[] = [];
    if (componentInfo && targetNode) {
      const elementPath = this.getSourceInfo(targetNode)?.path;
      items = buildReactFiberBreadcrumb(
        nodePath,
        targetNode,
        componentInfo,
        {
          getSourceInfo: (node) => this.getSourceInfo(node),
          getValidNodeList: (nodes) => this.getValidNodeList(nodes),
          elementPath,
          targetNode,
        }
      );
    } else {
      const result = this.buildBreadcrumbFromNodePath(nodePath);
      items = result.items;
    }

    const root = this.buildNodeTreeFromBreadcrumb(items);
    if (root) {
      return root;
    }

    let fallbackRoot: TreeNode | null = null;
    let depth = 1;
    let preNode: TreeNode | null = null;
    for (const element of [...nodePath].reverse()) {
      const sourceInfo = this.getSourceInfo(element);
      if (!sourceInfo) continue;

      const node: TreeNode = {
        ...sourceInfo,
        children: [],
        depth: depth++,
        element,
      };

      if (preNode) {
        preNode.children.push(node);
      } else {
        fallbackRoot = node;
      }
      preNode = node;
    }

    return fallbackRoot!;
  };

  // disabled 的元素及其子元素无法触发 click 事件
  handlePointerDown = (e: PointerEvent) => {
    let disabled = false;
    let element = e.target as HTMLInputElement;
    while (element) {
      if (element.disabled) {
        disabled = true;
        break;
      }
      element = element.parentElement as HTMLInputElement;
    }
    if (!disabled) {
      return;
    }
    if (this.isTracking(e) || this.open) {
      if (this.show) {
        // 阻止冒泡
        e.stopPropagation();
        // 阻止默认事件
        e.preventDefault();
        // 清除遮罩层
        this.removeCover();
        if (this.autoToggle) {
          this.open = false;
        }
      }
    }
  };

  // 监听键盘抬起，清除遮罩层
  handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.chatOpen) {
      this.closeChat();
      this.removeCover(true);
      return;
    }
    if (!this.isTracking(e) && !this.open) {
      this.removeCover();
    }
  };

  private jumpBreadcrumb = async (index: number) => {
    if (index < 0 || index >= this.breadcrumb.length) return;
    this.breadcrumbIndex = index;
    if (this.componentChain.length > 0) {
      this.componentBreadcrumbIndexByChain[this.componentChainIndex] = index;
      this.componentBreadcrumbsByChain[this.componentChainIndex] =
        this.breadcrumb;
    }
    const node = this.breadcrumb[index];
    this.forceOutlineNextCover = true;
    await this.renderCover(node.element);
    this.persistActiveSelectionState();
    this.scrollActiveBreadcrumbIntoView();
    this.syncSelectedContextToServer();
  };

  private handleBreadcrumbClick = (index: number, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.metaKey) {
      if (index < 0 || index >= this.breadcrumb.length) return;
      const node = this.breadcrumb[index];
      this.element = node;
      this.trackCode();
      return;
    }
    void this.jumpBreadcrumb(index);
  };

  private gotoParentBreadcrumb = () => {
    if (this.breadcrumbIndex <= 0) return;
    void this.jumpBreadcrumb(this.breadcrumbIndex - 1);
  };

  private gotoChildBreadcrumb = () => {
    if (this.breadcrumbIndex >= this.breadcrumb.length - 1) return;
    void this.jumpBreadcrumb(this.breadcrumbIndex + 1);
  };

  private copyActiveBreadcrumbPath = () => {
    const activeSource =
      this.breadcrumb[this.breadcrumbIndex] || this.element;
    if (!activeSource?.path) return;
    this.copyToClipboard(activeSource.path);
  };

  private gotoPrevComponentBreadcrumb = () => {
    if (this.componentChainIndex >= this.componentChain.length - 1) return;
    this.componentBreadcrumbIndexByChain[this.componentChainIndex] =
      this.breadcrumbIndex;
    this.componentBreadcrumbsByChain[this.componentChainIndex] =
      this.breadcrumb;
    this.componentChainIndex += 1;
    void this.rebuildBreadcrumbForComponent();
  };

  private gotoNextComponentBreadcrumb = () => {
    if (this.componentChainIndex <= 0) return;
    this.componentBreadcrumbIndexByChain[this.componentChainIndex] =
      this.breadcrumbIndex;
    this.componentBreadcrumbsByChain[this.componentChainIndex] =
      this.breadcrumb;
    this.componentChainIndex -= 1;
    void this.rebuildBreadcrumbForComponent();
  };

  private rebuildBreadcrumbForComponent = async () => {
    const componentInfo = this.componentChain[this.componentChainIndex];
    const targetDom =
      this.targetNode ||
      this.breadcrumb[this.breadcrumb.length - 1]?.element ||
      null;
    if (!componentInfo || !targetDom) return;

    const cachedBreadcrumb =
      this.componentBreadcrumbsByChain[this.componentChainIndex];
    if (cachedBreadcrumb && cachedBreadcrumb.length > 0) {
      this.breadcrumb = cachedBreadcrumb;
    } else {
      this.breadcrumb = buildReactFiberBreadcrumb([], targetDom, componentInfo, {
        getSourceInfo: (node) => this.getSourceInfo(node),
        getValidNodeList: (nodes) => this.getValidNodeList(nodes),
        elementPath: this.getSourceInfo(targetDom)?.path,
        targetNode: this.targetNode,
      });
      this.componentBreadcrumbsByChain[this.componentChainIndex] =
        this.breadcrumb;
    }
    const cachedIndex =
      this.componentBreadcrumbIndexByChain[this.componentChainIndex];
    if (typeof cachedIndex === 'number') {
      this.breadcrumbIndex = Math.min(
        Math.max(cachedIndex, 0),
        Math.max(0, this.breadcrumb.length - 1)
      );
    } else {
      this.breadcrumbIndex = Math.max(0, this.breadcrumb.length - 1);
    }
    await this.updateComplete;
    this.persistActiveSelectionState();
    this.scrollActiveBreadcrumbIntoView();
    this.syncSelectedContextToServer();
  };

  private cancelAgent = () => {
    if (this.agentAbortController) {
      this.agentAbortController.abort();
      this.agentAbortController = null;
    }
    this.agentLoading = false;
  };

  private nextAgentEventId = () => {
    this.agentEventId += 1;
    return String(this.agentEventId);
  };

  private resetAgentStream = () => {
    this.agentEvents = [];
    this.agentError = '';
    this.agentEventId = 0;
    this.agentToolCallDrafts = {};
  };

  private scrollAgentLogToBottom = () => {
    const log = this.agentLogRef;
    if (!log) return;
    const nearBottom =
      log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    if (!nearBottom) return;
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  };

  private truncateText = (text: string, maxLength = 2000) => {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
  };

  private formatAgentValue = (value: unknown, maxLength = 2000) => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') {
      return this.truncateText(value, maxLength);
    }
    try {
      return this.truncateText(JSON.stringify(value, null, 2), maxLength);
    } catch {
      return this.truncateText(String(value), maxLength);
    }
  };

  private formatBytes = (value?: number) => {
    if (!value || !Number.isFinite(value)) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let idx = 0;
    while (size >= 1024 && idx < units.length - 1) {
      size /= 1024;
      idx += 1;
    }
    const rounded = size >= 10 || idx === 0 ? Math.round(size) : Math.round(size * 10) / 10;
    return `${rounded} ${units[idx]}`;
  };

  private formatAgentFileSummary = (file: any): AgentFileSummary => {
    const mediaType = String(file?.mediaType || 'application/octet-stream');
    let size: number | undefined;
    if (file?.uint8Array?.length) {
      size = file.uint8Array.length;
    } else if (typeof file?.base64 === 'string') {
      size = Math.floor((file.base64.length * 3) / 4);
    }
    return {
      mediaType,
      size,
      hasContent: Boolean(file?.uint8Array?.length || file?.base64),
    };
  };

  private tryParseJsonString = (value: unknown) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (!/^[\[{]/.test(trimmed)) return value;
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  };

  private getAgentHostLabel = (url?: string) => {
    if (!url) return '';
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  };

  private formatPathLabel = (value?: string) => {
    if (!value) return '';
    const safe = value.replace(/\\/g, '/');
    const parts = safe.split('/').filter(Boolean);
    if (parts.length <= 2) return parts.join('/');
    return parts.slice(-2).join('/');
  };

  private describeToolCall = (raw: unknown): AgentActivityItem => {
    const payload = this.tryParseJsonString(raw) as any;
    const toolName = payload?.toolName || payload?.name || '';
    const args = payload?.args || payload?.input?.args || payload?.input || {};
    const parsedCmd = Array.isArray(args?.parsed_cmd) ? args.parsed_cmd : [];
    const cmd = parsedCmd[0] || {};
    const path = cmd?.path || cmd?.name || args?.path || args?.file || '';
    const shortPath = this.formatPathLabel(path);
    if (cmd?.type === 'read' || /^read /i.test(toolName)) {
      return {
        id: payload?.toolCallId || '',
        kind: 'read',
        label: `读取 ${shortPath || toolName.replace(/^read /i, '')}`.trim(),
        filePath: path,
        status: 'pending',
      };
    }
    if (cmd?.type === 'list_files' || /^list /i.test(toolName)) {
      return {
        id: payload?.toolCallId || '',
        kind: 'list',
        label: shortPath
          ? `列出 ${shortPath} 下的文件`
          : `列出文件`,
        filePath: path,
        status: 'pending',
      };
    }
    if (cmd?.type === 'search' || /^search /i.test(toolName)) {
      const query = cmd?.query || args?.query || '';
      const target = shortPath ? `于 ${shortPath}` : '';
      return {
        id: payload?.toolCallId || '',
        kind: 'search',
        label: query ? `搜索 "${query}" ${target}` : `搜索内容 ${target}`,
        filePath: path,
        status: 'pending',
      };
    }
    if (
      cmd?.type === 'edit' ||
      cmd?.type === 'update' ||
      /^edit /i.test(toolName)
    ) {
      return {
        id: payload?.toolCallId || '',
        kind: 'edit',
        label: `编辑 ${shortPath || toolName.replace(/^edit /i, '')}`.trim(),
        filePath: path,
        status: 'pending',
      };
    }
    return {
      id: payload?.toolCallId || '',
      kind: 'tool',
      label: toolName ? `调用 ${toolName}` : '调用工具',
      status: 'pending',
    };
  };

  private countDiffLines = (diff?: string) => {
    if (!diff) return null;
    let added = 0;
    let removed = 0;
    diff.split('\n').forEach((line) => {
      if (line.startsWith('+++') || line.startsWith('---')) return;
      if (line.startsWith('+')) added += 1;
      if (line.startsWith('-')) removed += 1;
    });
    return { added, removed };
  };

  private describeToolResult = (raw: unknown) => {
    const payload = this.tryParseJsonString(raw) as any;
    if (payload?.changes && typeof payload.changes === 'object') {
      const filePath = Object.keys(payload.changes)[0];
      const change = payload.changes[filePath] || {};
      const diff = this.countDiffLines(change?.unified_diff);
      const detail =
        diff && (diff.added || diff.removed)
          ? `+${diff.added} -${diff.removed}`
          : '';
      return {
        kind: 'edit' as AgentActivityKind,
        filePath,
        detail,
      };
    }
    const text =
      payload?.stdout ||
      payload?.aggregated_output ||
      payload?.formatted_output ||
      payload?.output ||
      '';
    if (typeof text === 'string' && text.trim()) {
      const lines = text.trim().split(/\r?\n/).length;
      return {
        detail: `输出 ${lines} 行`,
      };
    }
    return {};
  };

  private getToolCallMeta = (raw: unknown) => {
    const payload = this.tryParseJsonString(raw) as any;
    const item = this.describeToolCall(raw);
    const args = payload?.args || payload?.input?.args || payload?.input || {};
    const parsedCmd = Array.isArray(args?.parsed_cmd) ? args.parsed_cmd : [];
    const cmd = parsedCmd[0] || {};
    const command = Array.isArray(args?.command)
      ? args.command.join(' ')
      : args?.command || '';
    const cwd = args?.cwd || '';
    const query = cmd?.query || args?.query || '';
    const path = cmd?.path || cmd?.name || args?.path || args?.file || '';
    return {
      item,
      toolName: payload?.toolName || payload?.name || '',
      command,
      cwd,
      query,
      path,
    };
  };

  private getToolResultMeta = (raw: unknown) => {
    const payload = this.tryParseJsonString(raw) as any;
    const info = this.describeToolResult(raw);
    const stderr = payload?.stderr || payload?.error || '';
    const exitCode = payload?.exit_code;
    const status =
      exitCode === undefined || exitCode === 0 ? 'success' : 'error';
    const detail = info.detail;
    return { info, stderr, status, detail };
  };

  private extractOutputText = (payload: any) => {
    if (!payload) return '';
    const text =
      payload?.stdout ||
      payload?.aggregated_output ||
      payload?.formatted_output ||
      payload?.output ||
      '';
    return typeof text === 'string' ? text : '';
  };

  private extractDiffPreview = (diff: string, maxLines = 8) => {
    if (!diff) return [];
    const lines = diff
      .split('\n')
      .filter(
        (line) =>
          line.startsWith('@@') ||
          (line.startsWith('+') && !line.startsWith('+++')) ||
          (line.startsWith('-') && !line.startsWith('---'))
      );
    return lines.slice(0, maxLines);
  };

  private extractOutputPreview = (text: string, maxLines = 8) => {
    const ignore = ['Operation not permitted', 'shellenv.sh'];
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0)
      .filter((line) => !ignore.some((token) => line.includes(token)));
    if (lines.length === 0) return { lines: [] as string[] };
    const shortLines = lines.filter((line) => line.length <= 40);
    if (shortLines.length >= Math.min(lines.length, 6)) {
      return {
        lines: [],
        chips: lines.slice(0, maxLines),
      };
    }
    return { lines: lines.slice(0, maxLines) };
  };

  private buildToolResultPreview = (
    callMeta: ReturnType<typeof this.getToolCallMeta> | null,
    raw: unknown
  ) => {
    const payload = this.tryParseJsonString(raw) as any;
    if (!payload) return null;
    if (payload?.changes && typeof payload.changes === 'object') {
      const filePath = Object.keys(payload.changes)[0];
      const change = payload.changes[filePath] || {};
      const diffLines = this.extractDiffPreview(change?.unified_diff || '');
      return {
        title: filePath
          ? `已编辑 ${this.formatPathLabel(filePath)}`
          : '已编辑文件',
        lines: diffLines,
      };
    }
    const outputText = this.extractOutputText(payload);
    if (outputText) {
      const preview = this.extractOutputPreview(outputText);
      const labelMap: Record<string, string> = {
        read: '读取结果',
        list: '文件列表',
        search: '搜索结果',
      };
      const title = labelMap[callMeta?.item?.kind || ''] || '输出预览';
      return {
        title,
        lines: preview.lines,
        chips: preview.chips,
      };
    }
    return null;
  };

  private collectChangedFiles = () => {
    const items: Array<{ path: string; label: string; detail?: string }> = [];
    const seen = new Set<string>();
    for (const event of this.agentEvents) {
      if (event.type !== 'tool-result') continue;
      const payload = this.tryParseJsonString(
        event.outputRaw ?? event.output
      ) as any;
      if (!payload?.changes || typeof payload.changes !== 'object') continue;
      for (const filePath of Object.keys(payload.changes)) {
        if (seen.has(filePath)) continue;
        const change = payload.changes[filePath] || {};
        const diff = this.countDiffLines(change?.unified_diff);
        const detail =
          diff && (diff.added || diff.removed)
            ? `+${diff.added} -${diff.removed}`
            : '';
        items.push({
          path: filePath,
          label: this.formatPathLabel(filePath) || filePath,
          detail,
        });
        seen.add(filePath);
      }
    }
    return items;
  };

  private splitParagraphs = (text: string) => {
    return text
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
  };

  private buildTimelineBlocks = (): AgentTimelineBlock[] => {
    const blocks: AgentTimelineBlock[] = [];
    const allowed: Array<AgentStreamEventType> = [
      'text',
      'reasoning',
      'tool-call',
      'tool-result',
      'source',
      'file',
      'error',
    ];
    const toolBlocks = new Map<string, AgentTimelineBlock>();
    for (const event of this.agentEvents) {
      if (!allowed.includes(event.type)) continue;
      if (event.type === 'tool-call' || event.type === 'tool-result') {
        const id = event.toolCallId || event.id;
        const existing = toolBlocks.get(id);
        if (existing) {
          existing.events.push(event);
          if (event.type === 'tool-call') existing.call = event;
          if (event.type === 'tool-result') existing.result = event;
        } else {
          const block: AgentTimelineBlock = {
            kind: 'tool',
            events: [event],
            call: event.type === 'tool-call' ? event : undefined,
            result: event.type === 'tool-result' ? event : undefined,
          };
          blocks.push(block);
          toolBlocks.set(id, block);
        }
        continue;
      }
      const kind = event.type as AgentTimelineBlock['kind'];
      const last = blocks[blocks.length - 1];
      if (last && last.kind === kind) {
        if (kind === 'text' || kind === 'reasoning') {
          last.text = `${last.text || ''}${event.text || ''}`;
        } else {
          last.events.push(event);
        }
      } else {
        blocks.push({
          kind,
          text:
            kind === 'text' || kind === 'reasoning' ? event.text || '' : '',
          events: [event],
        });
      }
    }
    return blocks;
  };

  private addAgentEvent = (event: AgentStreamEvent) => {
    this.agentEvents = [...this.agentEvents, event];
    this.scrollAgentLogToBottom();
  };

  private updateAgentEvent = (index: number, updates: Partial<AgentStreamEvent>) => {
    const next = this.agentEvents.slice();
    const current = next[index];
    if (!current) return;
    next[index] = { ...current, ...updates };
    this.agentEvents = next;
    this.scrollAgentLogToBottom();
  };

  private appendAgentText = (type: 'text' | 'reasoning', text: string) => {
    if (!text) return;
    const lastIndex = this.agentEvents.length - 1;
    const last = this.agentEvents[lastIndex];
    if (last && last.type === type) {
      this.updateAgentEvent(lastIndex, {
        text: `${last.text || ''}${text}`,
      });
      return;
    }
    this.addAgentEvent({ id: this.nextAgentEventId(), type, text });
  };

  private replaceAgentPlainText = (text: string) => {
    if (this.agentEvents.length === 1 && this.agentEvents[0].type === 'text') {
      this.updateAgentEvent(0, { text });
      return;
    }
    this.agentEvents = [{ id: this.nextAgentEventId(), type: 'text', text }];
    this.scrollAgentLogToBottom();
  };

  private startToolCall = (toolCallId?: string, toolName?: string) => {
    const event: AgentStreamEvent = {
      id: this.nextAgentEventId(),
      type: 'tool-call',
      toolCallId,
      toolName,
      input: '',
    };
    const index = this.agentEvents.length;
    this.agentEvents = [...this.agentEvents, event];
    if (toolCallId) {
      this.agentToolCallDrafts[toolCallId] = {
        index,
        argsText: '',
        toolName,
      };
    }
    this.scrollAgentLogToBottom();
  };

  private appendToolCallDelta = (
    toolCallId?: string,
    toolName?: string,
    delta?: string
  ) => {
    if (!delta) return;
    if (!toolCallId) {
      this.addAgentEvent({
        id: this.nextAgentEventId(),
        type: 'tool-call',
        toolName,
        input: delta,
      });
      return;
    }
    let draft = this.agentToolCallDrafts[toolCallId];
    if (!draft) {
      this.startToolCall(toolCallId, toolName);
      draft = this.agentToolCallDrafts[toolCallId];
    }
    if (!draft) return;
    draft.argsText += delta;
    this.updateAgentEvent(draft.index, {
      toolCallId,
      toolName: toolName || draft.toolName,
      input: draft.argsText,
    });
  };

  private finalizeToolCall = (
    toolCallId?: string,
    toolName?: string,
    input?: unknown
  ) => {
    const inputText = this.formatAgentValue(input, 4000);
    if (toolCallId && this.agentToolCallDrafts[toolCallId]) {
      const { index } = this.agentToolCallDrafts[toolCallId];
      this.updateAgentEvent(index, {
        toolCallId,
        toolName,
        input: inputText || this.agentEvents[index]?.input,
        inputRaw: input,
      });
      delete this.agentToolCallDrafts[toolCallId];
      return;
    }
    this.addAgentEvent({
      id: this.nextAgentEventId(),
      type: 'tool-call',
      toolCallId,
      toolName,
      input: inputText,
      inputRaw: input,
    });
  };

  private addToolResult = (
    toolCallId?: string,
    toolName?: string,
    input?: unknown,
    output?: unknown
  ) => {
    const inputText = this.formatAgentValue(input, 2000);
    const outputText = this.formatAgentValue(output, 4000);
    this.addAgentEvent({
      id: this.nextAgentEventId(),
      type: 'tool-result',
      toolCallId,
      toolName,
      input: inputText,
      output: outputText,
      inputRaw: input,
      outputRaw: output,
    });
  };

  private addSourceEvent = (part: any) => {
    this.addAgentEvent({
      id: this.nextAgentEventId(),
      type: 'source',
      source: {
        id: part.id,
        url: part.url,
        title: part.title,
        sourceType: part.sourceType,
      },
    });
  };

  private addFileEvent = (part: any) => {
    const file = part?.file || part;
    this.addAgentEvent({
      id: this.nextAgentEventId(),
      type: 'file',
      file: this.formatAgentFileSummary(file),
    });
  };

  private addErrorEvent = (message: string) => {
    this.addAgentEvent({
      id: this.nextAgentEventId(),
      type: 'error',
      message,
    });
  };

  private consumeAgentPart = (part: any) => {
    if (part === null || part === undefined) return;
    if (typeof part === 'string') {
      this.appendAgentText('text', part);
      return;
    }
    const type = part.type;
    if (!type) {
      if (part.delta) {
        this.appendAgentText('text', String(part.delta));
        return;
      }
      if (part.text) {
        this.appendAgentText('text', String(part.text));
        return;
      }
      this.addAgentEvent({
        id: this.nextAgentEventId(),
        type: 'unknown',
        text: this.formatAgentValue(part),
      });
      return;
    }
    switch (type) {
      case 'text':
        this.appendAgentText('text', String(part.text || ''));
        break;
      case 'reasoning':
        this.appendAgentText('reasoning', String(part.text || ''));
        break;
      case 'text-delta':
        this.appendAgentText(
          'text',
          String(part.text ?? part.delta ?? '')
        );
        break;
      case 'reasoning-delta':
        this.appendAgentText(
          'reasoning',
          String(part.delta ?? part.text ?? '')
        );
        break;
      case 'tool-call-streaming-start':
        this.startToolCall(part.toolCallId, part.toolName);
        break;
      case 'tool-call-delta':
        this.appendToolCallDelta(
          part.toolCallId,
          part.toolName,
          String(part.argsTextDelta ?? part.delta ?? '')
        );
        break;
      case 'tool-call':
        this.finalizeToolCall(
          part.toolCallId,
          part.toolName,
          part.input ?? part.args ?? part.parameters ?? part.arguments
        );
        break;
      case 'tool-result':
        this.addToolResult(
          part.toolCallId,
          part.toolName,
          part.input ?? part.args ?? part.parameters,
          part.output ?? part.result
        );
        break;
      case 'source':
        this.addSourceEvent(part);
        break;
      case 'file':
        this.addFileEvent(part);
        break;
      case 'start-step':
      case 'finish-step':
        // skip noisy metadata events
        break;
      case 'error': {
        const message = String(part.message ?? part.error ?? 'error');
        this.agentError = message;
        this.addErrorEvent(message);
        break;
      }
      default:
        // skip unknown events for readability
        break;
    }
  };

  private syncAgentUiDefaults = () => {
    const providers = this.agentUi?.providers || [];
    const modes = this.agentUi?.modes || [];
    if (!providers.length) {
      this.agentProvider = '';
    } else if (!this.agentProvider) {
      this.agentProvider =
        this.agentUi?.defaultProvider || providers[0].value;
    }
    if (!modes.length) {
      this.agentMode = '';
    } else if (!this.agentMode) {
      this.agentMode = this.agentUi?.defaultMode || modes[0].value;
    }
  };

  private formatAgentFileSize = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  };

  private estimatePayloadSize = (bytes: number) => {
    return Math.ceil(bytes * 1.37);
  };

  private readFileAsDataUrl = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsDataURL(file);
    });
  };

  private readFileAsText = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsText(file);
    });
  };

  private handleAgentAttachClick = () => {
    if (!this.agentUi || this.agentLoading) return;
    this.agentFileInputRef?.click();
  };

  private buildPastedFileName = (type: string, index: number) => {
    const ext = type.split('/')[1] || 'png';
    return `pasted-image-${Date.now()}-${index + 1}.${ext}`;
  };

  private appendAgentFiles = async (files: File[]) => {
    if (!files.length) return;

    const maxFiles = this.agentUi?.maxFiles ?? 6;
    const maxFileSize = this.agentUi?.maxFileSize ?? 2 * 1024 * 1024;
    const maxTotalSize = this.agentUi?.maxTotalSize ?? 8 * 1024 * 1024;
    const currentEstimated = this.agentFiles.reduce(
      (sum, file) => sum + this.estimatePayloadSize(file.size),
      0
    );

    let estimatedTotal = currentEstimated;
    const nextFiles: AgentAttachment[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (this.agentFiles.length + nextFiles.length >= maxFiles) {
        this.showNotification(`最多上传 ${maxFiles} 个附件`, 'error');
        break;
      }
      const fileName =
        file.name || this.buildPastedFileName(file.type || 'image/png', index);
      if (file.size > maxFileSize) {
        this.showNotification(
          `${fileName} 超过大小限制（${this.formatAgentFileSize(
            maxFileSize
          )}）`,
          'error'
        );
        continue;
      }
      const estimatedSize = this.estimatePayloadSize(file.size);
      if (estimatedTotal + estimatedSize > maxTotalSize) {
        this.showNotification(
          `附件总大小超过限制（${this.formatAgentFileSize(
            maxTotalSize
          )}）`,
          'error'
        );
        break;
      }
      estimatedTotal += estimatedSize;

      const isImage = file.type.startsWith('image/');
      const isText =
        file.type.startsWith('text/') ||
        /\.(md|txt|json|yaml|yml|csv|log|ini|conf|ts|tsx|js|jsx|css|scss|less)$/i.test(
          file.name
        );
      try {
        let text: string | undefined;
        let dataUrl: string | undefined;
        if (isText && !isImage) {
          text = await this.readFileAsText(file);
          const maxTextChars = 20000;
          if (text.length > maxTextChars) {
            text = `${text.slice(0, maxTextChars)}…(已截断)`;
          }
        } else {
          dataUrl = await this.readFileAsDataUrl(file);
        }
        nextFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: fileName,
          type: file.type,
          size: file.size,
          isImage,
          dataUrl,
          text,
        });
      } catch (error) {
        this.showNotification(`${fileName} 读取失败`, 'error');
      }
    }

    if (nextFiles.length) {
      this.agentFiles = [...this.agentFiles, ...nextFiles];
    }
  };

  private handleAgentFilesSelected = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    await this.appendAgentFiles(files);
  };

  private handleAgentPaste = async (event: ClipboardEvent) => {
    if (!this.agentUi || this.agentLoading || this.agentUi.enableUpload === false) return;

    const items = Array.from(event.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (!imageFiles.length) return;

    event.preventDefault();
    await this.appendAgentFiles(imageFiles);
  };

  private removeAgentFile = (id: string) => {
    this.agentFiles = this.agentFiles.filter((file) => file.id !== id);
  };

  private buildAgentFilesPayload = () => {
    if (!this.agentFiles.length) return [];
    return this.agentFiles.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      isImage: file.isImage,
      text: file.text,
      dataUrl: file.dataUrl,
    }));
  };

  private getAgentOptionLabel = (
    options: AgentUiOption[] = [],
    value: string
  ) => {
    if (!options.length) return null;
    return options.find((option) => option.value === value) || options[0];
  };

  private toggleAgentMenu = (target: 'provider' | 'mode') => {
    if (target === 'provider') {
      this.agentProviderOpen = !this.agentProviderOpen;
      this.agentModeOpen = false;
    } else {
      this.agentModeOpen = !this.agentModeOpen;
      this.agentProviderOpen = false;
    }
  };

  private selectAgentOption = (
    target: 'provider' | 'mode',
    option: AgentUiOption
  ) => {
    if (option.disabled) return;
    if (target === 'provider') {
      this.agentProvider = option.value;
      this.agentProviderOpen = false;
    } else {
      this.agentMode = option.value;
      this.agentModeOpen = false;
    }
  };

  private buildClientContextPrompt = (selection?: SelectionContext) => {
    const activeSelection =
      selection || this.getActiveSelection() || null;
    const element = activeSelection?.element || this.element;
    const breadcrumb = activeSelection?.breadcrumb || this.breadcrumb;
    const dom = activeSelection?.anchorNode || this.getCurrentAnchorElement();
    const tagName = dom?.tagName?.toLowerCase?.() || '';
    const firstClass = dom?.classList?.[0] || '';
    const className = (dom as any)?.className || '';
    const textContent = (dom?.textContent || '').trim().replace(/\s+/g, ' ');
    const text = textContent.length > 200 ? `${textContent.slice(0, 200)}…` : textContent;

    const domPath = breadcrumb.map((b) => ({
      name: b.name,
      label: b.name,
      path: b.path,
      line: b.line,
      column: b.column,
    }));
    const domPathLabels = domPath.map((n) => n.label).join(' > ');
    const domPathWithLocation = domPath
      .map((n) => `${n.label}(${n.path}:${n.line}:${n.column})`)
      .join(' > ');
    const elementLoc = `${element.path}:${element.line}:${element.column}`;
    const domLabel = [tagName, firstClass].filter(Boolean).join('.');

    const contextPrompt =
      `The selected DOM element is: ${domLabel || tagName || element.name}, className: ${className || '(none)'}, text content: ${text || '(empty)'}.` +
      `\nIts source location is ${elementLoc}, and the corresponding JSX/TSX tag is <${element.name} ...>.` +
      `\nThe path from the root node to the selected node is: ${domPathLabels || '(empty)'}.` +
      `\nPath with source locations: ${domPathWithLocation || '(empty)'}.`;

    return {
      contextPrompt,
      dom: {
        tagName,
        firstClass,
        className,
        textContent: textContent.slice(0, 2000),
      },
      domPath,
    };
  };

  private submitAgent = async () => {
    let requirement = this.requirement.trim();
    const filesPayload = this.buildAgentFilesPayload();
    if ((!requirement && !filesPayload.length) || this.agentLoading) return;
    if (!requirement && filesPayload.length) {
      requirement = '请参考附件';
    }

    this.agentLoading = true;
    this.agentProviderOpen = false;
    this.agentModeOpen = false;
    this.resetAgentStream();

    const controller = new AbortController();
    this.agentAbortController = controller;

    this.persistActiveSelectionState();
    const activeSelection =
      this.getActiveSelection() ||
      this.createSelectionFromNodePath([], this.targetNode || undefined);
    if (!activeSelection) {
      this.agentLoading = false;
      return;
    }
    const { contextPrompt: activeContextPrompt, dom, domPath } =
      this.buildClientContextPrompt(activeSelection);
    const selections = this.buildAllSelectedContextPayloads();
    const activeSelectionId = this.activeSelectionId || activeSelection.id;
    const contextPrompt = this.buildCompositeContextPrompt(
      selections,
      activeSelectionId
    );
    this.syncSelectedContextToServer();
    const payload = {
      requirement,
      contextPrompt,
      activeContextPrompt,
      file: activeSelection.element.path,
      line: activeSelection.element.line,
      column: activeSelection.element.column,
      elementName: activeSelection.element.name,
      dom,
      domPath,
      selections,
      activeSelectionId,
      model: this.agentProvider || undefined,
      mode: this.agentMode || undefined,
      files: filesPayload.length ? filesPayload : undefined,
    };

    try {
      await this.streamAgentWithXhr(payload, controller);
    } catch (e: any) {
      if (String(e?.name) === 'AbortError') {
        this.agentError = '已取消';
      } else {
        this.agentError = String(e?.message || e);
      }
    } finally {
      if (this.agentAbortController === controller) {
        this.agentAbortController = null;
      }
      this.agentLoading = false;
    }
  };

  private streamAgentWithXhr = (
    payload: Record<string, any>,
    controller: AbortController
  ) => {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let lastLength = 0;
      let buffer = '';
      let isSse: boolean | null = null;
      xhr.open('POST', `http://${this.ip}:${this.port}/agent`, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'text/event-stream');
      xhr.responseType = 'text';

      const abortHandler = () => {
        try {
          xhr.abort();
        } catch {
          // ignore
        }
      };
      controller.signal.addEventListener('abort', abortHandler);

      const processSseText = (text: string) => {
        buffer += text;
        let index = buffer.indexOf('\n\n');
        while (index !== -1) {
          const raw = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const lines = raw.split(/\n/);
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trimStart());
            }
          }
          if (dataLines.length) {
            const data = dataLines.join('\n');
            if (data === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(data);
              this.consumeAgentPart(parsed);
            } catch {
              this.consumeAgentPart(data);
            }
          }
          index = buffer.indexOf('\n\n');
        }
      };

      const handleProgress = () => {
        const text = xhr.responseText || '';
        if (text.length < lastLength) return;
        const delta = text.slice(lastLength);
        lastLength = text.length;
        if (isSse === null) {
          const ct = xhr.getResponseHeader('Content-Type') || '';
          isSse =
            ct.includes('text/event-stream') ||
            delta.startsWith('data:') ||
            delta.startsWith(':') ||
            delta.includes('\ndata:');
        }
        if (isSse) {
          processSseText(delta);
        } else {
          this.replaceAgentPlainText(text);
        }
      };

      xhr.onprogress = handleProgress;
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 3) {
          handleProgress();
        }
      };
      xhr.onerror = () => {
        controller.signal.removeEventListener('abort', abortHandler);
        reject(new Error('Network error'));
      };
      xhr.onload = () => {
        controller.signal.removeEventListener('abort', abortHandler);
        if (xhr.status >= 200 && xhr.status < 300) {
          if (!isSse) {
            this.replaceAgentPlainText(xhr.responseText || '');
          }
          resolve();
        } else {
          reject(
            new Error(
              `Request failed: ${xhr.status} ${xhr.statusText}${
                xhr.responseText ? `\n${xhr.responseText}` : ''
              }`
            )
          );
        }
      };

      xhr.send(JSON.stringify(payload));
    });
  };

  // 打印功能提示信息
  printTip = () => {
    const agent = navigator.userAgent.toLowerCase();
    const isWindows = ['windows', 'win32', 'wow32', 'win64', 'wow64'].some(
      (item) => agent.toUpperCase().match(item.toUpperCase())
    );
    const hotKeyMap = isWindows ? WindowsHotKeyMap : MacHotKeyMap;
    const rep = '%c';
    const hotKeys = this.hotKeys
      .split(',')
      .map((item) => rep + hotKeyMap[item.trim() as keyof typeof hotKeyMap]);
    const switchKeys = [...hotKeys, rep + this.modeKey.toUpperCase()];
    const activeFeatures = this.features
      .filter((feature) => feature.checked())
      .map((feature) => `${rep}${feature.label}`);
    const currentFeature =
      activeFeatures.length > 0
        ? activeFeatures.join(`${rep}、`)
        : `${rep}None`;

    const colorCount =
      hotKeys.length * 2 +
      switchKeys.length * 2 +
      currentFeature.match(/%c/g)!.length +
      1;
    const colors = Array(colorCount)
      .fill('')
      .map((_, index) => {
        if (index % 2 === 0) {
          return 'color: #00B42A; font-family: PingFang SC; font-size: 12px;';
        } else {
          return 'color: #006aff; font-weight: bold; font-family: PingFang SC; font-size: 12px;';
        }
      });

    const content = [
      `${rep}[code-inspector-plugin]`,
      `${rep}• Press and hold ${hotKeys.join(
        ` ${rep}+ `
      )} ${rep}to use the feature.`,
      `• Press ${switchKeys.join(
        ` ${rep}+ `
      )} ${rep}to see and change feature.`,
      `• Current Feature: ${currentFeature}`,
    ].join('\n');
    console.log(
      content,
      'color: #006aff; font-weight: bolder; font-size: 12px;',
      ...colors
    );
  };

  // 获取鼠标位置
  getMousePosition = (e: MouseEvent | TouchEvent) => {
    return {
      x: e instanceof MouseEvent ? e.pageX : e.touches[0]?.pageX,
      y: e instanceof MouseEvent ? e.pageY : e.touches[0]?.pageY,
    };
  };

  // 记录鼠标按下时初始位置
  recordMousePosition = (
    e: MouseEvent | TouchEvent,
    target: 'switch' | 'nodeTree'
  ) => {
    const ref =
      target === 'switch' ? this.inspectorSwitchRef : this.nodeTreeRef;
    this.mousePosition = {
      baseX: ref.offsetLeft,
      baseY: ref.offsetTop,
      moveX: this.getMousePosition(e).x,
      moveY: this.getMousePosition(e).y,
    };
    this.dragging = true;
    this.draggingTarget = target;
    e.preventDefault();
  };

  // 结束拖拽
  handleMouseUp = (e: MouseEvent | TouchEvent) => {
    this.hoverSwitch = false;
    if (this.dragging) {
      this.dragging = false;
      if (e instanceof TouchEvent && this.draggingTarget === 'switch') {
        this.switch(e);
      }
    }
  };

  // 切换开关
  switch = (e: Event) => {
    if (!this.moved) {
      this.open = !this.open;
      e.preventDefault();
      e.stopPropagation();
    }
    this.moved = false;
  };

  handleClickTreeNode = (node: TreeNode) => {
    this.element = node;
    // 触发功能
    this.trackCode();
    this.removeLayerPanel();
  };

  handleMouseEnterNode = async (e: MouseEvent, node: TreeNode) => {
    const { x, y, width, height } =
      (e.target as HTMLDivElement)!.getBoundingClientRect();
    this.activeNode = {
      width: width - 16 + 'px',
      left: x + 8 + 'px',
      visibility: 'hidden',
      top: `${y - 4}px`,
      bottom: '',
      content: `${node.path}:${node.line}:${node.column}`,
      class: 'tooltip-top',
    };

    this.renderCover(node.element);

    await nextTick();
    const { y: tooltipY } = this.nodeTreeTooltipRef!.getBoundingClientRect();
    if (tooltipY < 0) {
      this.activeNode = {
        ...this.activeNode,
        bottom: '',
        top: `${y + height + 4}px`,
        class: 'tooltip-bottom',
      };
    }
    this.activeNode = {
      ...this.activeNode,
      visibility: 'visible',
    };
  };

  handleMouseLeaveNode = () => {
    this.activeNode = {
      ...this.activeNode,
      visibility: 'hidden',
    };
    this.removeCover(true);
  };

  // 切换设置弹窗显示
  toggleSettingsModal = () => {
    this.showSettingsModal = !this.showSettingsModal;
  };

  // 关闭设置弹窗
  closeSettingsModal = () => {
    this.showSettingsModal = false;
  };

  // 切换 locate 功能
  toggleLocate = () => {
    this.internalLocate = !this.internalLocate;
  };

  // 切换 copy 功能
  toggleCopy = () => {
    this.internalCopy = !this.internalCopy;
  };

  // 切换 target 功能
  toggleTarget = () => {
    this.internalTarget = !this.internalTarget;
  };

  /**
   * Attach all event listeners
   */
  private attachEventListeners(): void {
    this.eventListeners.forEach(({ event, handler, options }) => {
      window.addEventListener(event, handler, options);
    });
  }

  /**
   * Detach all event listeners
   */
  private detachEventListeners(): void {
    this.eventListeners.forEach(({ event, handler, options }) => {
      window.removeEventListener(event, handler, options as EventListenerOptions);
    });
  }
  
  protected updated(changedProps: Map<PropertyKey, unknown>): void {
    if (changedProps.has('agentUi')) {
      this.syncAgentUiDefaults();
    }
    if (
      changedProps.has('agentEvents') ||
      changedProps.has('chatOpen') ||
      changedProps.has('show') ||
      changedProps.has('showNodeTree')
    ) {
      this.scheduleElementInfoReposition();
    }
  }

  protected firstUpdated(): void {
    // 初始化内部状态
    this.internalLocate = this.locate;
    this.internalCopy = !!this.copy;
    this.internalTarget = !!this.target;
    this.syncAgentUiDefaults();

    // Initialize event listeners configuration
    this.eventListeners = [
      { event: 'mousemove', handler: this.handleMouseMove as unknown as EventListener, options: true },
      { event: 'touchmove', handler: this.handleMouseMove as unknown as EventListener, options: true },
      { event: 'mousemove', handler: this.handleDrag as EventListener, options: true },
      { event: 'touchmove', handler: this.handleDrag as EventListener, options: true },
      { event: 'click', handler: this.handleMouseClick as EventListener, options: true },
      { event: 'pointerdown', handler: this.handlePointerDown as EventListener, options: true },
      { event: 'keyup', handler: this.handleKeyUp as EventListener, options: true },
      { event: 'keydown', handler: this.handleModeShortcut as EventListener, options: true },
      { event: 'mouseleave', handler: this.removeCover as EventListener, options: true },
      { event: 'mouseup', handler: this.handleMouseUp as EventListener, options: true },
      { event: 'touchend', handler: this.handleMouseUp as EventListener, options: true },
      { event: 'contextmenu', handler: this.handleContextMenu as EventListener, options: true },
      { event: 'wheel', handler: this.handleWheel as EventListener, options: { passive: false } },
    ];

    if (!this.hideConsole) {
      this.printTip();
    }

    // Attach all event listeners
    this.attachEventListeners();
    window.addEventListener('resize', this.handleViewportChange, true);
    window.addEventListener('scroll', this.handleViewportChange, true);
    window.visualViewport?.addEventListener('resize', this.handleViewportChange);
    window.visualViewport?.addEventListener('scroll', this.handleViewportChange);
    if (typeof ResizeObserver !== 'undefined') {
      this.elementInfoResizeObserver = new ResizeObserver(() => {
        this.scheduleElementInfoReposition();
      });
      this.elementInfoResizeObserver.observe(this.elementInfoRef);
    }
  }

  disconnectedCallback(): void {
    this.detachEventListeners();
    window.removeEventListener('mousemove', this.handleMouseMove, true);
    window.removeEventListener('touchmove', this.handleMouseMove, true);
    window.removeEventListener('mousemove', this.handleDrag, true);
    window.removeEventListener('touchmove', this.handleDrag, true);
    window.removeEventListener('click', this.handleMouseClick, true);
    window.removeEventListener('pointerdown', this.handlePointerDown, true);
    window.removeEventListener('keyup', this.handleKeyUp, true);
    window.removeEventListener('keydown', this.handleModeShortcut, true);
    window.removeEventListener('mouseleave', this.removeCover, true);
    window.removeEventListener('mouseup', this.handleMouseUp, true);
    window.removeEventListener('touchend', this.handleMouseUp, true);
    window.removeEventListener('contextmenu', this.handleContextMenu, true);
    window.removeEventListener('wheel', this.handleWheel, { passive: false } as EventListenerOptions);
    window.removeEventListener('resize', this.handleViewportChange, true);
    window.removeEventListener('scroll', this.handleViewportChange, true);
    window.visualViewport?.removeEventListener('resize', this.handleViewportChange);
    window.visualViewport?.removeEventListener('scroll', this.handleViewportChange);
    this.elementInfoResizeObserver?.disconnect();
  }

  renderNodeTree = (node: TreeNode): TemplateResult => html`
    <div
      class="inspector-layer"
      style="padding-left: ${node.depth * 8}px;"
      @mouseenter="${async (e: MouseEvent) =>
        await this.handleMouseEnterNode(e, node)}"
      @mouseleave="${this.handleMouseLeaveNode}"
      @click="${() => this.handleClickTreeNode(node)}"
    >
      &lt;${node.name}&gt;
    </div>
    ${node.children.map((child) => this.renderNodeTree(child))}
  `;

  render() {
    const timelineBlocks = this.buildTimelineBlocks();
    const firstTextIndex = timelineBlocks.findIndex(
      (block) => block.kind === 'text'
    );
    const cotBlocks =
      firstTextIndex === -1
        ? timelineBlocks
        : timelineBlocks.slice(0, firstTextIndex);
    const responseBlocks =
      firstTextIndex === -1 ? [] : timelineBlocks.slice(firstTextIndex);
    const hasResponse = firstTextIndex !== -1;
    const changedFiles = this.collectChangedFiles();
    const showLog = timelineBlocks.length > 0;

    const changedFilesBlock = changedFiles.length
      ? html`<div class="ci-agent-block ci-agent-block-changes">
          <div class="ci-agent-block-header">
            <span class="ci-agent-dot"></span>
            <span class="ci-agent-block-title">Changed Files</span>
            <span class="ci-agent-pill ci-agent-pill-muted"
              >${changedFiles.length} 个</span
            >
          </div>
          <ul class="ci-agent-block-list">
            ${changedFiles.map(
              (item) => html`<li class="ci-agent-block-item">
                <span class="ci-agent-pill">${item.label}</span>
                ${item.detail
                  ? html`<span class="ci-agent-pill ci-agent-pill-muted"
                      >${item.detail}</span
                    >`
                  : ''}
              </li>`
            )}
          </ul>
        </div>`
      : '';

    const renderTimelineBlock = (
      block: AgentTimelineBlock,
      isCot: boolean
    ) => {
      if (block.kind === 'text') {
        const text = (block.text || '').trim();
        if (!text) return '';
        return html`<div class="ci-agent-block ci-agent-block-text">
          <div class="ci-agent-block-header">
            <span class="ci-agent-dot"></span>
            <span class="ci-agent-block-title">Response</span>
          </div>
          <div class="ci-agent-block-body">
            ${this.splitParagraphs(text).map((part) => html`<p>${part}</p>`)}
          </div>
        </div>`;
      }
      if (block.kind === 'reasoning') {
        const text = (block.text || '').trim();
        if (!text) return '';
        return html`<div class="ci-agent-block ci-agent-block-reasoning">
          <div class="ci-agent-block-header">
            <span class="ci-agent-dot"></span>
            <span class="ci-agent-block-title">Reasoning</span>
          </div>
          ${isCot
            ? html`<div class="ci-agent-block-body">
                ${this.splitParagraphs(text).map((part) => html`<p>${part}</p>`)}
              </div>`
            : html`<details class="ci-agent-details" open>
                <summary>Thoughts</summary>
                <div class="ci-agent-block-body">
                  ${this.splitParagraphs(text).map(
                    (part) => html`<p>${part}</p>`
                  )}
                </div>
              </details>`}
        </div>`;
      }
      if (block.kind === 'tool') {
        const callMeta = block.call
          ? this.getToolCallMeta(block.call.inputRaw ?? block.call.input)
          : null;
        const resultMeta = block.result
          ? this.getToolResultMeta(
              block.result.outputRaw ?? block.result.output
            )
          : null;
        const preview = block.result
          ? this.buildToolResultPreview(
              callMeta,
              block.result.outputRaw ?? block.result.output
            )
          : null;
        const label =
          callMeta?.item?.label ||
          block.call?.toolName ||
          block.result?.toolName ||
          '工具调用';
        const statusLabel = resultMeta
          ? resultMeta.status === 'success'
            ? '完成'
            : '失败'
          : '运行中';
        return html`<div class="ci-agent-block ci-agent-block-tool">
          <div class="ci-agent-block-header">
            <span class="ci-agent-dot"></span>
            <span class="ci-agent-block-title">Tool</span>
            <span class="ci-agent-pill">${label}</span>
            <span class="ci-agent-pill ci-agent-pill-muted">${statusLabel}</span>
            ${resultMeta?.detail
              ? html`<span class="ci-agent-pill ci-agent-pill-muted"
                  >${resultMeta.detail}</span
                >`
              : ''}
          </div>
          <details class="ci-agent-details">
            <summary>
              <span>收起/展开</span>
              ${callMeta?.item?.label
                ? html`<span class="ci-agent-details-preview"
                    >${callMeta.item.label}</span
                  >`
                : ''}
            </summary>
            <div class="ci-agent-meta-list">
              ${callMeta?.toolName
                ? html`<span class="ci-agent-meta-key">Tool</span
                  ><span class="ci-agent-meta-value"
                    >${callMeta.toolName}</span
                  >`
                : ''}
              ${callMeta?.path
                ? html`<span class="ci-agent-meta-key">Path</span
                  ><span class="ci-agent-meta-value"
                    >${this.formatPathLabel(callMeta.path)}</span
                  >`
                : ''}
              ${callMeta?.query
                ? html`<span class="ci-agent-meta-key">Query</span
                  ><span class="ci-agent-meta-value"
                    >${callMeta.query}</span
                  >`
                : ''}
              ${callMeta?.cwd
                ? html`<span class="ci-agent-meta-key">Cwd</span
                  ><span class="ci-agent-meta-value"
                    >${this.formatPathLabel(callMeta.cwd)}</span
                  >`
                : ''}
              ${resultMeta
                ? html`<span class="ci-agent-meta-key">Result</span
                  ><span class="ci-agent-meta-value"
                    >${statusLabel}</span
                  >`
                : ''}
              ${resultMeta?.detail
                ? html`<span class="ci-agent-meta-key">Summary</span
                  ><span class="ci-agent-meta-value"
                    >${resultMeta.detail}</span
                  >`
                : ''}
              ${resultMeta?.stderr
                ? html`<span class="ci-agent-meta-key">Stderr</span
                  ><span class="ci-agent-meta-value"
                    >${this.truncateText(String(resultMeta.stderr), 120)}</span
                  >`
                : ''}
            </div>
            ${preview
              ? html`<div class="ci-agent-preview">
                  <div class="ci-agent-preview-title">${preview.title}</div>
                  ${preview.chips
                    ? html`<div class="ci-agent-chips">
                        ${preview.chips.map(
                          (chip) => html`<span class="ci-agent-chip"
                            >${chip}</span
                          >`
                        )}
                      </div>`
                    : preview.lines && preview.lines.length
                    ? html`<div class="ci-agent-preview-lines">
                        ${preview.lines.map(
                          (line) =>
                            html`<div class="ci-agent-preview-line">${line}</div>`
                        )}
                      </div>`
                    : html`<div class="ci-agent-preview-empty">
                        无可展示内容
                      </div>`}
                </div>`
              : ''}
          </details>
        </div>`;
      }
      if (block.kind === 'source') {
        return html`<div class="ci-agent-block ci-agent-block-source">
          <div class="ci-agent-block-header">
            <span class="ci-agent-dot"></span>
            <span class="ci-agent-block-title">Sources</span>
          </div>
          <div class="ci-agent-chips">
            ${block.events.map((event) => {
              const title =
                event.source?.title || event.source?.url || 'source';
              const host = this.getAgentHostLabel(event.source?.url);
              return event.source?.url
                ? html`<a
                    class="ci-agent-chip"
                    href="${event.source.url}"
                    target="_blank"
                    rel="noreferrer"
                  >
                    ${title}
                    ${host
                      ? html`<span class="ci-agent-chip-host">${host}</span>`
                      : ''}
                  </a>`
                : html`<span class="ci-agent-chip">${title}</span>`;
            })}
          </div>
        </div>`;
      }
      if (block.kind === 'file') {
        return html`<div class="ci-agent-block ci-agent-block-file">
          <div class="ci-agent-block-header">
            <span class="ci-agent-dot"></span>
            <span class="ci-agent-block-title">Files</span>
          </div>
          <div class="ci-agent-file-list">
            ${block.events.map((event) => {
              const mediaType =
                event.file?.mediaType || 'application/octet-stream';
              const sizeLabel = event.file?.size
                ? this.formatBytes(event.file.size)
                : '';
              return html`<div class="ci-agent-file-item">
                <div class="ci-agent-file-title">${mediaType}</div>
                ${sizeLabel
                  ? html`<div class="ci-agent-file-meta">${sizeLabel}</div>`
                  : ''}
              </div>`;
            })}
          </div>
        </div>`;
      }
      if (block.kind === 'error') {
        return html`<div class="ci-agent-block ci-agent-block-error">
          <div class="ci-agent-block-header">
            <span class="ci-agent-dot"></span>
            <span class="ci-agent-block-title">Error</span>
          </div>
          <div class="ci-agent-block-body">
            ${block.events.map(
              (event) =>
                html`<p class="ci-agent-content-error">
                  ${event.message || 'error'}
                </p>`
            )}
          </div>
        </div>`;
      }
      return '';
    };

    const containerPosition = {
      display: this.show ? 'block' : 'none',
      top: `${this.position.top - this.position.margin.top}px`,
      left: `${this.position.left - this.position.margin.left}px`,
      height: `${
        this.position.bottom -
        this.position.top +
        this.position.margin.bottom +
        this.position.margin.top
      }px`,
      width: `${
        this.position.right -
        this.position.left +
        this.position.margin.right +
        this.position.margin.left
      }px`,
    };
    const marginPosition = {
      borderTopWidth: `${this.position.margin.top}px`,
      borderRightWidth: `${this.position.margin.right}px`,
      borderBottomWidth: `${this.position.margin.bottom}px`,
      borderLeftWidth: `${this.position.margin.left}px`,
    };
    const borderPosition = {
      borderTopWidth: `${this.position.border.top}px`,
      borderRightWidth: `${this.position.border.right}px`,
      borderBottomWidth: `${this.position.border.bottom}px`,
      borderLeftWidth: `${this.position.border.left}px`,
    };
    const paddingPosition = {
      borderTopWidth: `${this.position.padding.top}px`,
      borderRightWidth: `${this.position.padding.right}px`,
      borderBottomWidth: `${this.position.padding.bottom}px`,
      borderLeftWidth: `${this.position.padding.left}px`,
    };

    const nodeTreeStyles = {
      display: this.showNodeTree ? 'flex' : 'none',
      ...this.nodeTreePosition,
    };

    const nodeTooltipStyles = {
      visibility: this.activeNode.visibility,
      maxWidth: this.activeNode.width,
      top: this.activeNode.top,
      left: this.activeNode.left,
      bottom: this.activeNode.bottom,
      display: this.showNodeTree ? '' : 'none',
    };

    const hasPrevComponent =
      this.componentChainIndex < this.componentChain.length - 1;
    const hasNextComponent = this.componentChainIndex > 0;
    const agentUi = this.agentUi || {};
    const providerOptions = agentUi.providers || [];
    const modeOptions = agentUi.modes || [];
    const hasAgentConfig = !!this.agentUi;
    const showAgentComposer = this.chatOpen && hasAgentConfig;
    const elementInfoWidth = this.chatOpen
      ? hasAgentConfig
        ? 520
        : PopperWidth
      : PopperWidth;
    const elementInfoContentClass = this.chatOpen
      ? hasAgentConfig
        ? 'ci-panel'
        : 'ci-panel-compact'
      : 'ci-tip';
    const activeProvider = this.getAgentOptionLabel(
      providerOptions,
      this.agentProvider
    );
    const activeMode = this.getAgentOptionLabel(
      modeOptions,
      this.agentMode
    );
    const canUpload = hasAgentConfig && agentUi.enableUpload !== false;
    const placeholder =
      agentUi.placeholder || 'What would you like to know?';
    const canSend =
      !!(this.requirement.trim() || this.agentFiles.length) &&
      !this.agentLoading;
    const renderAgentIcon = (kind?: AgentUiOption['icon']) => {
      if (kind === 'globe' || kind === 'search') {
        return html`<svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />
          <path
            d="M3 12h18M12 3a14 14 0 0 0 0 18M12 3a14 14 0 0 1 0 18"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>`;
      }
      if (kind === 'model') {
        return html`<svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 3l7 4v10l-7 4-7-4V7l7-4z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <path
            d="M12 7v10M5 9l7 4 7-4"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>`;
      }
      return html`<svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5" />
        <path
          d="M20 20l-3.5-3.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>`;
    };

    return html`
      <div
        class="code-inspector-container ${this.overlayMode === 'outline'
          ? 'overlay-outline'
          : ''}"
        id="code-inspector-container"
        style=${styleMap(containerPosition)}
      >
        <div class="margin-overlay" style=${styleMap(marginPosition)}>
          <div class="border-overlay" style=${styleMap(borderPosition)}>
            <div class="padding-overlay" style=${styleMap(paddingPosition)}>
              <div class="content-overlay"></div>
            </div>
          </div>
        </div>
      </div>
        <div
          id="element-info"
          class="element-info ${this.elementTipStyle.vertical} ${this
            .elementTipStyle.horizon} ${this.show
            ? this.elementTipStyle.visibility
            : 'hidden'}"
          style=${styleMap({
            width: `${elementInfoWidth}px`,
            maxWidth: 'calc(100vw - 16px)',
            ...this.elementTipStyle.additionStyle,
          })}
        >
          <div
            class="element-info-content ${elementInfoContentClass}"
          >
            ${this.chatOpen
              ? html`
                  <div class="ci-breadcrumb-header">
                    ${this.selections.length > 0
                      ? html`<div class="ci-selection-list">
                          ${this.selections.map(
                            (selection, index) => html`
                              <div
                                class="ci-selection-chip ${selection.id ===
                                this.activeSelectionId
                                  ? 'active'
                                  : ''}"
                                title="${selection.element.path}:${selection.element.line}:${selection.element.column}"
                              >
                                <button
                                  type="button"
                                  class="ci-selection-chip-main"
                                  @click="${() =>
                                    void this.switchSelection(selection.id)}"
                                >
                                  ${index + 1}. ${selection.element.name}
                                </button>
                                ${this.selections.length > 1
                                  ? html`<button
                                      type="button"
                                      class="ci-selection-chip-remove"
                                      title="移除该选中项"
                                      @click="${() =>
                                        void this.removeSelection(selection.id)}"
                                    >
                                      ×
                                    </button>`
                                  : ''}
                              </div>
                            `
                          )}
                        </div>`
                      : ''}
                    <div class="ci-breadcrumb-main">
                      <div class="ci-breadcrumb-left">
                        <div class="ci-breadcrumb-row">
                          <div class="ci-breadcrumb-scroll">
                            ${this.getBreadcrumbDisplayParts().map((part, i, arr) =>
                              part.kind === 'ellipsis'
                                ? html`
                                    <span class="ci-ellipsis" title="已省略">…</span>
                                    ${i < arr.length - 1
                                      ? html`<span class="ci-sep">›</span>`
                                      : ''}
                                  `
                                : html`
                                    <span
                                      class="ci-crumb ${part.index ===
                                      this.breadcrumbIndex
                                        ? 'active'
                                        : ''}"
                                      data-index="${part.index}"
                                      title="${part.node.path}:${part.node.line}:${part.node.column}"
                                      @click="${(e: MouseEvent) =>
                                        this.handleBreadcrumbClick(part.index, e)}"
                                      >${part.node.name}</span
                                    >
                                    ${i < arr.length - 1
                                      ? html`<span class="ci-sep">›</span>`
                                      : ''}
                                  `
                            )}
                          </div>
                        </div>
                        <div class="ci-breadcrumb-actions">
                          <button
                            type="button"
                            class="ci-copy-action"
                            aria-label="Copy current path"
                            title="复制当前路径"
                            @click="${this.copyActiveBreadcrumbPath}"
                          >
                            ${html`<svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <rect
                                x="9"
                                y="9"
                                width="10"
                                height="10"
                                rx="2"
                                stroke="currentColor"
                                stroke-width="1.8"
                              />
                              <path
                                d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                              />
                            </svg>`}
                          </button>
                        </div>
                      </div>
                      <div class="ci-breadcrumb-controls">
                        <span
                          class="ci-arrow ci-arrow-up ${!hasPrevComponent
                            ? 'disabled'
                            : ''}"
                          title="上一个组件"
                          @click="${this.gotoPrevComponentBreadcrumb}"
                          >${html`<svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M8 15l4-4 4 4"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>`}</span
                        >
                        <span
                          class="ci-arrow ci-arrow-down ${!hasNextComponent
                            ? 'disabled'
                            : ''}"
                          title="下一个组件"
                          @click="${this.gotoNextComponentBreadcrumb}"
                          >${html`<svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M8 9l4 4 4-4"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>`}</span
                        >
                        <span
                          class="ci-arrow ci-arrow-left ${this.breadcrumbIndex <= 0
                            ? 'disabled'
                            : ''}"
                          title="上一层"
                          @click="${this.gotoParentBreadcrumb}"
                          >${html`<svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M15 8l-4 4 4 4"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>`}</span
                        >
                        <span
                          class="ci-arrow ci-arrow-right ${this.breadcrumbIndex >=
                          this.breadcrumb.length - 1
                            ? 'disabled'
                            : ''}"
                          title="下一层"
                          @click="${this.gotoChildBreadcrumb}"
                          >${html`<svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M9 8l4 4-4 4"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>`}</span
                        >
                      </div>
                    </div>
                  </div>
                  ${showAgentComposer
                    ? html`<div class="ci-agent">
                    <div class="ci-agent-box">
                      <textarea
                        id="ci-agent-input"
                        class="ci-agent-input"
                        placeholder="${placeholder}"
                        .value="${this.requirement}"
                        @input="${(e: Event) => {
                          this.requirement = (
                            e.target as HTMLTextAreaElement
                          ).value;
                        }}"
                        @paste="${this.handleAgentPaste}"
                        @keydown="${(e: KeyboardEvent) => {
                          const isSubmit =
                            (e.ctrlKey || e.metaKey) && e.key === 'Enter';
                          if (isSubmit) {
                            e.preventDefault();
                            void this.submitAgent();
                          }
                        }}"
                      ></textarea>
                      ${canUpload && this.agentFiles.length
                        ? html`<div class="ci-agent-attachments">
                            ${this.agentFiles.map(
                              (file) => html`
                                <div class="ci-agent-attachment">
                                  ${file.isImage && file.dataUrl
                                    ? html`<img
                                        class="ci-agent-attachment-thumb"
                                        src="${file.dataUrl}"
                                        alt="${file.name}"
                                      />`
                                    : html`<span class="ci-agent-attachment-icon"
                                        >${html`<svg
                                          width="14"
                                          height="14"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          xmlns="http://www.w3.org/2000/svg"
                                        >
                                          <path
                                            d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"
                                            stroke="currentColor"
                                            stroke-width="1.5"
                                            stroke-linejoin="round"
                                          />
                                          <path
                                            d="M14 3v6h6"
                                            stroke="currentColor"
                                            stroke-width="1.5"
                                            stroke-linejoin="round"
                                          />
                                        </svg>`}</span
                                      >`}
                                  <div class="ci-agent-attachment-meta">
                                    <span
                                      class="ci-agent-attachment-name"
                                      title="${file.name}"
                                      >${file.name}</span
                                    >
                                    ${file.size
                                      ? html`<span
                                          class="ci-agent-attachment-size"
                                          >${this.formatAgentFileSize(
                                            file.size
                                          )}</span
                                        >`
                                      : ''}
                                  </div>
                                  <button
                                    class="ci-agent-attachment-remove"
                                    title="移除"
                                    @click="${() =>
                                      this.removeAgentFile(file.id)}"
                                  >
                                    ×
                                  </button>
                                </div>
                              `
                            )}
                          </div>`
                        : ''}
                      <div class="ci-agent-controls">
                        <div class="ci-agent-controls-left">
                          ${canUpload
                            ? html`
                                <button
                                  class="ci-agent-icon-button"
                                  title="上传图片/文件"
                                  @click="${this.handleAgentAttachClick}"
                                >
                                  ${html`<svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path
                                      d="M12 5v14M5 12h14"
                                      stroke="currentColor"
                                      stroke-width="1.5"
                                      stroke-linecap="round"
                                    />
                                  </svg>`}
                                </button>
                                <input
                                  id="ci-agent-file-input"
                                  class="ci-agent-file-input"
                                  type="file"
                                  multiple
                                  @change="${this.handleAgentFilesSelected}"
                                />
                              `
                            : ''}
                          ${modeOptions.length && activeMode
                            ? html`
                                <div class="ci-agent-select">
                                  <button
                                    class="ci-agent-select-trigger"
                                    title="切换模式"
                                    @click="${(e: MouseEvent) => {
                                      e.stopPropagation();
                                      this.toggleAgentMenu('mode');
                                    }}"
                                  >
                                    ${renderAgentIcon(
                                      activeMode?.icon || 'globe'
                                    )}
                                    <span class="ci-agent-select-label"
                                      >${activeMode?.label || ''}</span
                                    >
                                    ${activeMode?.subLabel
                                      ? html`<span class="ci-agent-select-sub"
                                          >${activeMode.subLabel}</span
                                        >`
                                      : ''}
                                    <span class="ci-agent-select-caret"
                                      >${html`<svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                      >
                                        <path
                                          d="M6 9l6 6 6-6"
                                          stroke="currentColor"
                                          stroke-width="1.5"
                                          stroke-linecap="round"
                                          stroke-linejoin="round"
                                        />
                                      </svg>`}</span
                                    >
                                  </button>
                                  ${this.agentModeOpen
                                    ? html`<div class="ci-agent-select-menu">
                                        ${modeOptions.map(
                                          (option) => html`
                                            <button
                                              class="ci-agent-select-option ${option.disabled
                                                ? 'disabled'
                                                : ''} ${option.value ===
                                              this.agentMode
                                                ? 'active'
                                                : ''}"
                                              @click="${(e: MouseEvent) => {
                                                e.stopPropagation();
                                                this.selectAgentOption(
                                                  'mode',
                                                  option
                                                );
                                              }}"
                                            >
                                              ${renderAgentIcon(
                                                option.icon || 'globe'
                                              )}
                                              <span class="ci-agent-select-label"
                                                >${option.label}</span
                                              >
                                              ${option.subLabel
                                                ? html`<span
                                                    class="ci-agent-select-sub"
                                                    >${option.subLabel}</span
                                                  >`
                                                : ''}
                                            </button>
                                          `
                                        )}
                                      </div>`
                                    : ''}
                                </div>
                              `
                            : ''}
                          ${providerOptions.length && activeProvider
                            ? html`
                                <div class="ci-agent-select">
                                  <button
                                    class="ci-agent-select-trigger"
                                    title="切换提供商"
                                    @click="${(e: MouseEvent) => {
                                      e.stopPropagation();
                                      this.toggleAgentMenu('provider');
                                    }}"
                                  >
                                    ${renderAgentIcon(
                                      activeProvider?.icon || 'model'
                                    )}
                                    <span class="ci-agent-select-label"
                                      >${activeProvider?.label || ''}</span
                                    >
                                    ${activeProvider?.subLabel
                                      ? html`<span class="ci-agent-select-sub"
                                          >${activeProvider.subLabel}</span
                                        >`
                                      : ''}
                                    <span class="ci-agent-select-caret"
                                      >${html`<svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                      >
                                        <path
                                          d="M6 9l6 6 6-6"
                                          stroke="currentColor"
                                          stroke-width="1.5"
                                          stroke-linecap="round"
                                          stroke-linejoin="round"
                                        />
                                      </svg>`}</span
                                    >
                                  </button>
                                  ${this.agentProviderOpen
                                    ? html`<div class="ci-agent-select-menu">
                                        ${providerOptions.map(
                                          (option) => html`
                                            <button
                                              class="ci-agent-select-option ${option.disabled
                                                ? 'disabled'
                                                : ''} ${option.value ===
                                              this.agentProvider
                                                ? 'active'
                                                : ''}"
                                              @click="${(e: MouseEvent) => {
                                                e.stopPropagation();
                                                this.selectAgentOption(
                                                  'provider',
                                                  option
                                                );
                                              }}"
                                            >
                                              ${renderAgentIcon(
                                                option.icon || 'model'
                                              )}
                                              <span class="ci-agent-select-label"
                                                >${option.label}</span
                                              >
                                              ${option.subLabel
                                                ? html`<span
                                                    class="ci-agent-select-sub"
                                                    >${option.subLabel}</span
                                                  >`
                                                : ''}
                                            </button>
                                          `
                                        )}
                                      </div>`
                                    : ''}
                                </div>
                              `
                            : ''}
                        </div>
                        <div class="ci-agent-controls-right">
                          ${this.agentLoading
                            ? html`
                                <button
                                  class="ci-agent-send ci-agent-stop"
                                  title="取消"
                                  @click="${this.cancelAgent}"
                                >
                                  ${html`<svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <rect
                                      x="6"
                                      y="6"
                                      width="12"
                                      height="12"
                                      rx="2"
                                      stroke="currentColor"
                                      stroke-width="1.5"
                                    />
                                  </svg>`}
                                </button>
                              `
                            : html`
                                <button
                                  class="ci-agent-send ${canSend
                                    ? ''
                                    : 'disabled'}"
                                  title="发送"
                                  ?disabled=${!canSend}
                                  @click="${() =>
                                    canSend && this.submitAgent()}"
                                >
                                  ${html`<svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path
                                      d="M5 12h10"
                                      stroke="currentColor"
                                      stroke-width="1.6"
                                      stroke-linecap="round"
                                    />
                                    <path
                                      d="M12 6l6 6-6 6"
                                      stroke="currentColor"
                                      stroke-width="1.6"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                    />
                                  </svg>`}
                                </button>
                              `}
                          <button
                            class="ci-agent-close"
                            title="关闭"
                            @click="${() => {
                              this.closeChat();
                              this.removeCover(true);
                            }}"
                          >
                            ${html`<svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M18 6 6 18"
                                stroke="currentColor"
                                stroke-width="1.6"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                              />
                              <path
                                d="m6 6 12 12"
                                stroke="currentColor"
                                stroke-width="1.6"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                              />
                            </svg>`}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div
                      class="ci-agent-status ${this.agentError
                        ? 'error'
                        : ''}"
                    >
                      ${this.agentLoading
                        ? '生成中…'
                        : this.agentError || ''}
                    </div>
                    ${showLog
                      ? html`<div id="ci-agent-log" class="ci-agent-log">
                          <div class="ci-agent-timeline">
                            ${cotBlocks.length
                              ? html`<details
                                  class="ci-cot"
                                  ?open=${!hasResponse}
                                >
                                  <summary class="ci-cot-summary">
                                    <span class="ci-cot-icon"
                                      >${html`<svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                      >
                                        <path
                                          d="M12 3a7 7 0 0 0-4.7 12.1c.4.3.7.8.7 1.3V19a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.6c0-.5.3-1 .7-1.3A7 7 0 0 0 12 3Z"
                                          stroke="currentColor"
                                          stroke-width="1.5"
                                        />
                                        <path
                                          d="M9 21h6"
                                          stroke="currentColor"
                                          stroke-width="1.5"
                                        />
                                      </svg>`}</span>
                                    <span class="ci-cot-title"
                                      >Chain of Thought</span
                                    >
                                  </summary>
                                  <div class="ci-cot-list">
                                    ${cotBlocks.map((block) =>
                                      renderTimelineBlock(block, true)
                                    )}
                                  </div>
                                </details>`
                              : ''}
                            ${responseBlocks.length
                              ? html`<div class="ci-response">
                                  ${responseBlocks.map((block) =>
                                    renderTimelineBlock(block, false)
                                  )}
                                  ${changedFilesBlock}
                                </div>`
                              : ''}
                            ${!responseBlocks.length ? changedFilesBlock : ''}
                          </div>
                        </div>`
                      : ''}
                  </div>`
                    : ''}
                `
              : html`<span class="ci-tip-tag">${this.element.name}</span>`}
          </div>
        </div>
      <div
        id="inspector-switch"
        class="inspector-switch ${this.open
          ? 'active-inspector-switch'
          : ''} ${this.moved ? 'move-inspector-switch' : ''}"
        style=${styleMap({ display: this.showSwitch ? 'flex' : 'none' })}
        @mousedown="${(e: MouseEvent) => this.recordMousePosition(e, 'switch')}"
        @touchstart="${(e: TouchEvent) =>
          this.recordMousePosition(e, 'switch')}"
        @click="${this.switch}"
      >
        ${this.open
          ? html`
              <svg
                t="1677801709811"
                class="icon"
                viewBox="0 0 1024 1024"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                p-id="1110"
                xmlns:xlink="http://www.w3.org/1999/xlink"
                width="1em"
                height="1em"
              >
                <path
                  d="M546.56 704H128c-19.2 0-32-12.8-32-32V256h704v194.56c10.928 1.552 21.648 3.76 32 6.832V128c0-35.2-28.8-64-64-64H128C92.8 64 64 92.8 64 128v544c0 35.2 28.8 64 64 64h425.392a221.936 221.936 0 0 1-6.848-32zM96 128c0-19.2 12.8-32 32-32h640c19.2 0 32 12.8 32 32v96H96V128z"
                  fill="#34495E"
                  p-id="1111"
                ></path>
                <path
                  d="M416 160m-32 0a32 32 0 1 0 64 0 32 32 0 1 0-64 0Z"
                  fill="#00B42A"
                  p-id="1112"
                ></path>
                <path
                  d="M288 160m-32 0a32 32 0 1 0 64 0 32 32 0 1 0-64 0Z"
                  fill="#F7BA1E"
                  p-id="1113"
                ></path>
                <path
                  d="M160 160m-32 0a32 32 0 1 0 64 0 32 32 0 1 0-64 0Z"
                  fill="#F53F3F"
                  p-id="1114"
                ></path>
                <path
                  d="M382.848 658.928l99.376-370.88 30.912 8.272-99.36 370.88zM318.368 319.2L160 477.6l158.4 158.4 22.64-22.624-135.792-135.776 135.776-135.776zM768 480c-13.088 0-25.888 1.344-38.24 3.84l6.24-6.24-158.4-158.4-22.64 22.624 135.792 135.776-135.776 135.776 22.656 22.624 2.208-2.224a190.768 190.768 0 0 0 30.928 148.08l-116.672 116.656c-10.24 10.24-10.24 26.896 0 37.136l27.76 27.76c5.12 5.12 11.84 7.68 18.56 7.68s13.456-2.56 18.56-7.68l120.992-120.96A190.56 190.56 0 0 0 768 864c105.872 0 192-86.128 192-192s-86.128-192-192-192z m-159.12 193.136c0-88.224 71.776-160 160-160 10.656 0 21.04 1.152 31.12 3.152V672c0 19.2-12.8 32-32 32h-156a160.144 160.144 0 0 1-3.12-30.864z m-68.464 263.584l-19.632-19.632 110.336-110.336c6.464 6.656 13.392 12.848 20.752 18.528l-111.456 111.44z m228.464-103.584c-65.92 0-122.576-40.096-147.056-97.136H768c35.2 0 64-28.8 64-64v-145.776c56.896 24.544 96.88 81.12 96.88 146.912 0 88.224-71.776 160-160 160z"
                  fill="#006AFF"
                  p-id="1115"
                ></path>
                <path
                  d="M864.576 672c0 52.928-43.072 96-96 96v32a128 128 0 0 0 128-128h-32z"
                  fill="#34495E"
                  p-id="1116"
                ></path>
              </svg>
            `
          : html`<svg
              t="1677801709811"
              class="icon"
              viewBox="0 0 1024 1024"
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              p-id="1110"
              xmlns:xlink="http://www.w3.org/1999/xlink"
              width="1em"
              height="1em"
            >
              <path
                d="M546.56 704H128c-19.2 0-32-12.8-32-32V256h704v194.56c10.928 1.552 21.648 3.76 32 6.832V128c0-35.2-28.8-64-64-64H128C92.8 64 64 92.8 64 128v544c0 35.2 28.8 64 64 64h425.392a221.936 221.936 0 0 1-6.848-32zM96 128c0-19.2 12.8-32 32-32h640c19.2 0 32 12.8 32 32v96H96V128z"
                fill="currentColor"
                p-id="1111"
              ></path>
              <path
                d="M416 160m-32 0a32 32 0 1 0 64 0 32 32 0 1 0-64 0Z"
                fill="currentColor"
                p-id="1112"
              ></path>
              <path
                d="M288 160m-32 0a32 32 0 1 0 64 0 32 32 0 1 0-64 0Z"
                fill="currentColor"
                p-id="1113"
              ></path>
              <path
                d="M160 160m-32 0a32 32 0 1 0 64 0 32 32 0 1 0-64 0Z"
                fill="currentColor"
                p-id="1114"
              ></path>
              <path
                d="M382.848 658.928l99.376-370.88 30.912 8.272-99.36 370.88zM318.368 319.2L160 477.6l158.4 158.4 22.64-22.624-135.792-135.776 135.776-135.776zM768 480c-13.088 0-25.888 1.344-38.24 3.84l6.24-6.24-158.4-158.4-22.64 22.624 135.792 135.776-135.776 135.776 22.656 22.624 2.208-2.224a190.768 190.768 0 0 0 30.928 148.08l-116.672 116.656c-10.24 10.24-10.24 26.896 0 37.136l27.76 27.76c5.12 5.12 11.84 7.68 18.56 7.68s13.456-2.56 18.56-7.68l120.992-120.96A190.56 190.56 0 0 0 768 864c105.872 0 192-86.128 192-192s-86.128-192-192-192z m-159.12 193.136c0-88.224 71.776-160 160-160 10.656 0 21.04 1.152 31.12 3.152V672c0 19.2-12.8 32-32 32h-156a160.144 160.144 0 0 1-3.12-30.864z m-68.464 263.584l-19.632-19.632 110.336-110.336c6.464 6.656 13.392 12.848 20.752 18.528l-111.456 111.44z m228.464-103.584c-65.92 0-122.576-40.096-147.056-97.136H768c35.2 0 64-28.8 64-64v-145.776c56.896 24.544 96.88 81.12 96.88 146.912 0 88.224-71.776 160-160 160z"
                fill="currentColor"
                p-id="1115"
              ></path>
              <path
                d="M864.576 672c0 52.928-43.072 96-96 96v32a128 128 0 0 0 128-128h-32z"
                fill="currentColor"
                p-id="1116"
              ></path>
            </svg>`}
      </div>
      <div
        id="inspector-node-tree"
        class="element-info-content"
        style=${styleMap(nodeTreeStyles)}
      >
        <div
          class="inspector-layer-title"
          @mousedown="${(e: MouseEvent) =>
            this.recordMousePosition(e, 'nodeTree')}"
          @touchstart="${(e: TouchEvent) =>
            this.recordMousePosition(e, 'nodeTree')}"
        >
          <div>🔍️ Click node to locate</div>
          ${html`<svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="close-icon"
            @click="${this.removeLayerPanel}"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>`}
        </div>

        <div
          class="node-tree-list"
          style="${styleMap({ pointerEvents: this.dragging ? 'none' : '' })}"
        >
          ${this.nodeTree ? this.renderNodeTree(this.nodeTree) : ''}
          <div style="height: 8px"></div>
        </div>
      </div>

      <!-- 设置弹窗 -->
      ${this.showSettingsModal
        ? html`
            <div
              class="settings-modal-overlay"
              @click="${this.closeSettingsModal}"
            >
              <div
                class="settings-modal"
                @click="${(e: MouseEvent) => e.stopPropagation()}"
              >
                <div class="settings-modal-header">
                  <h3 class="settings-modal-title">Mode Settings</h3>
                  <button
                    class="settings-modal-close"
                    @click="${this.closeSettingsModal}"
                  >
                    ×
                  </button>
                </div>
                <div class="settings-modal-content">
                  ${this.features.map(
                    (feature) => html`
                      <div class="settings-item">
                        <label class="settings-label">
                          <span class="settings-label-text"
                            >${feature.label}</span
                          >
                          <span class="settings-label-desc"
                            >${feature.description}</span
                          >
                        </label>
                        <label class="settings-switch">
                          <input
                            type="checkbox"
                            .checked="${feature.checked()}"
                            @change="${feature.onChange}"
                          />
                          <span class="settings-slider"></span>
                        </label>
                      </div>
                    `
                  )}
                </div>
              </div>
            </div>
          `
        : ''}

      <div
        id="node-tree-tooltip"
        class="${this.activeNode.class}"
        style=${styleMap(nodeTooltipStyles)}
      >
        ${this.activeNode.content}
      </div>
    `;
  }

  static styles = css`
    .code-inspector-container {
      position: fixed;
      pointer-events: none;
      z-index: 9999999999999;
      font-family: 'PingFang SC';
      .margin-overlay {
        position: absolute;
        inset: 0;
        border-style: solid;
        border-color: rgba(255, 155, 0, 0.3);
        .border-overlay {
          position: absolute;
          inset: 0;
          border-style: solid;
          border-color: rgba(255, 200, 50, 0.3);
          .padding-overlay {
            position: absolute;
            inset: 0;
            border-style: solid;
            border-color: rgba(77, 200, 0, 0.3);
            .content-overlay {
              position: absolute;
              inset: 0;
              background: rgba(120, 170, 210, 0.7);
            }
          }
        }
      }
    }
    .code-inspector-container.overlay-outline {
      .content-overlay {
        background: transparent;
      }
    }
    .element-info {
      position: absolute;
      pointer-events: none;
      z-index: 99999999999999999999;
    }
    .element-info.hidden {
      visibility: hidden;
    }
    .element-info-content {
      max-width: 100%;
      font-size: 12px;
      color: #000;
      background-color: #fff;
      word-break: break-all;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.25);
      box-sizing: border-box;
      padding: 4px 8px;
      border-radius: 4px;
      pointer-events: none;
    }
    .ci-tip {
      padding: 6px 10px;
      border-radius: 10px;
    }
    .ci-tip-tag {
      color: #1d2129;
      font-weight: 600;
    }
    .ci-panel {
      padding: 10px 12px;
      border-radius: 12px;
    }
    .ci-panel-compact {
      padding: 10px 12px;
      border-radius: 12px;
    }
    .element-info-content.ci-panel {
      max-height: var(--ci-panel-max-height, calc(100vh - 16px));
      overflow: auto;
    }
    .element-info-content.ci-panel-compact {
      overflow: visible;
    }
    .ci-panel,
    .ci-panel *,
    .ci-panel-compact,
    .ci-panel-compact * {
      pointer-events: auto;
    }
    .ci-breadcrumb-header {
      padding-bottom: 8px;
      border-bottom: 1px solid #f2f3f5;
    }
    .ci-selection-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
      max-height: 84px;
      overflow: auto;
    }
    .ci-selection-chip {
      display: inline-flex;
      align-items: center;
      border: 1px solid #d9dde4;
      border-radius: 999px;
      background: #fff;
      max-width: 100%;
      overflow: hidden;
    }
    .ci-selection-chip.active {
      border-color: rgba(0, 106, 255, 0.35);
      background: rgba(0, 106, 255, 0.08);
    }
    .ci-selection-chip-main {
      border: 0;
      background: transparent;
      color: #1d2129;
      cursor: pointer;
      font-size: 12px;
      line-height: 20px;
      padding: 1px 8px 1px 10px;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ci-selection-chip-remove {
      border: 0;
      border-left: 1px solid #e5e6eb;
      background: transparent;
      color: #86909c;
      cursor: pointer;
      width: 20px;
      height: 20px;
      line-height: 20px;
      padding: 0;
      text-align: center;
    }
    .ci-selection-chip-remove:hover {
      color: #f53f3f;
      background: rgba(245, 63, 63, 0.08);
    }
    .ci-breadcrumb-main {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }
    .ci-breadcrumb-left {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .ci-breadcrumb-row {
      display: flex;
      align-items: center;
      min-height: 30px;
    }
    .ci-breadcrumb-actions {
      display: flex;
      justify-content: flex-start;
      margin-top: 2px;
    }
    .ci-breadcrumb-scroll {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      display: flex;
      align-items: center;
    }
    .ci-crumb {
      display: inline-flex;
      align-items: center;
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 2px 6px;
      border-radius: 8px;
      cursor: pointer;
      user-select: none;
      background: rgba(0, 0, 0, 0.03);
      color: #4e5969;
      border: 1px solid transparent;
      flex: 0 1 auto;
    }
    .ci-crumb:hover {
      background: rgba(0, 0, 0, 0.06);
      color: #1d2129;
    }
    .ci-crumb.active {
      background: rgba(0, 106, 255, 0.12);
      border-color: rgba(0, 106, 255, 0.25);
      color: #006aff;
    }
    .ci-sep {
      display: inline-flex;
      align-items: center;
      margin: 0 2px;
      color: #c9cdd4;
      user-select: none;
      flex: 0 0 auto;
    }
    .ci-ellipsis {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.04);
      color: #86909c;
      user-select: none;
      flex: 0 0 auto;
    }
    .ci-breadcrumb-controls {
      position: relative;
      width: 64px;
      height: 64px;
      flex-shrink: 0;
    }
    .ci-arrow {
      position: absolute;
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #4e5969;
      cursor: pointer;
      border-radius: 999px;
      user-select: none;
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid rgba(15, 23, 42, 0.08);
      box-shadow:
        0 4px 14px rgba(15, 23, 42, 0.08),
        0 1px 2px rgba(15, 23, 42, 0.06);
      backdrop-filter: blur(8px);
    }
    .ci-arrow:hover {
      background: #fff;
      color: #1d2129;
      border-color: rgba(15, 23, 42, 0.12);
    }
    .ci-arrow-up {
      top: 0;
      left: 50%;
      transform: translateX(-50%);
    }
    .ci-arrow-down {
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
    }
    .ci-arrow-left {
      left: 0;
      top: 50%;
      transform: translateY(-50%);
    }
    .ci-arrow-right {
      right: 0;
      top: 50%;
      transform: translateY(-50%);
    }
    .ci-arrow.disabled {
      opacity: 0.35;
      cursor: not-allowed;
      pointer-events: none;
    }
    .ci-copy-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      padding: 0;
      border-radius: 8px;
      border: 1px solid rgba(15, 23, 42, 0.08);
      background: rgba(255, 255, 255, 0.96);
      color: #5b6475;
      cursor: pointer;
      box-shadow:
        0 4px 12px rgba(15, 23, 42, 0.08),
        0 1px 2px rgba(15, 23, 42, 0.04);
      appearance: none;
      -webkit-appearance: none;
    }
    .ci-copy-action:hover {
      color: #2457d6;
      border-color: rgba(36, 87, 214, 0.18);
      background: rgba(245, 249, 255, 0.98);
    }
    .ci-copy-action svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
    .ci-agent {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 8px;
    }
    .ci-agent-box {
      border: 1px solid #e5e6eb;
      border-radius: 16px;
      padding: 12px;
      background: #fff;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
    }
    .ci-agent-box:focus-within {
      border-color: #006aff;
      box-shadow: 0 0 0 2px rgba(0, 106, 255, 0.15);
    }
    .ci-agent-input {
      width: 100%;
      min-height: 84px;
      max-height: 40vh;
      resize: none;
      border: none;
      padding: 0;
      font-size: 14px;
      line-height: 1.5;
      color: #1d2129;
      outline: none;
      box-sizing: border-box;
      font-family: inherit;
      background: transparent;
    }
    .ci-agent-input::placeholder {
      color: #9aa0a6;
    }
    .ci-agent-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 10px;
    }
    .ci-agent-controls-left {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .ci-agent-controls-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .ci-agent-icon-button {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #4e5969;
      border-radius: 999px;
      border: 1px solid #e5e6eb;
      background: #fff;
      cursor: pointer;
      user-select: none;
    }
    .ci-agent-icon-button:hover {
      background: #f2f3f5;
      color: #1d2129;
    }
    .ci-agent-file-input {
      display: none;
    }
    .ci-agent-select {
      position: relative;
    }
    .ci-agent-select-trigger {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid #e5e6eb;
      background: #fff;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      color: #1d2129;
      cursor: pointer;
      user-select: none;
    }
    .ci-agent-select-trigger:hover {
      border-color: #c9cdd4;
    }
    .ci-agent-select-label {
      font-weight: 500;
    }
    .ci-agent-select-sub {
      color: #6b7280;
      font-size: 11px;
    }
    .ci-agent-select-caret {
      margin-left: 2px;
      display: inline-flex;
      color: #86909c;
    }
    .ci-agent-select-menu {
      position: absolute;
      bottom: 110%;
      left: 0;
      min-width: 180px;
      background: #fff;
      border: 1px solid #e5e6eb;
      border-radius: 12px;
      padding: 6px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
      z-index: 10;
    }
    .ci-agent-select-option {
      width: 100%;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border: none;
      background: transparent;
      font-size: 12px;
      color: #1d2129;
      cursor: pointer;
      border-radius: 8px;
    }
    .ci-agent-select-option:hover {
      background: #f2f3f5;
    }
    .ci-agent-select-option.active {
      background: #e8f1ff;
      color: #0057d9;
    }
    .ci-agent-select-option.disabled {
      color: #9aa0a6;
      cursor: not-allowed;
    }
    .ci-agent-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .ci-agent-attachment {
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid #e5e6eb;
      background: #f8f9fb;
      border-radius: 10px;
      padding: 6px 8px;
      max-width: 100%;
    }
    .ci-agent-attachment-thumb {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      object-fit: cover;
      flex-shrink: 0;
    }
    .ci-agent-attachment-icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: #fff;
      border: 1px solid #e5e6eb;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #4e5969;
      flex-shrink: 0;
    }
    .ci-agent-attachment-meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .ci-agent-attachment-name {
      font-size: 12px;
      color: #1d2129;
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ci-agent-attachment-size {
      font-size: 11px;
      color: #86909c;
    }
    .ci-agent-attachment-remove {
      border: none;
      background: transparent;
      color: #86909c;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 6px;
    }
    .ci-agent-attachment-remove:hover {
      background: #e5e6eb;
      color: #1d2129;
    }
    .ci-agent-send {
      width: 36px;
      height: 36px;
      border-radius: 12px;
      border: none;
      background: #1677ff;
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .ci-agent-send.disabled {
      background: #d0d5dc;
      cursor: not-allowed;
    }
    .ci-agent-stop {
      background: #f53f3f;
    }
    .ci-agent-close {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      border: 1px solid #e5e6eb;
      background: #fff;
      color: #4e5969;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .ci-agent-status {
      font-size: 11px;
      color: #86909c;
      min-height: 14px;
      padding-left: 4px;
    }
    .ci-agent-status.error {
      color: #f53f3f;
    }
    .ci-agent-close:hover {
      background: #f2f3f5;
      color: #1d2129;
    }
    .ci-agent-log {
      margin: 0;
      padding: 10px;
      border-radius: 14px;
      border: 1px solid #e5e6eb;
      background: linear-gradient(180deg, #ffffff 0%, #f8f9fb 100%);
      max-height: 300px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ci-cot {
      border-radius: 12px;
      border: 1px solid rgba(15, 23, 42, 0.08);
      background: #ffffff;
      padding: 8px 10px;
      box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05);
    }
    .ci-cot-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      list-style: none;
      color: #111827;
      font-weight: 600;
      font-size: 13px;
    }
    .ci-cot-summary::-webkit-details-marker {
      display: none;
    }
    .ci-cot-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 8px;
      background: #f3f4f6;
      color: #6b7280;
    }
    .ci-cot-title {
      font-weight: 600;
    }
    .ci-cot-list {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .ci-response {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ci-agent-timeline {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ci-agent-block {
      background: #ffffff;
      border: 1px solid rgba(15, 23, 42, 0.08);
      border-radius: 12px;
      padding: 10px 12px;
      box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05);
    }
    .ci-agent-block-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      color: #6b7280;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .ci-agent-block-title {
      font-weight: 600;
      color: #111827;
      font-size: 12px;
      text-transform: none;
      letter-spacing: 0;
    }
    .ci-agent-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #cbd5f5;
      flex-shrink: 0;
    }
    .ci-agent-block-tool .ci-agent-dot {
      background: #f59e0b;
    }
    .ci-agent-block-reasoning .ci-agent-dot {
      background: #a78bfa;
    }
    .ci-agent-block-text .ci-agent-dot {
      background: #60a5fa;
    }
    .ci-agent-block-source .ci-agent-dot {
      background: #38bdf8;
    }
    .ci-agent-block-file .ci-agent-dot {
      background: #94a3b8;
    }
    .ci-agent-block-error .ci-agent-dot {
      background: #f87171;
    }
    .ci-agent-block-changes .ci-agent-dot {
      background: #34d399;
    }
    .ci-agent-block-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ci-agent-block-body p {
      margin: 0;
      white-space: pre-wrap;
      color: #111827;
    }
    .ci-agent-block-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ci-agent-block-item {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .ci-agent-pill {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: 999px;
      background: #eef2ff;
      color: #4f46e5;
      font-size: 10px;
      font-weight: 500;
    }
    .ci-agent-pill-muted {
      background: #f3f4f6;
      color: #6b7280;
    }
    .ci-agent-content {
      white-space: pre-wrap;
      word-break: break-word;
    }
    .ci-agent-content-reasoning {
      color: #4e5969;
    }
    .ci-agent-content-error {
      color: #f53f3f;
    }
    .ci-agent-paragraphs {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ci-agent-paragraphs p {
      margin: 0;
      white-space: pre-wrap;
      color: #111827;
    }
    .ci-agent-meta-list {
      display: grid;
      grid-template-columns: 80px 1fr;
      gap: 6px 10px;
      margin-top: 8px;
      font-size: 11px;
    }
    .ci-agent-meta-key {
      font-size: 10px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .ci-agent-meta-value {
      color: #111827;
      word-break: break-word;
    }
    .ci-agent-preview {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px dashed rgba(148, 163, 184, 0.4);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ci-agent-preview-title {
      font-size: 11px;
      font-weight: 600;
      color: #111827;
    }
    .ci-agent-preview-lines {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        'Liberation Mono', 'Courier New', monospace;
      font-size: 10px;
      color: #374151;
    }
    .ci-agent-preview-line {
      white-space: pre-wrap;
      word-break: break-word;
      padding: 2px 6px;
      border-radius: 6px;
      background: #f8fafc;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .ci-agent-preview-line:first-child {
      background: #fef3c7;
      border-color: rgba(251, 191, 36, 0.3);
    }
    .ci-agent-preview-empty {
      font-size: 10px;
      color: #9ca3af;
    }
    .ci-agent-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .ci-agent-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 10px;
      border-radius: 999px;
      background: #eef2ff;
      color: #4f46e5;
      font-size: 10px;
      font-weight: 500;
      text-decoration: none;
    }
    .ci-agent-chip-host {
      display: inline-flex;
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(79, 70, 229, 0.12);
      color: #4f46e5;
      font-size: 9px;
      font-weight: 500;
    }
    .ci-agent-file-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .ci-agent-file-item {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #e5e7eb;
      background: #f8fafc;
      min-width: 120px;
    }
    .ci-agent-file-title {
      font-size: 11px;
      font-weight: 600;
      color: #111827;
    }
    .ci-agent-file-meta {
      font-size: 10px;
      color: #6b7280;
      margin-top: 2px;
    }
    .ci-agent-details {
      border-radius: 10px;
      border: 1px solid rgba(15, 23, 42, 0.08);
      background: #f9fafb;
      padding: 6px 8px;
    }
    .ci-agent-details summary {
      cursor: pointer;
      font-size: 11px;
      color: #6b7280;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ci-agent-details summary::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 3px;
      background: #cbd5f5;
    }
    .ci-agent-details summary::-webkit-details-marker {
      display: none;
    }
    .ci-agent-details-preview {
      font-size: 10px;
      color: #9ca3af;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 180px;
    }
    .element-info-top {
      top: -4px;
      transform: translateY(-100%);
    }
    .element-info-bottom {
      top: calc(100% + 4px);
    }
    .element-info-top-inner {
      top: 4px;
    }
    .element-info-bottom-inner {
      bottom: 4px;
    }
    .element-info-left {
      left: 0;
      display: flex;
      justify-content: flex-start;
    }
    .element-info-right {
      right: 0;
      display: flex;
      justify-content: flex-end;
    }
    .element-name .element-title {
      color: coral;
      font-weight: bold;
    }
    .path-line {
      color: #333;
      line-height: 12px;
      margin-top: 4px;
    }
    .inspector-switch {
      position: fixed;
      z-index: 9999999999999;
      top: 50%;
      right: 24px;
      font-size: 22px;
      transform: translateY(-100%);
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgba(255, 255, 255, 0.8);
      color: #555;
      height: 32px;
      width: 32px;
      border-radius: 50%;
      box-shadow: 0px 1px 2px -2px rgba(0, 0, 0, 0.2),
        0px 3px 6px 0px rgba(0, 0, 0, 0.16),
        0px 5px 12px 4px rgba(0, 0, 0, 0.12);
      cursor: pointer;
    }
    .active-inspector-switch {
      color: #006aff;
    }
    .move-inspector-switch {
      cursor: move;
    }
    #inspector-node-tree {
      position: fixed;
      user-select: none;
      z-index: 9999999999999999;
      min-width: 300px;
      max-width: min(max(30vw, 300px), 400px);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        'Liberation Mono', 'Courier New', monospace;
      display: flex;
      flex-direction: column;
      padding: 0;

      .inspector-layer-title {
        border-bottom: 1px solid #eee;
        padding: 8px 8px 4px;
        margin-bottom: 8px;
        flex-shrink: 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
        &:hover {
          background: rgba(0, 106, 255, 0.1);
        }
      }

      .node-tree-list {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }

      .inspector-layer {
        cursor: pointer;
        position: relative;
        padding-right: 8px;
        &:hover {
          background: #fdf4bf;
        }
      }

      .path-line {
        font-size: 9px;
        color: #777;
        margin-top: 1px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      }
    }

    #node-tree-tooltip {
      position: fixed;
      box-sizing: border-box;
      z-index: 999999999999999999;
      background: rgba(0, 0, 0, 0.6);
      color: white;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      white-space: wrap;
      pointer-events: none;
      word-break: break-all;
    }
    .tooltip-top {
      transform: translateY(-100%);
    }
    .close-icon {
      cursor: pointer;
    }

    /* 设置弹窗样式 */
    .settings-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999999999999999;
      animation: fadeIn 0.2s ease-out;
    }

    .settings-modal {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      width: 90%;
      max-width: 480px;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: slideUp 0.3s ease-out;
    }

    .settings-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid #eee;
    }

    .settings-modal-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #333;
    }

    .settings-modal-close {
      background: none;
      border: none;
      font-size: 28px;
      color: #999;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .settings-modal-close:hover {
      background: #f5f5f5;
      color: #333;
    }

    .settings-modal-content {
      padding: 16px 24px;
      overflow-y: auto;
      flex: 1;
    }

    .settings-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 0;
      border-bottom: 1px solid #f5f5f5;
    }

    .settings-item:last-child {
      border-bottom: none;
    }

    .settings-label {
      display: flex;
      flex-direction: column;
      flex: 1;
      margin-right: 16px;
      cursor: pointer;
    }

    .settings-label-text {
      font-size: 15px;
      font-weight: 500;
      color: #333;
      margin-bottom: 4px;
    }

    .settings-label-desc {
      font-size: 13px;
      color: #999;
    }

    .settings-switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      flex-shrink: 0;
    }

    .settings-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .settings-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #ccc;
      transition: 0.3s;
      border-radius: 24px;
    }

    .settings-slider:before {
      position: absolute;
      content: '';
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
    }

    .settings-switch input:checked + .settings-slider {
      background-color: #006aff;
    }

    .settings-switch input:checked + .settings-slider:before {
      transform: translateX(20px);
    }

    .settings-switch input:focus + .settings-slider {
      box-shadow: 0 0 1px #006aff;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes slideUp {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `;
}

// Global notification styles
if (!document.getElementById('code-inspector-notification-styles')) {
  const notificationStyles = document.createElement('style');
  notificationStyles.id = 'code-inspector-notification-styles';
  notificationStyles.textContent = `
    .code-inspector-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 99999999999999999;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      opacity: 0;
      transform: translateY(-10px);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
    }
    .code-inspector-notification-success {
      background: hsl(143, 85%, 96%);
      color: hsl(140, 100%, 27%);
      border: 1px solid hsl(145, 92%, 91%);
    }
    .code-inspector-notification-error {
      background: hsl(0, 93%, 94%);
      color: hsl(0, 84%, 40%);
      border: 1px solid hsl(0, 93%, 94%);
    }
    .code-inspector-notification-show {
      opacity: 1;
      transform: translateY(0);
    }
  `;
  document.head.appendChild(notificationStyles);
}

if (!customElements.get('code-inspector-component')) {
  customElements.define('code-inspector-component', CodeInspectorComponent);
}
