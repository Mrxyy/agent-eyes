// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CodeInspectorComponent } from '@/core/src/client';
import { PathName } from '@/core/src/shared';

describe('renderLayerPanel', () => {
  let component: CodeInspectorComponent;
  let originalClientWidth: number;
  let originalClientHeight: number;

  const setViewport = (width: number, height: number) => {
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: width,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      value: height,
      configurable: true,
    });
  };

  const createTreeNode = (name = 'div', depth = 1) => {
    const element = document.createElement(name);
    element.setAttribute(PathName, `/path/to/file.ts:10:5:${name}`);
    return {
      name,
      path: '/path/to/file.ts',
      line: 10,
      column: 5,
      children: [],
      element,
      depth,
    };
  };

  beforeEach(async () => {
    originalClientWidth = document.documentElement.clientWidth;
    originalClientHeight = document.documentElement.clientHeight;

    component = new CodeInspectorComponent();
    document.body.appendChild(component);
    await component.updateComplete;
    setViewport(1024, 768);
  });

  afterEach(() => {
    document.body.removeChild(component);
    vi.clearAllMocks();
    setViewport(originalClientWidth, originalClientHeight);
  });

  it('shows panel and sets nodeTree state', async () => {
    const nodeTree = createTreeNode();
    await component.renderLayerPanel(nodeTree, { x: 200, y: 200 });

    expect(component.showNodeTree).toBe(true);
    expect(component.nodeTree).toBe(nodeTree);
  });

  it('keeps panel x/y inside viewport near bottom-right corner', async () => {
    const nodeTree = createTreeNode();
    await component.renderLayerPanel(nodeTree, { x: 1000, y: 740 });

    const left = Number.parseFloat(component.nodeTreePosition.left || '0');
    const top = Number.parseFloat(component.nodeTreePosition.top || '0');

    expect(left).toBeGreaterThanOrEqual(8);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(left).toBeLessThanOrEqual(1016);
    expect(top).toBeLessThanOrEqual(760);
  });

  it('sets maxHeight from available viewport space', async () => {
    const nodeTree = createTreeNode();
    await component.renderLayerPanel(nodeTree, { x: 300, y: 300 });

    const maxHeight = Number.parseFloat(component.nodeTreePosition.maxHeight || '0');
    expect(maxHeight).toBeGreaterThan(0);
    expect(maxHeight).toBeLessThanOrEqual(760);
  });

  it('handles extremely small viewport with in-bounds result', async () => {
    setViewport(220, 180);
    const nodeTree = createTreeNode();
    await component.renderLayerPanel(nodeTree, { x: 210, y: 170 });

    const left = Number.parseFloat(component.nodeTreePosition.left || '0');
    const top = Number.parseFloat(component.nodeTreePosition.top || '0');
    expect(left).toBeGreaterThanOrEqual(8);
    expect(top).toBeGreaterThanOrEqual(8);
  });
});
