const { SupportMessage, User } = require('../models');
const { Op } = require('sequelize');

exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, subject, message, type } = req.body;
    const senderId = req.user.id;

    if (!receiverId || !message || !type) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const newMessage = await SupportMessage.create({
      senderId,
      receiverId,
      subject,
      message,
      type
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage
    });
  } catch (error) {
    console.error('Error sending support message:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otherUserId } = req.query;

    const where = {
      [Op.or]: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId }
      ]
    };

    const messages = await SupportMessage.findAll({
      where,
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email', 'phone'] },
        { model: User, as: 'receiver', attributes: ['id', 'name', 'email', 'phone'] }
      ],
      order: [['createdAt', 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Error fetching support messages:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getMyMessagesSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    const messages = await SupportMessage.findAll({
      where: {
        [Op.or]: [{ senderId: userId }, { receiverId: userId }]
      },
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name'] },
        { model: User, as: 'receiver', attributes: ['id', 'name'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Error fetching messages summary:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    await SupportMessage.update(
      { isRead: true },
      { where: { id: messageId, receiverId: userId } }
    );

    res.status(200).json({ success: true, message: 'Message marked as read' });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.sendBulkMessages = async (req, res) => {
  try {
    const { userIds, message, subject } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No recipients selected' });
    }

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message content is required' });
    }

    const messages = userIds.map(id => ({
      senderId: req.user.id,
      receiverId: id,
      message,
      subject: subject || 'Announcement',
      type: 'admin_to_user'
    }));

    await SupportMessage.bulkCreate(messages);

    res.status(201).json({
      success: true,
      message: `Successfully sent messages to ${userIds.length} users`
    });
  } catch (error) {
    console.error('Error sending bulk messages:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
