import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { App } from './App.js';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('missing #root element');

createRoot(rootElement).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="auto">
      <Notifications />
      <App />
    </MantineProvider>
  </StrictMode>,
);
