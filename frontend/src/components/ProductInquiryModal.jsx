import React, { useState } from 'react';
import { X, Send, MessageCircle, Phone, Mail } from 'lucide-react';
import api from '../services/api';

const ProductInquiryModal = ({ product, isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const inquiryData = {
        ...formData,
        productId: product?.id,
        productName: product?.name,
        inquiryType: 'product_inquiry'
      };

      await api.post('/support/inquiries', inquiryData);
      
      onSuccess?.(inquiryData);
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: '',
        message: ''
      });
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to send inquiry. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-full">
              <MessageCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Product Inquiry</h2>
              <p className="text-sm text-gray-600">
                Ask about: {product?.name || 'Product'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Your Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="your@email.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="+254 xxx xxx xxx"
            />
          </div>

          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
              Subject *
            </label>
            <input
              type="text"
              id="subject"
              name="subject"
              required
              value={formData.subject}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="What would you like to know?"
            />
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
              Message *
            </label>
            <textarea
              id="message"
              name="message"
              required
              rows={4}
              value={formData.message}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Please provide details about your inquiry..."
            />
          </div>

          {/* Quick Questions */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Quick questions:</p>
            <div className="space-y-1 text-xs text-gray-600">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ 
                  ...prev, 
                  subject: 'Product Availability',
                  message: 'Is this product currently available in stock?'
                }))}
                className="block w-full text-left hover:text-blue-600 transition-colors"
              >
                • Is this product currently available?
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ 
                  ...prev, 
                  subject: 'Shipping Information',
                  message: 'What are the shipping options and delivery time for this product?'
                }))}
                className="block w-full text-left hover:text-blue-600 transition-colors"
              >
                • What are the shipping options?
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ 
                  ...prev, 
                  subject: 'Product Features',
                  message: 'Can you provide more details about the product features?'
                }))}
                className="block w-full text-left hover:text-blue-600 transition-colors"
              >
                • Can you provide more details about features?
              </button>
            </div>
          </div>

          {/* Contact Options */}
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Prefer to contact us directly?</p>
            <div className="grid grid-cols-2 gap-2">
              <a
                href="tel:+254700000000"
                className="flex items-center gap-2 px-3 py-2 bg-white rounded border text-sm hover:bg-gray-50 transition-colors"
              >
                <Phone className="w-4 h-4 text-green-600" />
                Call Us
              </a>
              <a
                href="mailto:support@comrades360.com"
                className="flex items-center gap-2 px-3 py-2 bg-white rounded border text-sm hover:bg-gray-50 transition-colors"
              >
                <Mail className="w-4 h-4 text-blue-600" />
                Email Us
              </a>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !formData.name || !formData.email || !formData.subject || !formData.message}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Inquiry
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 text-center text-xs text-gray-500 rounded-b-lg">
          We'll respond to your inquiry within 24 hours during business days.
        </div>
      </div>
    </div>
  );
};

export default ProductInquiryModal;