const { Batch } = require('../models');

// Create a new batch
exports.createBatch = async (req, res) => {
    try {
        const { name, startTime, endTime, expectedDelivery } = req.body;

        if (!name || !startTime || !endTime || !expectedDelivery) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const batch = await Batch.create({
            name,
            startTime,
            endTime,
            expectedDelivery,
            status: 'Scheduled',
            isAutomated: req.body.isAutomated || false
        });

        res.status(201).json({
            success: true,
            message: 'Batch created successfully',
            batch
        });
    } catch (error) {
        console.error('Error creating batch:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get all batches
exports.getAllBatches = async (req, res) => {
    try {
        const batches = await Batch.findAll({
            order: [['createdAt', 'DESC']]
        });

        res.status(200).json({
            success: true,
            batches
        });
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get active batches (Scheduled or In Progress)
exports.getActiveBatches = async (req, res) => {
    try {
        const { Op, fn, col, where } = require('sequelize');
        const nairobiTime = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Africa/Nairobi',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(new Date());
        
        const currentTimeStr = nairobiTime.replace(':', ':'); // Ensure standard HH:mm format
        
        console.log(`[BatchDebug] Nairobi Time: ${currentTimeStr}`);

        const normalizeTime = (value) => {
            if (!value) return null;
            const raw = String(value).trim();
            const match = raw.match(/^(\d{1,2}):(\d{2})/);
            if (!match) return null;
            const hh = String(Math.min(23, Math.max(0, Number(match[1])))).padStart(2, '0');
            const mm = String(Math.min(59, Math.max(0, Number(match[2])))).padStart(2, '0');
            return `${hh}:${mm}`;
        };

        const rawStatusCandidates = [
            'Scheduled',
            'In Progress',
            'scheduled',
            'in progress',
            'in_progress',
            'active'
        ];

        const candidates = await Batch.findAll({
            where: {
                status: { [Op.in]: rawStatusCandidates }
            },
            order: [['startTime', 'ASC']]
        });

        const batches = candidates.filter((batch) => {
            const normalizedStatus = String(batch.status || '').trim().toLowerCase().replace(/_/g, ' ');

            // Legacy records might store "active" directly; treat as active regardless of time window.
            if (normalizedStatus === 'active') return true;

            const start = normalizeTime(batch.startTime);
            const end = normalizeTime(batch.endTime);

            // If time fields are missing/invalid, don't hide the batch unexpectedly.
            if (!start || !end) return true;

            let isMatch = false;
            if (start <= end) {
                isMatch = currentTimeStr >= start && currentTimeStr <= end;
            } else {
                // Handle midnight rollover (e.g., 23:00 to 01:00)
                isMatch = currentTimeStr >= start || currentTimeStr <= end;
            }
            return isMatch;
        });

        res.status(200).json({
            success: true,
            batches
        });
    } catch (error) {
        console.error('Error fetching active batches:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Update a batch (general)
exports.updateBatch = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, startTime, endTime, expectedDelivery, status } = req.body;

        const batch = await Batch.findByPk(id);
        if (!batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        if (name) batch.name = name;
        if (startTime) batch.startTime = startTime;
        if (endTime) batch.endTime = endTime;
        if (expectedDelivery) batch.expectedDelivery = expectedDelivery;
        if (status) batch.status = status;
        if (req.body.isAutomated !== undefined) batch.isAutomated = req.body.isAutomated;

        await batch.save();

        res.status(200).json({
            success: true,
            message: 'Batch updated successfully',
            batch
        });
    } catch (error) {
        console.error('Error updating batch:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Update batch status
exports.updateBatchStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['Scheduled', 'In Progress', 'Completed', 'Cancelled'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const batch = await Batch.findByPk(id);
        if (!batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        batch.status = status;
        await batch.save();

        res.status(200).json({
            success: true,
            message: 'Batch status updated successfully',
            batch
        });
    } catch (error) {
        console.error('Error updating batch status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Toggle batch automation
exports.toggleAutomation = async (req, res) => {
    try {
        const { id } = req.params;
        const batch = await Batch.findByPk(id);
        if (!batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        batch.isAutomated = !batch.isAutomated;
        await batch.save();

        res.status(200).json({
            success: true,
            message: `Automation ${batch.isAutomated ? 'enabled' : 'disabled'} successfully`,
            batch
        });
    } catch (error) {
        console.error('Error toggling batch automation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Delete a batch
exports.deleteBatch = async (req, res) => {
    try {
        const { id } = req.params;
        const batch = await Batch.findByPk(id);

        if (!batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        await batch.destroy();

        res.status(200).json({
            success: true,
            message: 'Batch deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting batch:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
