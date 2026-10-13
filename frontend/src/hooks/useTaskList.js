// frontend/src/hooks/useTaskList.js
import { useState } from 'react';
import { createFollowUp, deleteFollowUp, updateFollowUp } from '../services/api';

/**
 * Local task list with optimistic updates: the UI changes immediately and
 * rolls back (with an error message) if the API call fails.
 */
export function useTaskList(initialTasks = []) {
  const [tasks, setTasks] = useState(initialTasks);
  const [error, setError] = useState(null);

  const patchLocal = (id, changes) =>
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...changes } : t)));

  async function update(task, changes) {
    setError(null);
    patchLocal(task.id, changes);
    try {
      patchLocal(task.id, await updateFollowUp(task.id, changes));
    } catch (err) {
      patchLocal(task.id, task); // roll back
      setError(err.message);
    }
  }

  return {
    tasks,
    error,
    clearError: () => setError(null),

    /** Throws on failure so the form can keep its input. */
    async add(task) {
      setError(null);
      const saved = await createFollowUp(task);
      setTasks((list) => [...list, saved]);
      return saved;
    },

    toggle: (task) => update(task, { status: task.status === 'completed' ? 'pending' : 'completed' }),

    reschedule: (task, dueDate) => update(task, { due_date: dueDate, status: 'pending' }),

    async remove(task) {
      setError(null);
      setTasks((list) => list.filter((t) => t.id !== task.id));
      try {
        await deleteFollowUp(task.id);
      } catch (err) {
        setTasks((list) => [...list, task]);
        setError(err.message);
      }
    },
  };
}
