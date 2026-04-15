import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Mail, Phone, MapPin, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

export default function Contact() {
  const { user } = useAuth();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Attempt to load system configuration for contact details
    api.get('/platform/status')
      .then(res => {
        setConfig(res.data?.systemInfo || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Autofill name and email if user is logged in
  useEffect(() => {
    if (user) {
      setForm(prev => ({
        ...prev,
        name: user.name || '',
        email: user.email || ''
      }));
    }
  }, [user]);

  const supportEmail = config?.supportEmail || 'support@comrades360.shop';
  const supportPhone = config?.supportPhone || '+254700000000';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      await api.post('/contact', form);
      setSuccess(true);
      // Reset message field but keep name/email if logged in
      setForm(prev => ({
        ...prev,
        message: ''
      }));
      setTimeout(() => setSuccess(false), 5000);
    } catch (error) {
      console.error('[contact] Submit error:', error);
      alert(error.response?.data?.message || 'Failed to send message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Contact Us | Comrades360</title>
        <meta name="description" content="Get in touch with the Comrades360 team." />
      </Helmet>

      <div className="bg-gray-50 min-h-screen py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Contact Us</h1>
            <p className="text-lg text-gray-600">
              We're here to help! Reach out to us with any questions or concerns.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Contact Information */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Get In Touch</h2>
              <p className="text-gray-600 mb-8">
                Our support team is available from 8am to 8pm (EAT), Monday through Saturday.
                We strive to respond to all inquiries within 24 hours.
              </p>

              <div className="space-y-6">
                <div className="flex items-start">
                  <div className="bg-blue-100 p-3 rounded-full text-blue-600 mr-4">
                    <Mail size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Email Address</h3>
                    <p className="text-gray-600">{loading ? 'Loading...' : supportEmail}</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="bg-blue-100 p-3 rounded-full text-blue-600 mr-4">
                    <Phone size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Phone Number</h3>
                    <p className="text-gray-600">{loading ? 'Loading...' : supportPhone}</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="bg-blue-100 p-3 rounded-full text-blue-600 mr-4">
                    <MapPin size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Headquarters</h3>
                    <p className="text-gray-600">Nairobi, Kenya<br />University Way</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Send a Message</h2>
              
              {success ? (
                <div className="bg-green-50 text-green-700 p-4 rounded-lg font-medium text-center">
                  Thank you! Your message has been sent successfully. We will be in touch soon.
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                    <input 
                      type="text" 
                      required 
                      value={form.name}
                      onChange={e => setForm({...form, name: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input 
                      type="email" 
                      required 
                      value={form.email}
                      onChange={e => setForm({...form, email: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                      placeholder="john@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                    <textarea 
                      required 
                      rows="4"
                      value={form.message}
                      onChange={e => setForm({...form, message: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none resize-none"
                      placeholder="How can we help you?"
                    ></textarea>
                  </div>
                  <button 
                    type="submit" 
                    disabled={submitting}
                    className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Sending...' : (
                      <>
                        <Send size={18} className="mr-2" />
                        Send Message
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
