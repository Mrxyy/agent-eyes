// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CodeInspectorComponent } from '@/core/src/client';

describe('closeChat context lifecycle', () => {
  let component: CodeInspectorComponent;

  beforeEach(() => {
    component = new CodeInspectorComponent();
    document.body.appendChild(component);
  });

  afterEach(() => {
    document.body.removeChild(component);
    vi.clearAllMocks();
  });

  it('should clear selected context on server when chat closes', () => {
    const clearSpy = vi
      .spyOn(component as any, 'clearSelectedContextOnServer')
      .mockImplementation(() => {});

    (component as any).closeChat();

    expect(clearSpy).toHaveBeenCalled();
  });
});
