import { useLocation, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Home } from "lucide-react";

// Hover style constants
const HOVER_BG = '#008C99';
const HOVER_TEXT = '#FFFFFF';
const HOVER_BORDER = '#D8E6E7';

const NotFound = () => {
  const location = useLocation();
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Seite nicht gefunden</p>
        <Link
          to="/"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border transition-all duration-200"
          style={{
            backgroundColor: isHovered ? HOVER_BG : '#c9c3b6',
            color: isHovered ? HOVER_TEXT : '#666666',
            borderColor: isHovered ? HOVER_BORDER : '#666666',
          }}
        >
          <Home className="w-4 h-4" />
          Zur Startseite
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
