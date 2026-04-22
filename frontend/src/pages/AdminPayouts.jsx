import { useState } from 'react';
import api from '../services/serviceApi';

const AdminPayouts = () => {
    const [transactionIdsRaw, setTransactionIdsRaw] = useState('');

    const handlePayout = async () => {
        try {
            const transactionIds = transactionIdsRaw
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean)
                .map((id) => Number(id))
                .filter((id) => Number.isFinite(id));

            if (transactionIds.length === 0) {
                alert('Enter at least one valid transaction ID.');
                return;
            }

            await api.post('/finance/process-payout', { transactionIds });
            alert('Payout processed successfully');
        } catch (error) {
            console.error('Error processing payout:', error);
            alert('Failed to process payout');
        }
    };

    return (
        <div>
            <h1>Admin Payouts</h1>
            <div>
                <label>Transaction IDs (comma-separated):</label>
                <input
                    type="text"
                    value={transactionIdsRaw}
                    onChange={(e) => setTransactionIdsRaw(e.target.value)}
                />
            </div>
            <button onClick={handlePayout}>Process Payout</button>
        </div>
    );
};

export default AdminPayouts;