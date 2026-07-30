import { useState, type SubmitEventHandler } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from '@mantine/core';
import { useAuth } from '../auth/AuthContext.js';
import { ApiError } from '../api/client.js';

export function LoginPage() {
  const { token, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  if (token !== undefined) return <Navigate to="/" replace />;

  const onSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    login(username, password)
      .catch((cause: unknown) => {
        setError(cause instanceof ApiError ? cause.message : 'Login failed');
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  return (
    <Center h="100vh">
      <Paper withBorder shadow="md" p="xl" w={360}>
        <form onSubmit={onSubmit}>
          <Stack>
            <Title order={2}>MFO Dashboard</Title>
            {error !== undefined && (
              <Alert color="red" title="Login failed">
                {error}
              </Alert>
            )}
            <TextInput
              label="Username"
              value={username}
              onChange={(event) => {
                setUsername(event.currentTarget.value);
              }}
              required
              autoFocus
            />
            <PasswordInput
              label="Password"
              value={password}
              onChange={(event) => {
                setPassword(event.currentTarget.value);
              }}
              required
            />
            <Button type="submit" loading={submitting}>
              Log in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
