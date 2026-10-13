// frontend/src/components/NotesPanel.jsx
// Type-and-save interaction notes for one customer (optimistic insert).
import { useState } from 'react';
import { addNote, deleteNote } from '../services/api';
import { formatDate, formatRelative } from '../utils/format';

const NOTE_TYPES = [
  { value: 'note', label: 'Note', icon: '📝' },
  { value: 'call', label: 'Call', icon: '📞' },
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'meeting', label: 'Meeting', icon: '🤝' },
  { value: 'other', label: 'Other', icon: '•' },
];
const TYPE_BY_VALUE = Object.fromEntries(NOTE_TYPES.map((t) => [t.value, t]));

export default function NotesPanel({ customerId, initialNotes = [] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState('');
  const [type, setType] = useState('note');
  const [error, setError] = useState(null);

  async function save(e) {
    e?.preventDefault();
    const content = draft.trim();
    if (!content) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic = { id: tempId, note_type: type, content, created_at: new Date().toISOString(), saving: true };
    setNotes((list) => [optimistic, ...list]);
    setDraft('');
    setError(null);

    try {
      const saved = await addNote(customerId, { content, note_type: type });
      setNotes((list) => list.map((n) => (n.id === tempId ? saved : n)));
    } catch (err) {
      setNotes((list) => list.filter((n) => n.id !== tempId));
      setDraft(content); // give the text back so nothing is lost
      setError(err.message);
    }
  }

  async function remove(note) {
    if (!window.confirm('Delete this note?')) return;
    setNotes((list) => list.filter((n) => n.id !== note.id));
    try {
      await deleteNote(note.id);
    } catch (err) {
      setNotes((list) => [note, ...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setError(err.message);
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2>Interaction notes</h2>
        <span className="muted small">{notes.length} total</span>
      </div>

      <form className="note-form" onSubmit={save}>
        <div className="chip-row" role="radiogroup" aria-label="Interaction type">
          {NOTE_TYPES.slice(0, 4).map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={type === t.value}
              className={`chip ${type === t.value ? 'active' : ''}`}
              onClick={() => setType(t.value)}
            >
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        <textarea
          className="input textarea"
          rows={3}
          placeholder="What happened? e.g. Called about delayed shipment, offered 10% off next order…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(e);
          }}
          maxLength={5000}
          aria-label="Note"
        />
        <div className="row-between">
          <span className="muted small">Ctrl + Enter to save</span>
          <button type="submit" className="btn primary" disabled={!draft.trim()}>Save note</button>
        </div>
        {error && <div className="inline-error" role="alert">Couldn't save: {error}</div>}
      </form>

      {notes.length === 0 ? (
        <p className="muted small empty-hint">No interactions logged yet.</p>
      ) : (
        <ul className="timeline">
          {notes.map((n) => {
            const t = TYPE_BY_VALUE[n.note_type] || TYPE_BY_VALUE.other;
            return (
              <li key={n.id} className={n.saving ? 'is-saving' : ''}>
                <span className="timeline-icon" aria-hidden="true">{t.icon}</span>
                <div className="timeline-body">
                  <div className="row-between">
                    <span className="small">
                      <strong>{t.label}</strong>
                      <span className="muted" title={formatDate(n.created_at, true)}>
                        {' · '}{n.saving ? 'saving…' : formatRelative(n.created_at)}
                      </span>
                      {n.created_by && <span className="muted"> · {n.created_by}</span>}
                    </span>
                    {!n.saving && (
                      <button className="icon-btn" onClick={() => remove(n)} aria-label="Delete note" title="Delete">
                        ✕
                      </button>
                    )}
                  </div>
                  <p className="note-content">{n.content}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
