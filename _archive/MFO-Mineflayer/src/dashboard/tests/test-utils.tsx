import { render, type RenderOptions } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ReactElement } from 'react';

export function renderWithMantine(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: MantineProvider, ...options });
}
