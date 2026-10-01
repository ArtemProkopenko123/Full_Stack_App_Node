import { NavLink } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`;

export default function NavBar() {
  return (
    <nav className="flex gap-2 border-b p-3">
      <NavLink to="/" end className={linkClass}>
        Notes
      </NavLink>
      <NavLink to="/product-viewer" className={linkClass}>
        Product Viewer
      </NavLink>
      <NavLink to="/big-data" className={linkClass}>
        Big Data
      </NavLink>
      <NavLink to="/graph" className={linkClass}>
        Graph
      </NavLink>
      <NavLink to="/table" className={linkClass}>
        Table
      </NavLink>
      <NavLink to="/map" className={linkClass}>
        Map
      </NavLink>
    </nav>
  );
}
