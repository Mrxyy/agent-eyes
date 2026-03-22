// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CodeInspectorComponent } from '@/core/src/client';

describe('breadcrumb copy button', () => {
  let component: CodeInspectorComponent;

  beforeEach(async () => {
    component = new CodeInspectorComponent();
    component.show = true;
    component.chatOpen = true;
    document.body.appendChild(component);
    await component.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(component);
    vi.clearAllMocks();
  });

  it('copies the active breadcrumb path', async () => {
    component.breadcrumb = [
      {
        name: 'Parent',
        path: '/src/Parent.tsx',
        line: 10,
        column: 2,
        element: document.createElement('div')
      },
      {
        name: 'Child',
        path: '/src/Child.tsx',
        line: 20,
        column: 4,
        element: document.createElement('div')
      }
    ];
    component.breadcrumbIndex = 1;
    await component.updateComplete;

    const copySpy = vi
      .spyOn(component, 'copyToClipboard')
      .mockImplementation(() => {});

    const button = component.shadowRoot?.querySelector(
      '.ci-copy-action'
    ) as HTMLButtonElement;

    button.click();

    expect(copySpy).toHaveBeenCalledWith('/src/Child.tsx');
  });

  it('falls back to the selected element path when breadcrumb is empty', async () => {
    component.breadcrumb = [];
    component.element = {
      name: 'div',
      path: '/src/App.tsx',
      line: 12,
      column: 6
    };
    await component.updateComplete;

    const copySpy = vi
      .spyOn(component, 'copyToClipboard')
      .mockImplementation(() => {});

    const button = component.shadowRoot?.querySelector(
      '.ci-copy-action'
    ) as HTMLButtonElement;

    button.click();

    expect(copySpy).toHaveBeenCalledWith('/src/App.tsx');
  });
});
