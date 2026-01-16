import { useState } from 'react'
import { toast } from "react-toastify";
import api from "../services/api";

function DeleteForm({ onClose, onDeleted, taskId }) {
    const [loading, setLoading] = useState(false);

    // Handle delete
    async function handleDelete(e) {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await api.delete(`/task/${taskId}`);
            const message = res.data.message || "Task deleted successfully";

            // Fetch tasks
            if (onDeleted) await onDeleted(res.data?.data);

            // Close modal and display toast
            onClose();
            toast.success(message);
        } catch (err) {
            const message = err.response?.data?.message || err.message || "Failed to delete task.";
            toast.error(message);
            console.error(message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center">
            <div className="bg-white p-6 rounded-xl w-full max-w-md">
                <h2 className='font-bold text-lg'>Delete Task</h2>
                    <h3 className='mt-2'>Are you sure you want to delete this task?</h3>
                    <div className="flex justify-center gap-4 mt-6">
                        <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 cursor-pointer" disabled={loading}>
                            Cancel
                        </button>
                        <button type="button" onClick={handleDelete} className="rounded-lg bg-gray-900 px-4 py-2 text-white cursor-pointer" disabled={loading}>
                            Delete
                        </button>
                    </div>
            </div>
        </div>
    )
}

export default DeleteForm