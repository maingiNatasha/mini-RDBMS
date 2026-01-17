import { useState } from 'react';
import { useNavigate, Link } from "react-router-dom";
import { toast } from "react-toastify";
import { FaUserCircle } from "react-icons/fa";
import api from "../services/api";

function Register() {
    const [form, setForm] = useState({ email: "", password: "" });
	const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

	// Sets form values on change
	function handleChange(e) {
		const { name, value } = e.target;
		setForm((prev) => ({
			...prev,
			[name]: value
		}));
	}

	// Handles form submission
	async function handleSubmit(e) {
		e.preventDefault();
		if (loading) return; // Prevents repeates submits

		setLoading(true);

		try {
			const res = await api.post("/auth/register", form);
			const message = res.data.message || "Registration successful";

			// Display toast and navigate to Login page
			toast.success(message);
        	navigate("/");
		} catch (err) {
			const message = err.response?.data?.message || err.message || "Registration failed";
			toast.error(message);
		} finally {
			setLoading(false);
		}
	};

    return (
        <div className='flex items-center justify-center min-h-screen'>
            <div className='w-full max-w-sm rounded-2xl shadow-lg shadow-gray-500 p-6'>
                <div className='flex justify-center mb-6'>
                    <FaUserCircle size={60} />
                </div>
                <h2 className='text-3xl font-bold text-center mb-6'>
                    Register
                </h2>
                <form className='space-y-4' onSubmit={handleSubmit}>
                    {/* Email */}
                    <div>
                        <label className='block text-sm font-medium text-gray-700'>Email</label>
                        <input
                            name='email'
                            type='email'
                            className='mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
                            placeholder='email@test.com'
                            value={form.email}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className='block text-sm font-medium text-gray-700'>Password</label>
                        <input
                            name="password"
                            type="password"
                            className='mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
                            placeholder='********'
                            value={form.password}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    {/* Submit button */}
                    <button type="submit" className='mt-6 w-full py-2 px-4 bg-gray-900 text-white hover:bg-gray-950 rounded-lg font-semibold transition' disabled={loading}>
                        { loading ? "Registering user..." : "Register" }
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Register