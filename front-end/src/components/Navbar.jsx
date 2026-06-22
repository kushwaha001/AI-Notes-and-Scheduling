import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav>
      <Link to="/dashboard">Dashboard</Link> |{" "}
      <Link to="/upload">Upload</Link> |{" "}
      <Link to="/calendar">Calendar</Link> |{" "}
      <Link to="/tasks">Tasks</Link> |{" "}
      <Link to="/search">Search</Link>
    </nav>
  );
}

export default Navbar;