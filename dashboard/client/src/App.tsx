import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import RequireAuth from './components/RequireAuth';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Tareas from './pages/Tareas';
import Granjas from './pages/Granjas';
import GranjaDetail from './pages/GranjaDetail';
import Jugadores from './pages/Jugadores';
import Proyectos from './pages/Proyectos';
import ProyectoDetail from './pages/ProyectoDetail';
import Galeria from './pages/Galeria';
import Mapa from './pages/Mapa';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/tareas" element={<Tareas />} />
          <Route path="/granjas" element={<Granjas />} />
          <Route path="/granjas/:id" element={<GranjaDetail />} />
          <Route path="/jugadores" element={<Jugadores />} />
          <Route path="/proyectos" element={<Proyectos />} />
          <Route path="/proyectos/:id" element={<ProyectoDetail />} />
          <Route path="/galeria" element={<Galeria />} />
          <Route path="/mapa" element={<Mapa />} />
        </Route>
      </Route>
    </Routes>
  );
}
