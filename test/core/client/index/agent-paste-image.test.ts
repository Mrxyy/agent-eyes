// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CodeInspectorComponent } from '@/core/src/client';

describe('agent paste image', () => {
  let component: CodeInspectorComponent;

  beforeEach(async () => {
    component = new CodeInspectorComponent();
    component.show = true;
    component.chatOpen = true;
    component.agentUi = {};
    document.body.appendChild(component);
    await component.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(component);
    vi.clearAllMocks();
  });

  it('adds pasted image to attachments', async () => {
    const textarea = component.shadowRoot?.querySelector(
      '#ci-agent-input'
    ) as HTMLTextAreaElement;
    const file = new File(['img'], 'pasted.png', { type: 'image/png' });
    vi.spyOn(component as any, 'readFileAsDataUrl').mockResolvedValue(
      'data:image/png;base64,aW1n'
    );

    const event = new Event('paste', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
    });

    textarea.dispatchEvent(event);
    await Promise.resolve();
    await component.updateComplete;

    expect(event.defaultPrevented).toBe(true);
    expect(component.agentFiles).toHaveLength(1);
    expect(component.agentFiles[0].name).toBe('pasted.png');
    expect(component.agentFiles[0].isImage).toBe(true);
  });

  it('keeps normal paste behavior when clipboard has no image', async () => {
    const textarea = component.shadowRoot?.querySelector(
      '#ci-agent-input'
    ) as HTMLTextAreaElement;

    const event = new Event('paste', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: [
          {
            kind: 'string',
            type: 'text/plain',
            getAsFile: () => null,
          },
        ],
      },
    });

    textarea.dispatchEvent(event);
    await Promise.resolve();
    await component.updateComplete;

    expect(event.defaultPrevented).toBe(false);
    expect(component.agentFiles).toHaveLength(0);
  });

  it('does not render agent composer without agent config', async () => {
    document.body.removeChild(component);

    component = new CodeInspectorComponent();
    component.show = true;
    component.chatOpen = true;
    document.body.appendChild(component);
    await component.updateComplete;

    expect(component.shadowRoot?.querySelector('#ci-agent-input')).toBeNull();
    expect(
      component.shadowRoot?.querySelector('.ci-agent-icon-button')
    ).toBeNull();
    expect(component.agentFiles).toHaveLength(0);
    expect(
      component.shadowRoot?.querySelector('.ci-agent-attachments')
    ).toBeNull();
    expect(component.shadowRoot?.querySelector('.ci-agent-close')).toBeNull();
    expect(component.shadowRoot?.querySelector('#ci-agent-log')).toBeNull();
  });
});
