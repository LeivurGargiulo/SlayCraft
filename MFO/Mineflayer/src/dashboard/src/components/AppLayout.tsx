import { AppShell, Burger, Group, NavLink as MantineNavLink, Title, Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';

const NAV_ITEMS = [
  { to: '/', label: 'Overview' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/workers', label: 'Workers' },
  { to: '/manager', label: 'Manager' },
];

export function AppLayout() {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const { logout } = useAuth();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
            <Title order={3}>MFO</Title>
          </Group>
          <Button variant="subtle" onClick={logout}>
            Log out
          </Button>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        {NAV_ITEMS.map((item) => (
          <MantineNavLink
            key={item.to}
            component={NavLink}
            to={item.to}
            label={item.label}
            end={item.to === '/'}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
