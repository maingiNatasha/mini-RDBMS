import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from './Layout'
import CreateForm from './CreateForm';
import EditForm from './EditForm';
import DeleteForm from './DeleteForm';
import { MdFormatListBulletedAdd, MdDelete } from "react-icons/md";
import { FaEdit } from "react-icons/fa";
import api from "../services/api";

function Home() {
	const userId = sessionStorage.getItem("user_id");
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [editTask, setEditTask] = useState(null);
	const [deleteTask, setDeleteTask] = useState(null);
	const [tasks, setTasks] = useState([]);
	const [loading, setLoading] = useState(Boolean(userId));
	const [error, setError] = useState("");
	const navigate = useNavigate();

	// Fetches tasks after user has created/edited/deleted a new task
	async function fetchTasks(withLoading = false) {
		if (!userId) return;
		if (withLoading) setLoading(true);

		try {
			const res = await api.get(`/user/${userId}/tasks`);
			const rows = res.data?.data ?? [];
			setTasks(Array.isArray(rows) ? rows : []);
			setError("");
		} catch (err) {
			const message = err.response?.data?.message || err.message || "Failed to load tasks.";
			setError(message);
		} finally {
			if (withLoading) setLoading(false);
		}
	}

	useEffect(() => {
		if (!userId) {
			// Navigate to login page
			navigate("/");
			return;
		}

		let alive = true;

		// Fetch tasks
		(async () => {
			try {
				const res = await api.get(`/user/${userId}/tasks`);
				const rows = res.data?.data ?? [];
				if (alive) {
					setTasks(Array.isArray(rows) ? rows : []);
					setError("");
				}
			} catch (err) {
				const message = err.response?.data?.message || err.message || "Failed to load tasks.";
				if (alive) setError(message);
			} finally {
				if (alive) setLoading(false);
			}
		})();

		return () => {
			alive = false;
		};
	}, [userId, navigate]);

	return (
		<Layout>
			<h1 className='mt-10 text-4xl font-bold'>Welcome User !</h1>
			<div className='flex flex-col gap-6 mx-10 my-10'>
				<div>
					<h3 className='mt-3 text-xl font-bold text-gray-500'>Create a new task</h3>
					<button className='mt-3 bg-gray-900 text-white font-bold px-6 py-2 rounded-md flex items-center cursor-pointer' onClick={() => setShowCreateForm(true)}>
						Create Task
						<MdFormatListBulletedAdd className='ml-4' size={26} />
					</button>
					{showCreateForm && (
						<CreateForm
							onClose={() => setShowCreateForm(false)}
							onCreated={() => fetchTasks(true)}
						/>
					)}
				</div>
				<div>
					<h3 className='mt-3 text-xl font-bold text-gray-500'>Here is a list of your current pending tasks</h3>
					<div className='mt-4 space-y-3'>
						{loading && <p className='text-gray-500'>Loading tasks...</p>}
						{error && <p className='text-red-600'>{error}</p>}
						{!loading && !error && tasks.length === 0 && (
							<p className='text-gray-500'>No tasks created yet.</p>
						)}
						{tasks.map((task) => (
							<div key={task.id} className='flex items-center justify-between rounded-lg border border-gray-300 p-4'>
								<div>
									<p className='text-sm text-gray-500'>Task ID: {task.id}</p>
									<p className='text-lg font-semibold'>{task.title}</p>
								</div>
								<div className='flex gap-2'>
									<button className='cursor-pointer' onClick={() => setEditTask(task)}><FaEdit size={26} /></button>
									<button className='cursor-pointer' onClick={() => setDeleteTask(task)}><MdDelete size={26} /></button>
								</div>
							</div>
						))}
					</div>
					{editTask && (
						<EditForm
							onClose={() => setEditTask(null)}
							onEdited={() => fetchTasks(true)}
							taskId={editTask.id}
							taskTitle={editTask.title}
						/>
					)}
					{deleteTask && (
						<DeleteForm
							onClose={() => setDeleteTask(null)}
							onDeleted={() => fetchTasks(true)}
							taskId={deleteTask.id}
						/>
					)}
				</div>
			</div>
		</Layout>
	)
}

export default Home
