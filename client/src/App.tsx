import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import NotesPage from "./pages/NotesPage";
import ProductViewerPage from "./pages/ProductViewerPage";
import BigDataPage from "./pages/BigDataPage";
import GraphPage from "./pages/GraphPage";
import TablePage from "./pages/TablePage";

function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<NotesPage />} />
        <Route path="/product-viewer" element={<ProductViewerPage />} />
        <Route path="/big-data" element={<BigDataPage />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/table" element={<TablePage />} />
      </Routes>
    </>
  );
}

export default App;
