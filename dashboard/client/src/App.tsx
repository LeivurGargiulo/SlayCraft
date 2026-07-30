import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import RequireAuth from './components/RequireAuth';
import Layout from './components/Layout';
import Overview from './pages/Overview';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/tareas" element={<div>Tareas (Task 14)</div>} />
          <Route path="/granjas" element={<div>Granjas (Task 15)</div>} />
          <Route path="/jugadores" element={<div>Jugadores (Task 16)</div>} />
          <Route path="/proyectos" element={<div>Proyectos (Task 17)</div>} />
          <Route path="/galeria" element={<div>Galería (Task 18)</div>} />
        </Route>
      </Route>
    </Routes>
  );
}
