const { getIO } = require('../realtime/socket');

/**
 * Mirror an OTP to a specific socket session for automatic prefilling.
 * Only works if the user is on the same device/browser and has an active socket connection.
 * 
 * @param {string} socketId - The Socket.IO ID of the client session.
 * @param {string} otp - The 6-digit OTP code.
 * @param {string} [type='registration'] - The type of OTP (for frontend context).
 */
const mirrorOtpToSocket = (socketId, otp, type = 'registration') => {
  if (!socketId) return;

  try {
    const io = getIO();
    if (io) {
      console.log(`[OTP-Mirror] Mirroring ${type} OTP to socket ${socketId}`);
      io.to(socketId).emit('otp:received', {
        otp,
        type,
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error('[OTP-Mirror] Failed to mirror OTP to socket:', err.message);
  }
};

module.exports = {
  mirrorOtpToSocket
};
