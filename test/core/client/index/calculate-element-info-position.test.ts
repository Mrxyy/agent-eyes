// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CodeInspectorComponent } from '@/core/src/client';
import { PathName } from '@/core/src/shared';

describe('calculateElementInfoPosition', () => {
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

  const mockZeroMargins = () => {
    const original = window.getComputedStyle;
    window.getComputedStyle = vi.fn().mockReturnValue({
      getPropertyValue: vi.fn().mockReturnValue('0px'),
    }) as any;
    return () => {
      window.getComputedStyle = original;
    };
  };

  const readFixedPosition = (style?: Record<string, string>) => ({
    left: Number.parseFloat(style?.left || '0'),
    top: Number.parseFloat(style?.top || '0'),
  });

  beforeEach(async () => {
    originalClientWidth = document.documentElement.clientWidth;
    originalClientHeight = document.documentElement.clientHeight;

    component = new CodeInspectorComponent();
    component.hideConsole = true;
    document.body.appendChild(component);
    await component.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(component);
    vi.clearAllMocks();
    setViewport(originalClientWidth, originalClientHeight);
  });

  it('keeps a wide popup inside the viewport near the right edge', async () => {
    setViewport(400, 600);
    const restoreComputedStyle = mockZeroMargins();

    const target = document.createElement('div');
    target.setAttribute(PathName, '/path/file.tsx:10:5:div');
    document.body.appendChild(target);
    target.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 240,
      left: 350,
      right: 390,
      bottom: 290,
      width: 40,
      height: 50,
      x: 350,
      y: 240,
    });

    const elementInfoRef = component.shadowRoot?.getElementById('element-info');
    if (elementInfoRef) {
      elementInfoRef.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 300,
        height: 180,
        top: 0,
        left: 0,
        right: 300,
        bottom: 180,
        x: 0,
        y: 0,
      });
    }

    const result = await component.calculateElementInfoPosition(target);
    const { left, top } = readFixedPosition(result.additionStyle);

    expect(result.additionStyle?.position).toBe('fixed');
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + 300).toBeLessThanOrEqual(392);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top + 180).toBeLessThanOrEqual(592);

    restoreComputedStyle();
    document.body.removeChild(target);
  });

  it('flips upward when the target is close to the bottom edge', async () => {
    setViewport(800, 500);
    const restoreComputedStyle = mockZeroMargins();

    const target = document.createElement('div');
    target.setAttribute(PathName, '/path/file.tsx:10:5:div');
    document.body.appendChild(target);
    target.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 440,
      left: 280,
      right: 360,
      bottom: 480,
      width: 80,
      height: 40,
      x: 280,
      y: 440,
    });

    const elementInfoRef = component.shadowRoot?.getElementById('element-info');
    if (elementInfoRef) {
      elementInfoRef.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 260,
        height: 140,
        top: 0,
        left: 0,
        right: 260,
        bottom: 140,
        x: 0,
        y: 0,
      });
    }

    const result = await component.calculateElementInfoPosition(target);
    const { top } = readFixedPosition(result.additionStyle);

    expect(top).toBeGreaterThanOrEqual(8);
    expect(top + 140).toBeLessThanOrEqual(492);
    expect(top).toBeLessThan(440);

    restoreComputedStyle();
    document.body.removeChild(target);
  });

  it('still returns an in-viewport position for a tiny viewport', async () => {
    setViewport(160, 120);
    const restoreComputedStyle = mockZeroMargins();

    const target = document.createElement('div');
    target.setAttribute(PathName, '/path/file.tsx:10:5:div');
    document.body.appendChild(target);
    target.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 40,
      left: 60,
      right: 90,
      bottom: 70,
      width: 30,
      height: 30,
      x: 60,
      y: 40,
    });

    const elementInfoRef = component.shadowRoot?.getElementById('element-info');
    if (elementInfoRef) {
      elementInfoRef.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 140,
        height: 90,
        top: 0,
        left: 0,
        right: 140,
        bottom: 90,
        x: 0,
        y: 0,
      });
    }

    const result = await component.calculateElementInfoPosition(target);
    const { left, top } = readFixedPosition(result.additionStyle);

    expect(left).toBeGreaterThanOrEqual(8);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(left + 140).toBeLessThanOrEqual(152);
    expect(top + 90).toBeLessThanOrEqual(112);

    restoreComputedStyle();
    document.body.removeChild(target);
  });
});
