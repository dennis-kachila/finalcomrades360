import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { 
  MessageSquare, 
  Send, 
  User, 
  Headphones,
  Clock
} from 'lucide-react';
import { supportApi } from '../../services/api';

export default function SupportChat() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async () => {
    try {
      const response = await supportApi.getSummary();
      // For user, getSummary returns all messages related to them
      setMessages(response.data.data.reverse()); // Show in chronological order
    } catch (err) {
      console.error('Error loading support messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      setSending(true);
      // For users, they always send to Admin (receiverId 1 as placeholder or dynamic)
      // On backend, we can handle receiverId for admin messages
      await supportApi.sendMessage({
        receiverId: 1, // Default Admin ID
        message: newMessage,
        type: 'user_to_admin',
        subject: 'User Inquiry'
      });
      setNewMessage('');
      loadMessages();
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSending(false);
    }
  };

  if (loading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Support Chat | Comrades360</title>
      </Helmet>

      <div className="max-w-4xl mx-auto py-8 px-4 h-[calc(100vh-100px)] flex flex-col">
        <div className="flex items-center mb-6">
          <div className="bg-blue-600 p-3 rounded-xl text-white mr-4 shadow-lg shadow-blue-100">
            <Headphones size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Support Chat</h1>
            <p className="text-gray-500 text-sm font-medium">Chat directly with our support team</p>
          </div>
        </div>

        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col mb-4">
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50">
            {messages.length === 0 ? (
              <div className="text-center py-20">
                <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300 shadow-sm">
                  <MessageSquare size={32} />
                </div>
                <h3 className="text-lg font-bold text-gray-900">No messages yet</h3>
                <p className="text-gray-500 max-w-xs mx-auto">Send a message below to start a conversation with our support team.</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.type === 'user_to_admin' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex flex-col ${msg.type === 'user_to_admin' ? 'items-end' : 'items-start'} max-w-[85%]`}>
                    <div
                      className={`p-4 rounded-2xl shadow-sm ${msg.type === 'user_to_admin'
                          ? 'bg-blue-600 text-white rounded-tr-none'
                          : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'
                        }`}
                    >
                      <p className="text-sm font-medium leading-relaxed">{msg.message}</p>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 mt-1 flex items-center px-1 uppercase tracking-widest">
                      <Clock size={10} className="mr-1" />
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="How can we help you today?"
                className="flex-1 bg-gray-50 border-none rounded-xl px-5 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !newMessage.trim()}
                className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-100 active:scale-95"
              >
                <Send size={20} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
