import { LitElement, TemplateResult, css, html } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { PathName, DefaultPort } from '../shared';
import { formatOpenPath } from 'launch-ide';

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

interface SourceInfo {
  name: string; // tagName
  path: string;
  line: number;
  column: number;
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

interface BreadcrumbNode extends SourceInfo {
  element: HTMLElement;
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

const PopperWidth = 300;
const POPPER_MARGIN = 10; // Margin for popper positioning

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
  requirement = '';
  @state()
  agentOutput = '';
  @state()
  agentLoading = false;
  @state()
  agentError = '';
  @state()
  agentReasoning = '';
  @state()
  agentActions = '';
  @state()
  agentTrace = '';

  private agentTraceType: 'text' | 'reasoning' | '' = '';

  private agentAbortController: AbortController | null = null;

  @query('#inspector-switch')
  inspectorSwitchRef!: HTMLDivElement;

  @query('#code-inspector-container')
  codeInspectorContainerRef!: HTMLDivElement;
  @query('#element-info')
  elementInfoRef!: HTMLDivElement;
  @query('#ci-agent-input')
  agentInputRef?: HTMLTextAreaElement;
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

  // 计算 element-info 的最佳位置
  calculateElementInfoPosition = async (target: HTMLElement) => {
    const { top, right, bottom, left } = target.getBoundingClientRect();
    const browserHeight = document.documentElement.clientHeight;
    const browserWidth = document.documentElement.clientWidth;
    const marginTop = this.getDomPropertyValue(target, 'margin-top');
    const marginRight = this.getDomPropertyValue(target, 'margin-right');
    const marginBottom = this.getDomPropertyValue(target, 'margin-bottom');
    const marginLeft = this.getDomPropertyValue(target, 'margin-left');

    await nextTick();

    const { width, height } = this.elementInfoRef.getBoundingClientRect();

    // 容器的实际边界（包含 margin）
    const containerTop = top - marginTop;
    const containerRight = right + marginRight;
    const containerBottom = bottom + marginBottom;
    const containerLeft = left - marginLeft;

    // 定义八个位置的计算方法
    const positions = [
      // 外部位置
      {
        // 右下方(外部)
        vertical: 'element-info-bottom',
        horizon: 'element-info-right',
        top: containerBottom,
        left: containerLeft,
        isExternal: true,
      },
      {
        // 左下方(外部)
        vertical: 'element-info-bottom',
        horizon: 'element-info-left',
        top: containerBottom,
        left: containerRight - width,
        isExternal: true,
      },
      {
        // 右上方(外部)
        vertical: 'element-info-top',
        horizon: 'element-info-right',
        top: containerTop - height,
        left: containerLeft,
        isExternal: true,
      },
      {
        // 左上方(外部)
        vertical: 'element-info-top',
        horizon: 'element-info-left',
        top: containerTop - height,
        left: containerRight - width,
        isExternal: true,
      },
      // 内部位置
      {
        // 右下方(内部)
        vertical: 'element-info-bottom-inner',
        horizon: 'element-info-right',
        top: containerBottom - height,
        left: containerLeft,
        isExternal: false,
      },
      {
        // 左下方(内部)
        vertical: 'element-info-bottom-inner',
        horizon: 'element-info-left',
        top: containerBottom - height,
        left: containerRight - width,
        isExternal: false,
      },
      {
        // 右上方(内部)
        vertical: 'element-info-top-inner',
        horizon: 'element-info-right',
        top: containerTop,
        left: containerLeft,
        isExternal: false,
      },
      {
        // 左上方(内部)
        vertical: 'element-info-top-inner',
        horizon: 'element-info-left',
        top: containerTop,
        left: containerRight - width,
        isExternal: false,
      },
      // 超出屏幕
      {
        // 左上方(屏幕内)
        vertical: 'element-info-top-inner',
        horizon: 'element-info-left',
        top: Math.max(0, containerTop),
        left: containerRight - width,
        isExternal: false,
        additionStyle: {
          transform: `translateY(${Math.max(0, -containerTop)}px)`,
        },
      },
      {
        // 右上方(屏幕内)
        vertical: 'element-info-top-inner',
        horizon: 'element-info-right',
        top: Math.max(0, containerTop),
        left: containerRight - width,
        isExternal: false,
        additionStyle: {
          transform: `translateY(${Math.max(0, -containerTop)}px)`,
        },
      },
    ];

    // 检查位置是否超出屏幕
    const isOutOfScreen = (pos: { left: number; top: number }) => {
      return (
        pos.left < 0 ||
        pos.left + width > browserWidth ||
        pos.top < 0 ||
        pos.top + height > browserHeight
      );
    };

    for (const pos of positions) {
      const browserWidth = document.documentElement.clientWidth;
      if (pos.horizon.endsWith('left')) {
        const overflowWidth = containerLeft + width - browserWidth;
        if (overflowWidth > 0) {
          pos.additionStyle = {
            transform: `translateX(-${overflowWidth}px) ${
              pos.additionStyle?.transform || ''
            }`,
          };
        }
      } else {
        const overflowWidth = width - containerRight;
        if (overflowWidth > 0) {
          pos.additionStyle = {
            transform: `translateX(${overflowWidth}px) ${
              pos.additionStyle?.transform || ''
            }`,
          };
        }
      }
      if (!isOutOfScreen(pos)) {
        return pos;
      }
    }
    // 如果所有位置都超出屏幕，返回一个屏幕内侧的位置
    return positions[0];
  };

  // 渲染遮罩层
  renderCover = async (target: HTMLElement) => {
    if (target === this.targetNode) {
      return;
    }
    this.targetNode = target;
    // 设置 target 的位置
    const { top, right, bottom, left } = target.getBoundingClientRect();
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
      const { vertical, horizon, additionStyle } =
        await this.calculateElementInfoPosition(target);
      this.elementTipStyle = {
        vertical,
        horizon,
        visibility: 'visible',
        additionStyle,
      };
    }
  };

  private parseSourceInfoFromPath = (paths: string): SourceInfo | null => {
    if (!paths) return null;
    const segments = paths.split(':');
    if (segments.length < 4) return null;
    const name = segments[segments.length - 1];
    const column = Number(segments[segments.length - 2]);
    const line = Number(segments[segments.length - 3]);
    const path = segments.slice(0, segments.length - 3).join(':');
    if (!path || !name || Number.isNaN(line) || Number.isNaN(column)) {
      return null;
    }
    return { name, path, line, column };
  };

  private buildDomBreadcrumb = (
    nodePath: EventTarget[],
    stopDom?: HTMLElement | null
  ): BreadcrumbNode[] => {
    const nodes = nodePath.filter(
      (n): n is HTMLElement => n instanceof HTMLElement
    );
    const validNodeList = this.getValidNodeList(nodes);
    const items: BreadcrumbNode[] = [];
    // root -> target
    for (const { node } of validNodeList.reverse()) {
      const info = this.getSourceInfo(node);
      if (!info) continue;
      items.push({ ...info, element: node });
      if (stopDom && node === stopDom) break;
    }
    return items;
  };

  private getComponentFiberInfo = (dom: HTMLElement) => {
    let fiber = this.getReactFiberFromDom(dom);
    if (!fiber) {
      let parent: HTMLElement | null = dom.parentElement;
      let guard = 0;
      while (parent && guard++ < 50) {
        fiber = this.getReactFiberFromDom(parent);
        if (fiber) break;
        parent = parent.parentElement;
      }
    }
    if (!fiber) return null;

    const getFiberName = (f: any) => {
      const t = f?.elementType ?? f?.type;
      if (!t) return '';
      if (typeof t === 'string') return '';
      if (typeof t === 'function') {
        return t.displayName || t.name || '';
      }
      if (typeof t === 'object') {
        return (
          t.displayName ||
          t.name ||
          t.render?.displayName ||
          t.render?.name ||
          t.type?.displayName ||
          t.type?.name ||
          ''
        );
      }
      return '';
    };

    let current: any = fiber;
    let guard = 0;
    let fiberRootDom = null; 
    fiberRootDom = current
    while (current && guard++ < 200) {
      const name = getFiberName(current);
      console.log(current,name,"getFiberName")
      if (name) {
        const propsPath =
          current.memoizedProps?.[PathName] ??
          current.pendingProps?.[PathName];
        const sourceInfo =
          typeof propsPath === 'string'
            ? this.parseSourceInfoFromPath(propsPath)
            : null;
        const componentDom = fiberRootDom;
        return { name, sourceInfo, componentDom };
      }
      fiberRootDom =  this.getNearestDomFromFiber(current)
      current = current.return;
    }
    return null;
  };

  private findComponentFromDomPath = (nodePath: EventTarget[]) => {
    const nodes = nodePath.filter(
      (n): n is HTMLElement => n instanceof HTMLElement
    );
    const isComponent = (name: string) => /^[A-Z]/.test(name);
    for (const node of nodes) {
      const info = this.getSourceInfo(node);
      if (info && isComponent(info.name)) {
        return { info, element: node };
      }
    }
    return null;
  };

  private buildDomCodeBreadcrumb = (
    nodePath: EventTarget[]
  ): BreadcrumbNode[] => {
    const component = this.findComponentFromDomPath(nodePath);
    if (!component) return [];

    const items: BreadcrumbNode[] = [];
    items.push({
      ...component.info,
      element: component.element,
    });

    const pathNodes: HTMLElement[] = [];
    const target = (nodePath.find((n) => n instanceof HTMLElement) ||
      component.element) as HTMLElement;
    let cursor: HTMLElement | null = target;
    let guard = 0;
    while (cursor && guard++ < 200) {
      pathNodes.unshift(cursor);
      if (cursor === component.element) break;
      cursor = cursor.parentElement as HTMLElement | null;
    }

    for (const node of pathNodes) {
      const nodeInfo = this.getSourceInfo(node);
      if (!nodeInfo) continue;
      items.push({ ...nodeInfo, element: node });
    }

    return items;
  };

  private getReactFiberFromDom = (dom: HTMLElement): any => {
    try {
      const anyDom = dom as any;
      for (const key in anyDom) {
        if (key.startsWith('__reactFiber$')) {
          return anyDom[key];
        }
      }
      for (const key in anyDom) {
        if (key.startsWith('__reactInternalInstance$')) {
          return anyDom[key];
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  private getNearestDomFromFiber = (fiber: any): HTMLElement | null => {
    let current = fiber;
    let guard = 0;
    while (current && guard++ < 80) {
      if (current.stateNode instanceof HTMLElement) {
        return current.stateNode;
      }
      current = current.child;
    }
    return null;
  };

  private buildReactBreadcrumb = (dom: HTMLElement): BreadcrumbNode[] => {
    const info = this.getComponentFiberInfo(dom);
    if (!info) return [];
    const componentDom = info.componentDom || dom;

    console.log(info,componentDom,"componentDom")

    const fallbackNodeInfo =
      this.getSourceInfo(dom) ||
      (this.targetNode ? this.getSourceInfo(this.targetNode) : null);
    const componentNodeInfo = info.sourceInfo || fallbackNodeInfo;
    if (!componentNodeInfo) return [];

    const items: BreadcrumbNode[] = [];
    items.push({
      ...componentNodeInfo,
      name: info.name,
      element: componentDom,
    });

    const pathNodes: HTMLElement[] = [];
    let current: HTMLElement | null = dom;
    let guard = 0;
    while (current && guard++ < 200) {
      pathNodes.unshift(current);
      if (current === componentDom) break;
      current = current.parentElement as HTMLElement | null;
    }

    for (const node of pathNodes) {
      const nodeInfo = this.getSourceInfo(node);
      if (!nodeInfo) continue;
      items.push({ ...nodeInfo, element: node });
    }

    return items;
  };

  private trimBreadcrumbByPath = (
    items: BreadcrumbNode[],
    path?: string
  ): BreadcrumbNode[] => {
    if (!path || items.length === 0) return items;
    let end = items.length - 1;
    let start = end;
    while (start >= 0 && items[start].path === path) {
      start--;
    }
    const sliced = items.slice(start + 1, end + 1);
    return sliced.length > 0 ? sliced : items;
  };

  private buildBreadcrumb = (
    nodePath: EventTarget[],
    dom?: HTMLElement | null,
    componentInfo?: { componentDom?: HTMLElement | null }
  ): BreadcrumbNode[] => {
    const reactItems = dom ? this.buildReactBreadcrumb(dom) : [];
    if (reactItems.length > 0) return reactItems;

    const stopDom = componentInfo?.componentDom || null;
    const domCodeItems = this.buildDomCodeBreadcrumb(nodePath);
    if (domCodeItems.length > 0) return domCodeItems;
    const domItems = this.buildDomBreadcrumb(nodePath, stopDom);
    return this.trimBreadcrumbByPath(domItems, this.element?.path);
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

  private openChat = async (nodePath: EventTarget[], dom?: HTMLElement) => {
    this.chatOpen = true;
    this.requirement = '';
    this.agentOutput = '';
    this.agentError = '';
    const targetDom = dom || this.targetNode ;
    const componentInfo = targetDom
      ? this.getComponentFiberInfo(targetDom)
      : null;
    if (componentInfo?.componentDom) {
      this.targetNode = targetDom;
    }
    this.breadcrumb = this.buildBreadcrumb(
      nodePath,
      targetDom || undefined,
      componentInfo || undefined
    );
    this.breadcrumbIndex = Math.max(0, this.breadcrumb.length - 1);
    await this.updateComplete;
    if (componentInfo?.componentDom && targetDom) {
      await this.renderCover(targetDom);
    } else if (this.targetNode) {
      const { vertical, horizon, additionStyle } =
        await this.calculateElementInfoPosition(this.targetNode);
      this.elementTipStyle = {
        vertical,
        horizon,
        visibility: 'visible',
        additionStyle,
      };
    }
    this.scrollActiveBreadcrumbIntoView();
    this.agentInputRef?.focus?.();
  };

  private closeChat = () => {
    this.chatOpen = false;
    this.requirement = '';
    this.agentOutput = '';
    this.agentError = '';
    this.breadcrumb = [];
    this.breadcrumbIndex = 0;
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
    this.targetNode = null;
    this.show = false;
    this.removeGlobalCursorStyle();
    document.body.style.userSelect = this.preUserSelect;
    this.preUserSelect = '';
  };

  renderLayerPanel = (
    nodeTree: TreeNode,
    { x, y }: { x: number; y: number }
  ) => {
    const browserWidth = document.documentElement.clientWidth;
    const browserHeight = document.documentElement.clientHeight;

    const rightToViewPort = browserWidth - x;
    const bottomToViewPort = browserHeight - y;
    let position: Position = {};

    if (rightToViewPort < x) {
      position['right'] = rightToViewPort + 'px';
      // 检测是否横向一定超出屏幕
      if (x < PopperWidth) {
        position['transform'] = `translateX(${PopperWidth - x}px)`;
      }
    } else {
      position['left'] = x + 'px';
      // 检测是否横向一定超出屏幕
      if (rightToViewPort < PopperWidth) {
        position['transform'] = `translateX(-${
          PopperWidth - rightToViewPort
        }px)`;
      }
    }

    if (bottomToViewPort < y) {
      position['bottom'] = bottomToViewPort + 'px';
      position['maxHeight'] = `${y - POPPER_MARGIN}px`;
    } else {
      position['top'] = y + 'px';
      position['maxHeight'] = `${browserHeight - y - POPPER_MARGIN}px`;
    }
    this.nodeTreePosition = position;
    this.nodeTree = nodeTree;
    this.showNodeTree = true;
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
      const nodePath = e.composedPath() as HTMLElement[];
      const validNodeList = this.getValidNodeList(nodePath);
      let targetNode;
      for (const { node, isAstro } of validNodeList) {
        if (isAstro) {
          targetNode = node;
          break;
        }
        if (!targetNode) {
          targetNode = node;
        } else if (this.isSamePositionNode(targetNode, node)) {
          // 优先寻找组件被调用处源码
          targetNode = node;
        }
      }
      if (targetNode) {
        this.renderCover(targetNode);
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
    e.stopPropagation();
    e.preventDefault();

    if (this.wheelThrottling) {
      return;
    }

    this.wheelThrottling = true;

    const nodePath = e.composedPath() as HTMLElement[];
    const validNodeList = this.getValidNodeList(nodePath);
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

    if (this.chatOpen) {
      if (!clickedInInfo && !clickedInNodeTree && !clickedInSwitch) {
        this.closeChat();
        this.removeCover(true);
      }
      return;
    }

    if (this.isTracking(e) || this.open) {
      if (this.show) {
        // 阻止冒泡
        e.stopPropagation();
        // 阻止默认事件
        e.preventDefault();
        // 触发功能
        this.trackCode();
        void this.openChat(
          composedPath,
          (this.targetNode || (e.target as HTMLElement)) ?? undefined
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
    let root: TreeNode;

    let depth = 1;
    let preNode = null;

    for (const element of nodePath.reverse()) {
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
        root = node;
      }
      preNode = node;
    }

    return root!;
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
        // 唤醒 vscode
        this.trackCode();
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
    const node = this.breadcrumb[index];
    this.forceOutlineNextCover = true;
    console.log(node,"none")
    await this.renderCover(node.element);
    this.scrollActiveBreadcrumbIntoView();
  };

  private gotoParentBreadcrumb = () => {
    if (this.breadcrumbIndex <= 0) return;
    void this.jumpBreadcrumb(this.breadcrumbIndex - 1);
  };

  private gotoChildBreadcrumb = () => {
    if (this.breadcrumbIndex >= this.breadcrumb.length - 1) return;
    void this.jumpBreadcrumb(this.breadcrumbIndex + 1);
  };

  private cancelAgent = () => {
    if (this.agentAbortController) {
      this.agentAbortController.abort();
      this.agentAbortController = null;
    }
    this.agentLoading = false;
  };

  private buildClientContextPrompt = () => {
    const dom = this.targetNode;
    const tagName = dom?.tagName?.toLowerCase?.() || '';
    const firstClass = dom?.classList?.[0] || '';
    const className = (dom as any)?.className || '';
    const textContent = (dom?.textContent || '').trim().replace(/\s+/g, ' ');
    const text = textContent.length > 200 ? `${textContent.slice(0, 200)}…` : textContent;

    const domPath = this.breadcrumb.map((b) => ({
      name: b.name,
      label: b.name,
      path: b.path,
      line: b.line,
      column: b.column,
    }));
    const domPathLabels = domPath.map((n) => n.label).join(' > ');
    const elementLoc = `${this.element.path}:${this.element.line}:${this.element.column}`;
    const domLabel = [tagName, firstClass].filter(Boolean).join('.');

    const contextPrompt =
      `当前选中的元素对应的 DOM 元素为: ${domLabel}，className为: ${className}，纯文字内容为: ${text}。` +
      `\n在代码中的定位为 ${elementLoc}，对应的 JSX/TSX 标签为 <${this.element.name} ...>。` +
      `\n从根节点到选中节点的路径为: ${domPathLabels}。`;

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
    const requirement = this.requirement.trim();
    if (!requirement || this.agentLoading) return;

    this.agentLoading = true;
    this.agentError = '';
    this.agentOutput = '';
    this.agentReasoning = '';
    this.agentActions = '';
    this.agentTrace = '';
    this.agentTraceType = '';

    const controller = new AbortController();
    this.agentAbortController = controller;

    const { contextPrompt, dom, domPath } = this.buildClientContextPrompt();
    const payload = {
      requirement,
      contextPrompt,
      file: this.element.path,
      line: this.element.line,
      column: this.element.column,
      elementName: this.element.name,
      dom,
      domPath,
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
              const type = parsed?.type;
              if (!type && parsed?.delta) {
                this.agentOutput += String(parsed.delta);
                continue;
              }
              if (type === 'text-delta') {
                this.agentOutput += String(parsed.delta || '');
                if (this.agentTraceType !== 'text') {
                  this.agentTrace += '\n[assistant]\n';
                  this.agentTraceType = 'text';
                }
                this.agentTrace += String(parsed.delta || '');
              } else if (type === 'reasoning-delta') {
                this.agentReasoning += String(parsed.delta || '');
                if (this.agentTraceType !== 'reasoning') {
                  this.agentTrace += '\n[reasoning]\n';
                  this.agentTraceType = 'reasoning';
                }
                this.agentTrace += String(parsed.delta || '');
              } else if (type === 'tool-call') {
                const name = parsed.toolName || 'tool';
                const args = parsed.args ? JSON.stringify(parsed.args) : '';
                this.agentActions += `\n> 调用 ${name} ${args}\n`;
                this.agentTraceType = '';
                this.agentTrace += `\n[tool-call] ${name} ${args}\n`;
              } else if (type === 'tool-result') {
                const name = parsed.toolName || 'tool';
                const result = parsed.result
                  ? JSON.stringify(parsed.result)
                  : '';
                this.agentActions += `> 结果 ${name} ${result}\n`;
                this.agentTraceType = '';
                this.agentTrace += `\n[tool-result] ${name} ${result}\n`;
              } else if (type === 'error') {
                this.agentError = String(parsed.message || 'error');
                this.agentTraceType = '';
                this.agentTrace += `\n[error] ${String(parsed.message || '')}\n`;
              }
            } catch {
              this.agentOutput += data;
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
          this.agentOutput = text;
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
          this.agentOutput = xhr.responseText || this.agentOutput;
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

  protected firstUpdated(): void {
    // 初始化内部状态
    this.internalLocate = this.locate;
    this.internalCopy = !!this.copy;
    this.internalTarget = !!this.target;

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
  }

  disconnectedCallback(): void {
    // Detach all event listeners
    this.detachEventListeners();
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
        <div
          id="element-info"
          class="element-info ${this.elementTipStyle.vertical} ${this
            .elementTipStyle.horizon} ${this.elementTipStyle.visibility}"
          style=${styleMap({
            width: (this.chatOpen ? 520 : PopperWidth) + 'px',
            maxWidth: '100vw',
            ...this.elementTipStyle.additionStyle,
          })}
        >
          <div
            class="element-info-content ${this.chatOpen ? 'ci-panel' : 'ci-tip'}"
          >
            ${this.chatOpen
              ? html`
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
                                @click="${() => this.jumpBreadcrumb(part.index)}"
                                >${part.node.name}</span
                              >
                              ${i < arr.length - 1
                                ? html`<span class="ci-sep">›</span>`
                                : ''}
                            `
                      )}
                    </div>
                    <div class="ci-breadcrumb-controls">
                      <span
                        class="ci-arrow ${this.breadcrumbIndex <= 0
                          ? 'disabled'
                          : ''}"
                        title="上一级"
                        @click="${this.gotoParentBreadcrumb}"
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
                        class="ci-arrow ${this.breadcrumbIndex >=
                        this.breadcrumb.length - 1
                          ? 'disabled'
                          : ''}"
                        title="下一级"
                        @click="${this.gotoChildBreadcrumb}"
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
                    </div>
                  </div>
                  <div class="ci-agent">
                    <textarea
                      id="ci-agent-input"
                      class="ci-agent-input"
                      placeholder="描述你的修改需求，按 Ctrl/⌘ + Enter 发送"
                      .value="${this.requirement}"
                      @input="${(e: Event) => {
                        this.requirement = (
                          e.target as HTMLTextAreaElement
                        ).value;
                      }}"
                      @keydown="${(e: KeyboardEvent) => {
                        const isSubmit =
                          (e.ctrlKey || e.metaKey) && e.key === 'Enter';
                        if (isSubmit) {
                          e.preventDefault();
                          void this.submitAgent();
                        }
                      }}"
                    ></textarea>
                    <div class="ci-agent-footer">
                      <div
                        class="ci-agent-status ${this.agentError
                          ? 'error'
                          : ''}"
                      >
                        ${this.agentLoading
                          ? '生成中…'
                          : this.agentError || ''}
                      </div>
                      <div class="ci-agent-actions">
                        ${this.agentLoading
                          ? html`
                              <span
                                class="ci-action"
                                title="取消"
                                @click="${this.cancelAgent}"
                                >${html`<svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    d="M6 6l12 12M18 6L6 18"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                  />
                                </svg>`}</span
                              >
                            `
                          : html`
                              <span
                                class="ci-action ${this.requirement.trim()
                                  ? ''
                                  : 'disabled'}"
                                title="发送"
                                @click="${() => void this.submitAgent()}"
                                >${html`<svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    d="M22 2L11 13"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                  />
                                  <path
                                    d="M22 2L15 22l-4-9-9-4 20-7z"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                  />
                                </svg>`}</span
                              >
                            `}
                        <span
                          class="ci-action"
                          title="关闭"
                          @click="${() => {
                            this.closeChat();
                            this.removeCover(true);
                          }}"
                          >${html`<svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M18 6 6 18"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                            <path
                              d="m6 6 12 12"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>`}</span
                        >
                      </div>
                    </div>
                    ${this.agentTrace
                      ? html`<pre class="ci-agent-output ci-agent-trace">
                          ${this.agentTrace}
                        </pre>`
                      : ''}
                    ${this.agentReasoning
                      ? html`<pre class="ci-agent-output ci-agent-reasoning">
                          ${this.agentReasoning}
                        </pre>`
                      : ''}
                    ${this.agentActions
                      ? html`<pre class="ci-agent-output ci-agent-actions">
                          ${this.agentActions}
                        </pre>`
                      : ''}
                    ${this.agentOutput
                      ? html`<pre class="ci-agent-output">${this.agentOutput}</pre>`
                      : ''}
                  </div>
                `
              : html`<span class="ci-tip-tag">${this.element.name}</span>`}
          </div>
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
      pointer-events: auto;
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
    .ci-panel,
    .ci-panel * {
      pointer-events: auto;
    }
    .ci-breadcrumb-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #f2f3f5;
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
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .ci-arrow {
      width: 16px;
      height: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #4e5969;
      cursor: pointer;
      border-radius: 6px;
      user-select: none;
    }
    .ci-arrow:hover {
      background: rgba(0, 0, 0, 0.06);
      color: #1d2129;
    }
    .ci-arrow.disabled {
      opacity: 0.35;
      cursor: not-allowed;
      pointer-events: none;
    }
    .ci-agent {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }
    .ci-agent-input {
      width: 100%;
      min-height: 78px;
      max-height: 40vh;
      resize: vertical;
      border: 1px solid #e5e6eb;
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 12px;
      outline: none;
      box-sizing: border-box;
      font-family: inherit;
      background: #fff;
    }
    .ci-agent-input:focus {
      border-color: #006aff;
      box-shadow: 0 0 0 2px rgba(0, 106, 255, 0.15);
    }
    .ci-agent-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .ci-agent-status {
      font-size: 11px;
      color: #86909c;
      min-height: 14px;
    }
    .ci-agent-status.error {
      color: #f53f3f;
    }
    .ci-agent-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .ci-action {
      width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #4e5969;
      cursor: pointer;
      border-radius: 8px;
      user-select: none;
    }
    .ci-action:hover {
      background: rgba(0, 0, 0, 0.06);
      color: #1d2129;
    }
    .ci-action.disabled {
      opacity: 0.35;
      cursor: not-allowed;
      pointer-events: none;
    }
    .ci-agent-output {
      margin: 0;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #e5e6eb;
      background: #f7f8fa;
      color: #1d2129;
      max-height: 220px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 11px;
      line-height: 1.45;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        'Liberation Mono', 'Courier New', monospace;
    }
    .ci-agent-reasoning {
      background: #f2f7ff;
    }
    .ci-agent-actions {
      background: #f6f6f6;
      color: #4e5969;
    }
    .ci-agent-trace {
      background: #111827;
      color: #e5e7eb;
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
