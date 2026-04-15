import React from 'react';
import { Helmet } from 'react-helmet-async';

export default function TermsOfService() {
  return (
    <>
      <Helmet>
        <title>Terms of Service | Comrades360</title>
      </Helmet>

      <div className="bg-white py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-4xl font-bold text-gray-900 mb-8 border-b pb-6">Terms of Service</h1>
          
          <div className="prose prose-blue max-w-none text-gray-700">
            <p className="text-sm text-gray-500 mb-8">Last Updated: April 2026</p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing and using Comrades360, you accept and agree to be bound by the terms and provision of this agreement. 
              In addition, when using these particular services, you shall be subject to any posted guidelines or rules applicable to such services.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">2. Description of Service</h2>
            <p>
              Comrades360 provides a marketplace platform ("Service") for university students to buy, sell, and discover goods and services. 
              We act solely as a facilitator connecting buyers and sellers. We do not own or sell the items listed (unless specifically branded as Comrades360 Direct).
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">3. User Conduct</h2>
            <p>You agree to use our platform strictly for lawful purposes. You agree not to take any action that might compromise the security of the site, render the site inaccessible to others, or otherwise cause damage to the site or its content.</p>
            <ul className="list-disc pl-6 my-4 space-y-2">
              <li>You must be a current student or verified vendor to use certain active selling features.</li>
              <li>You agree not to post false, inaccurate, misleading, defamatory, or libelous content.</li>
              <li>You are responsible for maintaining the confidentiality of your account password.</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">4. Transactions between Users</h2>
            <p>
              Comrades360 is not a party to the transactions between buyers and sellers. While we help facilitate resolution processes 
              and hold funds through escrow when applicable, the actual contract for sale is directly between the buyer and seller.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">5. Disclaimer of Warranties</h2>
            <p>
              The service is provided on an "AS IS" and "AS AVAILABLE" basis. Comrades360 makes no representations or warranties of any kind, express or implied, as to the operation of their services, or the information, content, materials, or products included on the platform.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
