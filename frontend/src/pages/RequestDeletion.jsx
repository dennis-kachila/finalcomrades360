import React, { useState } from 'react';
import api from '../services/api';

export default function RequestDeletion() {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const { data } = await api.post('/users/me/request-deletion', { reason });
      setMessage({ type: 'success', text: data?.message || 'Request sent.' });
    } catch (err) {
      const data = err?.response?.data
      let text = data?.message || data?.error || 'Failed to submit request.'
      
      if (data?.details?.fields) {
        text = `Validation error for: ${data.details.fields.join(', ')}`
      }
      setMessage({ type: 'error', text });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold mb-4">Request Account Deletion</h1>
      <div className="mb-4 p-3 rounded bg-yellow-50 text-yellow-800 border border-yellow-200">
        Deleting your account requires admin approval. Your account will be deactivated upon approval.
      </div>
      {message && (
        <div className={`mb-4 p-3 rounded ${message.type==='success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {message.text}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700">Reason (optional)</label>
          <textarea value={reason} onChange={(e)=>setReason(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" rows={4} placeholder="Tell us why you're leaving (optional)" />
        </div>
        <button type="submit" disabled={submitting} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
          {submitting ? 'Submitting...' : 'Submit Deletion Request'}
        </button>
      </form>
    </div>
  );
}
