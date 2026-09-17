import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import NotesPage from "./pages/NotesPage";
import ProductViewerPage from "./pages/ProductViewerPage";

function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<NotesPage />} />
        <Route path="/product-viewer" element={<ProductViewerPage />} />
      </Routes>
    </>
  );
}

export default App;
