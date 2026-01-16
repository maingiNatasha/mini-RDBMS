import { Routes, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Login from './components/Login';
import Register from './components/Register';
import Home from './components/Home';

function App() {
	return (
		<>
			<Routes>
				<Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
				<Route path="/home" element={<Home />} />
			</Routes>
			<ToastContainer />
		</>
	)
}

export default App