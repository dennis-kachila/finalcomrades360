import React from 'react';
import { Helmet } from 'react-helmet-async';

export default function ShippingReturns() {
  return (
    <>
      <Helmet>
        <title>Shipping & Returns | Comrades360</title>
      </Helmet>

      <div className="bg-white py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-4xl font-bold text-gray-900 mb-8 border-b pb-6">Shipping & Returns</h1>
          
          <div className="prose prose-blue max-w-none text-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">1. Delivery Service</h2>
            <p>
              We pride ourselves on an ultra-fast campus delivery network powered by student agents.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Campus Deliveries:</strong> Most campus orders are delivered within 1-2 hours depending on agent availability and seller processing time.</li>
              <li><strong>Fast Food:</strong> Fast food deliveries are prioritized and usually fulfilled within 20-45 minutes.</li>
              <li><strong>Rates:</strong> Delivery rates are dynamically calculated based on the distance between the seller's location and your delivery address.</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">2. Order Tracking</h2>
            <p>
              Once your order is confirmed by the seller, a delivery agent will be assigned. You will receive a tracking link 
              where you can watch the agent's progress and communicate with them directly in real-time.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">3. Return Policy</h2>
            <p>
              Because our marketplace connects independent student sellers with buyers, return policies may vary slightly by seller. 
              However, our platform guarantees the following baseline protection:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Valid Returns:</strong> You may request a return within 48 hours of delivery if the item is significantly not as described, damaged, or the wrong item was sent.</li>
              <li><strong>Food Items:</strong> For safety and hygienic reasons, fast food and perishable items cannot be returned. If there is a massive issue with your order, please contact support immediately for a potential refund.</li>
              <li><strong>Return Process:</strong> Go to your order history and click "Request Return". A support agent will review the request and, if approved, coordinate the reverse logistics.</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">4. Refunds</h2>
            <p>
              Approved refunds are credited back to your Comrades360 Wallet or directly reversed to your M-Pesa account. 
              Wallet refunds are instant, while M-Pesa reversals may take 2-5 business days depending on the carrier.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
