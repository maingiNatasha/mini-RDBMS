import { useState } from 'react';
import { toast } from "react-toastify";
import api from "../services/api";

function CreateForm({ onClose, onCreated }) {
    const [form, setForm] = useState({ title: "" });
    const [loading, setLoading] = useState(false);
    const userId = sessionStorage.getItem("user_id");

    // Set form values on change
    function handleChange(e) {
        const { name, value } = e.target;
        setForm((prev) => ({
            ...prev,
            [name]: value
        }));
    }

    // Handle submit
    async function handleSubmit(e) {
        e.preventDefault();
        if (!userId) return;

        setLoading(true);

        try {
            const res = await api.post("/task", { user_id: Number(userId), title: form.title });
            const message = res.data.message || "Task created successfully";

            // Fetch tasks
            if (onCreated) await onCreated(res.data?.data);

            // Close modal and display toast
            onClose();
            toast.success(message);
        } catch (err) {
            const message = err.response?.data?.message || err.message || "Failed to create task.";
            toast.error(message);
            console.error(message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center">
            <div className="bg-white p-6 rounded-xl w-full max-w-md">
                <h2 className='font-bold text-lg'>Create Task</h2>
                <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                    <div>
                        <label className="block font-medium text-gray-700">Title</label>
                        <input
                            type="text"
                            name="title"
                            value={form.title}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Task title"
                            onChange={handleChange}
                            required
                        />
                    </div>
                    <div className="flex justify-center gap-4 mt-6">
                        <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 cursor-pointer" disabled={loading}>
                            Cancel
                        </button>
                        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-white cursor-pointer" disabled={loading}>
                            Create
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default CreateForm
