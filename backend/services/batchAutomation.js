const cron = require('node-cron');
const { Batch } = require('../models');

/**
 * Batch Automation Service
 * This service checks for automated batches that have reached their endTime
 * and automatically creates the next batch in the cycle.
 */

const startBatchAutomation = () => {
    console.log('🚀 Batch Automation Service started (Checking every minute)');

    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

            // Find all batches with automation enabled that are not cancelled
            const automatedBatches = await Batch.findAll({
                where: {
                    isAutomated: true,
                    status: ['Scheduled', 'In Progress']
                }
            });

            for (const batch of automatedBatches) {
                // Check if this batch has "ended" (currentTime matched or exceeded endTime)
                // Handling midnight rollover: a batch has ended if currently past endTime 
                // but (if it spans midnight) not yet back to startTime.
                const hasEnded = (batch.startTime < batch.endTime) 
                    ? (currentTimeStr >= batch.endTime)
                    : (currentTimeStr >= batch.endTime && currentTimeStr < batch.startTime);

                if (hasEnded) {
                    await handleBatchCycle(batch);
                }
            }
        } catch (error) {
            console.error('[Batch Automation] Error in cron job:', error);
        }
    });
};

const handleBatchCycle = async (oldBatch) => {
    try {
        // Mark the old batch as Completed
        oldBatch.status = 'Completed';
        oldBatch.isAutomated = false; // Automation moves to the next batch
        await oldBatch.save();

        // Calculate next batch times
        // 10 minutes gap logic
        const [endH, endM] = oldBatch.endTime.split(':').map(Number);

        const nextStart = new Date();
        nextStart.setHours(endH, endM + 10, 0); // Start 10 mins after end

        // Calculate duration and delivery offset from previous batch to maintain consistency
        const [startH, startM] = oldBatch.startTime.split(':').map(Number);
        const [delH, delM] = oldBatch.expectedDelivery.split(':').map(Number);

        // Duration in minutes
        const durationMin = (endH * 60 + endM) - (startH * 60 + startM);
        // Delivery offset in minutes from endTime
        const deliveryOffsetMin = (delH * 60 + delM) - (endH * 60 + endM);

        const nextEnd = new Date(nextStart.getTime() + durationMin * 60000);
        const nextDelivery = new Date(nextEnd.getTime() + deliveryOffsetMin * 60000);

        const formatTime = (date) => {
            return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        };

        const nextBatchName = generateNextName(oldBatch.name);

        // Create the new batch
        const newBatch = await Batch.create({
            name: nextBatchName,
            startTime: formatTime(nextStart),
            endTime: formatTime(nextEnd),
            expectedDelivery: formatTime(nextDelivery),
            status: 'Scheduled',
            isAutomated: true // Continue the cycle
        });

        console.log(`[Batch Automation] Cycled batch "${oldBatch.name}" -> "${newBatch.name}"`);
    } catch (error) {
        console.error(`[Batch Automation] Error cycling batch ${oldBatch.id}:`, error);
    }
};

const generateNextName = (oldName) => {
    // Basic logic to increment "Batch 1" -> "Batch 2" etc.
    const match = oldName.match(/(.*)(\d+)$/);
    if (match) {
        const prefix = match[1];
        const num = parseInt(match[2], 10);
        return `${prefix}${num + 1}`;
    }
    return `${oldName} (Next)`;
};

module.exports = { startBatchAutomation };
