import { PathName } from '../shared';

export interface SourceInfo {
  name: string; // tagName
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

type ValidNodeItem = { node: HTMLElement; isAstro: boolean };

type SourceInfoGetter = (node: HTMLElement) => SourceInfo | null;
type ValidNodeListGetter = (nodes: HTMLElement[]) => ValidNodeItem[];

export const parseSourceInfoFromPath = (paths: string): SourceInfo | null => {
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

const getReactFiberFromDom = (dom: HTMLElement): any => {
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

const getNearestDomFromFiber = (fiber: any): HTMLElement | null => {
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

export const getComponentFiberInfo = (
  dom: HTMLElement
): ComponentFiberInfo | null => {
  const list = getComponentFiberInfoList(dom);
  return list.length > 0 ? list[0] : null;
};

export const getComponentFiberInfoList = (
  dom: HTMLElement
): ComponentFiberInfo[] => {
  let fiber = getReactFiberFromDom(dom);
  if (!fiber) {
    let parent: HTMLElement | null = dom.parentElement;
    let guard = 0;
    while (parent && guard++ < 50) {
      fiber = getReactFiberFromDom(parent);
      if (fiber) break;
      parent = parent.parentElement;
    }
  }
  if (!fiber) return [];

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

  const list: ComponentFiberInfo[] = [];
  let current: any = fiber;
  let guard = 0;
  let fiberRootDom = null;
  fiberRootDom = current;
  while (current && guard++ < 200) {
    const name = getFiberName(current);
    console.log(current, name, 'getFiberName');
    if (name) {
      const propsPath =
        current.memoizedProps?.[PathName] ?? current.pendingProps?.[PathName];
      const sourceInfo =
        typeof propsPath === 'string'
          ? parseSourceInfoFromPath(propsPath)
          : null;
      const componentDom = fiberRootDom;
      list.push({ name, sourceInfo, componentDom });
    }
    fiberRootDom = getNearestDomFromFiber(current);
    current = current.return;
  }
  return list;
};

export const buildDomBreadcrumb = (
  nodePath: EventTarget[],
  stopDom: HTMLElement | null | undefined,
  getValidNodeList: ValidNodeListGetter,
  getSourceInfo: SourceInfoGetter
): BreadcrumbNode[] => {
  const nodes = nodePath.filter(
    (n): n is HTMLElement => n instanceof HTMLElement
  );
  const validNodeList = getValidNodeList(nodes);
  const items: BreadcrumbNode[] = [];
  // root -> target
  for (const { node } of validNodeList.reverse()) {
    const info = getSourceInfo(node);
    if (!info) continue;
    items.push({ ...info, element: node });
    if (stopDom && node === stopDom) break;
  }
  return items;
};

export const findComponentFromDomPath = (
  nodePath: EventTarget[],
  getSourceInfo: SourceInfoGetter
): { info: SourceInfo; element: HTMLElement } | null => {
  const nodes = nodePath.filter(
    (n): n is HTMLElement => n instanceof HTMLElement
  );
  const isComponent = (name: string) => /^[A-Z]/.test(name);
  for (const node of nodes) {
    const info = getSourceInfo(node);
    if (info && isComponent(info.name)) {
      return { info, element: node };
    }
  }
  return null;
};

export const buildDomCodeBreadcrumb = (
  nodePath: EventTarget[],
  getSourceInfo: SourceInfoGetter
): BreadcrumbNode[] => {
  const component = findComponentFromDomPath(nodePath, getSourceInfo);
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
    const nodeInfo = getSourceInfo(node);
    if (!nodeInfo) continue;
    items.push({ ...nodeInfo, element: node });
  }

  return items;
};

export const buildReactBreadcrumb = (
  dom: HTMLElement,
  getSourceInfo: SourceInfoGetter,
  targetNode?: HTMLElement | null,
  componentInfo?: ComponentFiberInfo | null
): BreadcrumbNode[] => {
  const info = componentInfo || getComponentFiberInfo(dom);
  if (!info) return [];
  const componentDom = info.componentDom || dom;

  console.log(info, componentDom, 'componentDom');

  const fallbackNodeInfo =
    getSourceInfo(dom) || (targetNode ? getSourceInfo(targetNode) : null);
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
    const nodeInfo = getSourceInfo(node);
    if (!nodeInfo) continue;
    items.push({ ...nodeInfo, element: node });
  }

  return items;
};

export const trimBreadcrumbByPath = (
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

export const buildBreadcrumb = (
  nodePath: EventTarget[],
  dom: HTMLElement | null | undefined,
  componentInfo: ComponentFiberInfo | null | undefined,
  deps: {
    getValidNodeList: ValidNodeListGetter;
    getSourceInfo: SourceInfoGetter;
    elementPath?: string;
    targetNode?: HTMLElement | null;
  }
): BreadcrumbNode[] => {
  const reactItems = dom
    ? buildReactBreadcrumb(
        dom,
        deps.getSourceInfo,
        deps.targetNode,
        componentInfo || null
      )
    : [];
  if (reactItems.length > 0) return reactItems;

  const stopDom = componentInfo?.componentDom || null;
  const domCodeItems = buildDomCodeBreadcrumb(nodePath, deps.getSourceInfo);
  if (domCodeItems.length > 0) return domCodeItems;
  const domItems = buildDomBreadcrumb(
    nodePath,
    stopDom,
    deps.getValidNodeList,
    deps.getSourceInfo
  );
  return trimBreadcrumbByPath(domItems, deps.elementPath);
};
