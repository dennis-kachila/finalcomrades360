import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import api from '../../services/api';

export default function PrivacyPolicy() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    api.get('/platform/status')
      .then(res => setConfig(res.data?.systemInfo || null))
      .catch(() => {});
  }, []);

  const supportEmail = config?.supportEmail || 'support@comrades360.shop';

  return (
    <>
      <Helmet>
        <title>Privacy Policy | Comrades360</title>
      </Helmet>

      <div className="bg-white py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-4xl font-bold text-gray-900 mb-8 border-b pb-6">Privacy Policy</h1>
          
          <div className="prose prose-blue max-w-none text-gray-700">
            <p className="text-sm text-gray-500 mb-8">Last Updated: April 2026</p>

            <p>
              At Comrades360, we take your privacy seriously. This Privacy Policy explains how we collect, use,
              disclose, and safeguard your information when you visit our marketplace website and mobile application.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">1. Information We Collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Personal Data:</strong> Name, student email address, phone number, and campus location when you register.</li>
              <li><strong>Transaction Data:</strong> Details about payments (though we do not store full card numbers) and items purchased.</li>
              <li><strong>Usage Data:</strong> Information about how you interact with our platform (searches, clicks, favorites).</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Facilitate marketplace transactions between buyers and sellers.</li>
              <li>Verify your student status to keep the community secure.</li>
              <li>Send you order confirmations, delivery updates, and support messages.</li>
              <li>Improve platform algorithms, personalize your feed, and develop new features.</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">3. Data Sharing</h2>
            <p>
              We may share necessary information (like your delivery location and phone number) with your delivery agent or seller 
              specifically to fulfill an order. We do not sell your personal data to third-party marketers.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">4. Security</h2>
            <p>
              We implement industry-standard security measures, including encryption and secure socket layer (SSL) technology, 
              to protect your personal information. However, no electronic transmission over the internet can be guaranteed as 100% secure.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">5. Contact Us</h2>
            <p>
              If you have questions or comments about this Privacy Policy, please contact our Data Protection Office at:
              <br/>
              <strong>Email:</strong> <a href={`mailto:${supportEmail}`} className="text-blue-600">{supportEmail}</a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
