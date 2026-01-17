import { Link, useNavigate } from "react-router-dom";
import { PiSignOutBold } from "react-icons/pi";

function Nav() {
    const navigate = useNavigate();

    const handleLogout = () => {
        // Remove credentials from session storage
        sessionStorage.removeItem("user_id");
        sessionStorage.removeItem("user_email");

        // Navigate back to login
        navigate("/");
    };

    return (
        <nav className="flex items-center justify-between px-6 py-4 shadow-md">
            {/* Logo */}
            <Link to="/home">
                <h1 className="font-bold text-xl">Task Manager</h1>
            </Link>
            <div className="flex items-center gap-4">
                <Link to="/home" className="font-bold">Home</Link>
                <button onClick={handleLogout} className="bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-950 transition flex items-center">
                    Logout
                    <PiSignOutBold className="ml-3" size={20} />
                </button>
            </div>
        </nav>
  );
}

export default Nav