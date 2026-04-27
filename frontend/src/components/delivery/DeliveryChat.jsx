import React, { useState, useEffect, useRef } from 'react';
import { FaPaperPlane, FaUser, FaRobot, FaCheckDouble, FaSpinner } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { getSocket } from '../../services/socket';

const DeliveryChat = ({ orderId, receiverId, receiverName }) => {
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [otherPersonTyping, setOtherPersonTyping] = useState(false);
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const socket = getSocket();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        fetchMessages();

        if (socket) {
            socket.on('delivery_message_receive', (message) => {
                if (message.orderId === orderId) {
                    setMessages(prev => [...prev, message]);
                    scrollToBottom();
                    // Mark as read if it's for me
                    if (message.receiverId === user.id) {
                        api.patch(`/delivery/messages/${orderId}/read`).catch(console.error);
                    }
                }
            });

            socket.on('delivery_message_sent', (message) => {
                if (message.orderId === orderId) {
                    // Message confirmed by server
                }
            });

            socket.on('delivery_typing_receive', (data) => {
                if (data.orderId === orderId && data.senderId === receiverId) {
                    setOtherPersonTyping(data.isTyping);
                    scrollToBottom();
                }
            });
        }

        return () => {
            if (socket) {
                socket.off('delivery_message_receive');
                socket.off('delivery_message_sent');
                socket.off('delivery_typing_receive');
            }
        };
    }, [orderId, socket]);

    useEffect(scrollToBottom, [messages]);

    const fetchMessages = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/delivery/messages/${orderId}`);
            setMessages(res.data);
            // Mark read
            await api.patch(`/delivery/messages/${orderId}/read`);
        } catch (error) {
            console.error('Failed to fetch messages:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || sending || !receiverId) return;

        const messageData = {
            orderId,
            senderId: user.id,
            receiverId,
            message: newMessage.trim(),
            type: 'text'
        };

        setSending(true);
        try {
            // We now rely on the REST call to both persist the message 
            // and trigger the socket broadcast from the server side.
            // This prevents the "double message" bug.
            const res = await api.post('/delivery/messages', messageData);
            setMessages(prev => {
                // Prevent duplicates if socket already added it
                if (prev.find(m => m.id === res.data.id)) return prev;
                return [...prev, res.data];
            });
            setNewMessage('');
        } catch (error) {
            console.error('Failed to send message:', error);
            const errorMsg = error.response?.data?.error || 'Failed to send message';
            toast.error(errorMsg);
        } finally {
            setSending(false);
        }
    };

    const handleInputChange = (e) => {
        setNewMessage(e.target.value);

        if (socket && socket.connected) {
            // Clear existing timeout
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

            // Emit typing start
            socket.emit('delivery_typing', {
                orderId,
                senderId: user.id,
                receiverId,
                isTyping: true
            });

            // Set timeout to emit typing stop
            typingTimeoutRef.current = setTimeout(() => {
                socket.emit('delivery_typing', {
                    orderId,
                    senderId: user.id,
                    receiverId,
                    isTyping: false
                });
            }, 3000);
        }
    };

    return (
        <div className="flex flex-col h-[350px] bg-gray-50 rounded-xl border border-gray-200 overflow-hidden shadow-inner">
            {/* Header */}
            <div className="bg-white px-4 py-2 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <FaUser size={14} />
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-gray-800">{receiverName || 'Delivery Agent'}</h4>
                        <span className="text-[10px] text-green-500 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Online
                        </span>
                    </div>
                </div>
            </div>

            {/* Message List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <FaSpinner className="animate-spin text-blue-500" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center py-10">
                        <FaRobot className="mx-auto text-gray-300 text-3xl mb-2" />
                        <p className="text-xs text-gray-400">No messages yet. Send a follow-up instructions or ask for update.</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMe = msg.senderId === user.id;
                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${isMe
                                    ? 'bg-blue-600 text-white rounded-tr-none'
                                    : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                                    }`}>
                                    <p className="leading-relaxed">{msg.message}</p>
                                    <div className={`text-[9px] mt-1 flex items-center gap-1 ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        {isMe && <FaCheckDouble className={msg.isRead ? 'text-green-300' : 'text-blue-200'} />}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                {otherPersonTyping && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none px-3 py-2 shadow-sm">
                            <div className="flex gap-1">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {!receiverId ? (
                <div className="p-3 bg-amber-50 border-t border-amber-100">
                    <p className="text-[10px] text-amber-700 font-bold text-center italic">
                        ⚠️ Cannot send messages: No recipient identified for this order.
                    </p>
                </div>
            ) : (
                <form onSubmit={handleSendMessage} className="p-3 bg-white border-t flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={handleInputChange}
                        placeholder="Type a follow-up message..."
                        className="flex-1 bg-gray-100 border-none rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        disabled={sending}
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim() || sending}
                        className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 transition disabled:opacity-50 shadow-md transform active:scale-95"
                    >
                        {sending ? <FaSpinner className="animate-spin" /> : <FaPaperPlane className="ml-0.5" />}
                    </button>
                </form>
            )}
        </div>
    );
};

export default DeliveryChat;
