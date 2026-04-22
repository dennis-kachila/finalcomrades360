import { useState } from 'react';
import api from '../services/serviceApi';

const AdminPayouts = () => {
    const [sellerId, setSellerId] = useState('');
    const [payoutAmount, setPayoutAmount] = useState(0);

    const handlePayout = async () => {
        try {
            await api.post('/admin/process-payout', { sellerId, amount: payoutAmount });
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
                <label>Seller ID:</label>
                <input
                    type="text"
                    value={sellerId}
                    onChange={(e) => setSellerId(e.target.value)}
                />
            </div>
            <div>
                <label>Payout Amount:</label>
                <input
                    type="number"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                />
            </div>
            <button onClick={handlePayout}>Process Payout</button>
        </div>
    );
};

export default AdminPayouts;