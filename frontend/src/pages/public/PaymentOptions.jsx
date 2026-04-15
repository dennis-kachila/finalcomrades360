import React from 'react';
import { Helmet } from 'react-helmet-async';
import { CreditCard, Wallet, Smartphone } from 'lucide-react';

export default function PaymentOptions() {
  return (
    <>
      <Helmet>
        <title>Payment Options | Comrades360</title>
      </Helmet>

      <div className="bg-gray-50 min-h-screen py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Payment Options</h1>
            <p className="text-lg text-gray-600">Secure, fast, and convenient payment methods tailored for students.</p>
          </div>

          <div className="space-y-6">
            
            {/* M-Pesa */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center md:items-start gap-6">
              <div className="bg-green-100 p-4 rounded-xl text-green-600 shrink-0">
                <Smartphone size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">M-Pesa Express (STK Push)</h2>
                <p className="text-gray-600 mb-4">
                  The fastest and most popular way to pay. Simply select M-Pesa at checkout, enter your Safaricom number, 
                  and a prompt will appear on your phone to enter your PIN. No extra manual input required!
                </p>
                <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg text-sm text-gray-600">
                  <span className="font-bold text-gray-800">Status:</span> Highly Recommended
                </div>
              </div>
            </div>

            {/* In-App Wallet */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center md:items-start gap-6">
              <div className="bg-blue-100 p-4 rounded-xl text-blue-600 shrink-0">
                <Wallet size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Comrades360 Wallet</h2>
                <p className="text-gray-600 mb-4">
                  Top up your internal wallet or use your earnings from selling/referrals to pay for new purchases instantly.
                  Zero transaction fees and immediate confirmation!
                </p>
                <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg text-sm text-gray-600">
                  <span className="font-bold text-gray-800">Status:</span> Available for all verified users
                </div>
              </div>
            </div>

            {/* Offline / Cash */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center md:items-start gap-6">
              <div className="bg-orange-100 p-4 rounded-xl text-orange-600 shrink-0">
                <CreditCard size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Cash on Delivery (Limited)</h2>
                <p className="text-gray-600 mb-4">
                  For your security and the safety of our student agents, Cash on Delivery is strictly limited. 
                  It is only available for specific sellers who explicitly enable it for their on-campus pickups.
                </p>
                <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg text-sm text-gray-600">
                  <span className="font-bold text-gray-800">Status:</span> Restricted Availability
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
